use std::sync::Arc;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::process::{Child, ChildStdin, ChildStdout, Command};
use tokio::sync::{broadcast, mpsc, Mutex};

#[derive(Debug, Clone)]
pub enum InputEvent {
    Data(Vec<u8>),
    Resize { rows: u16, cols: u16 },
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(tag = "type")]
pub enum OutputEvent {
    Data { data: Vec<u8> },
    InputRequested { prompt: String, input_type: InputType },
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum InputType {
    Confirm,
    Text,
    Password,
    Choice,
}

pub struct ChildManager {
    child: Child,
    stdin: Arc<Mutex<ChildStdin>>,
    stdout: ChildStdout,
    broadcast_tx: broadcast::Sender<Vec<u8>>,
    input_rx: mpsc::Receiver<InputEvent>,
    pending_output: String,
}

impl ChildManager {
    pub async fn spawn(
        command: String,
        args: Vec<String>,
        current_dir: Option<String>,
        broadcast_tx: broadcast::Sender<Vec<u8>>,
        input_rx: mpsc::Receiver<InputEvent>,
    ) -> anyhow::Result<Self> {
        tracing::info!(
            "Spawning child process: {} {:?} in directory: {:?}",
            command,
            args,
            current_dir
        );

        let mut cmd = Command::new(&command);
        cmd.args(&args)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::inherit()); // Let stderr pass through for debugging

        // Set working directory if provided
        if let Some(ref dir) = current_dir {
            cmd.current_dir(dir);
        }

        let mut child = cmd.spawn().map_err(|e| {
            anyhow::anyhow!(
                "Failed to spawn '{}' in directory '{:?}': {}. Is the command installed and is the directory valid?",
                command,
                current_dir,
                e
            )
        })?;

        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| anyhow::anyhow!("Failed to capture stdin"))?;

        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| anyhow::anyhow!("Failed to capture stdout"))?;

        tracing::info!("Child process spawned successfully (PID: {:?})", child.id());

        Ok(Self {
            child,
            stdin: Arc::new(Mutex::new(stdin)),
            stdout,
            broadcast_tx,
            input_rx,
            pending_output: String::new(),
        })
    }

    /// Detect if output looks like an input prompt
    fn detect_input_request(text: &str) -> Option<(String, InputType)> {
        let trimmed = text.trim_end();
        let last_line = trimmed.lines().last().unwrap_or("");
        
        // Common prompt patterns
        if last_line.ends_with("(y/n)") || last_line.ends_with("(Y/n)") || last_line.ends_with("(y/N)") {
            return Some((last_line.to_string(), InputType::Confirm));
        }
        if last_line.ends_with("?") && last_line.len() < 200 {
            return Some((last_line.to_string(), InputType::Text));
        }
        if last_line.to_lowercase().contains("password") && last_line.ends_with(":") {
            return Some((last_line.to_string(), InputType::Password));
        }
        if last_line.ends_with(":") && last_line.len() < 100 {
            return Some((last_line.to_string(), InputType::Text));
        }
        
        None
    }

    pub async fn run(&mut self) -> anyhow::Result<()> {
        let mut buf = vec![0u8; 8192];

        loop {
            tokio::select! {
                // Read from child stdout and broadcast to clients
                result = self.stdout.read(&mut buf) => {
                    match result {
                        Ok(0) => {
                            // EOF - child stdout closed
                            tracing::info!("Child stdout closed (EOF)");
                            break;
                        }
                        Ok(n) => {
                            tracing::trace!("Read {} bytes from child stdout", n);

                            // Try to detect input prompts
                            if let Ok(text) = std::str::from_utf8(&buf[..n]) {
                                self.pending_output.push_str(text);
                                // Keep only last 1KB for prompt detection
                                if self.pending_output.len() > 1024 {
                                    // Find a valid char boundary
                                    let mut start = self.pending_output.len() - 1024;
                                    while !self.pending_output.is_char_boundary(start) && start < self.pending_output.len() {
                                        start += 1;
                                    }
                                    self.pending_output = self.pending_output[start..].to_string();
                                }
                                
                                if let Some((prompt, input_type)) = Self::detect_input_request(&self.pending_output) {
                                    tracing::info!("Input prompt detected: {:?} (type: {:?})", prompt, input_type);
                                }
                            }

                            // Broadcast to all connected clients
                            if let Err(e) = self.broadcast_tx.send(buf[..n].to_vec()) {
                                tracing::warn!("Failed to broadcast data: {}", e);
                            }
                        }
                        Err(e) => {
                            tracing::error!("Error reading from child stdout: {}", e);
                            anyhow::bail!("Child stdout read error: {}", e);
                        }
                    }
                }

                // Receive input events from WebSocket clients and write to child stdin
                Some(event) = self.input_rx.recv() => {
                    match event {
                        InputEvent::Data(data) => {
                            tracing::trace!("Writing {} bytes to child stdin", data.len());
                            let mut stdin = self.stdin.lock().await;
                            if let Err(e) = stdin.write_all(&data).await {
                                tracing::error!("Error writing to child stdin: {}", e);
                                anyhow::bail!("Child stdin write error: {}", e);
                            }
                            if let Err(e) = stdin.flush().await {
                                tracing::error!("Error flushing child stdin: {}", e);
                                anyhow::bail!("Child stdin flush error: {}", e);
                            }
                        }
                        InputEvent::Resize { rows, cols } => {
                            // Cannot resize PTY after spawn
                            tracing::warn!(
                                "Resize event received ({}x{}), but resize not supported after spawn",
                                rows,
                                cols
                            );
                        }
                    }
                }

                // Wait for child process to exit
                status = self.child.wait() => {
                    match status {
                        Ok(exit_status) => {
                            tracing::info!("Child process exited: {}", exit_status);
                            if !exit_status.success() {
                                tracing::warn!("Child process exited with non-zero status");
                            }
                        }
                        Err(e) => {
                            tracing::error!("Error waiting for child process: {}", e);
                        }
                    }
                    break;
                }
            }
        }

        tracing::info!("Child manager shutting down");
        Ok(())
    }
}
