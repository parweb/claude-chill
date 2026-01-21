use std::sync::Arc;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::process::{Child, ChildStdin, ChildStdout, Command};
use tokio::sync::{broadcast, mpsc, Mutex};

#[derive(Debug, Clone)]
pub enum InputEvent {
    Data(Vec<u8>),
    Resize { rows: u16, cols: u16 },
}

pub struct ChildManager {
    child: Child,
    stdin: Arc<Mutex<ChildStdin>>,
    stdout: ChildStdout,
    broadcast_tx: broadcast::Sender<Vec<u8>>,
    input_rx: mpsc::Receiver<InputEvent>,
}

impl ChildManager {
    pub async fn spawn(
        command: String,
        args: Vec<String>,
        broadcast_tx: broadcast::Sender<Vec<u8>>,
        input_rx: mpsc::Receiver<InputEvent>,
    ) -> anyhow::Result<Self> {
        tracing::info!("Spawning child process: {} {:?}", command, args);

        let mut child = Command::new(&command)
            .args(&args)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::inherit()) // Let stderr pass through for debugging
            .spawn()
            .map_err(|e| {
                anyhow::anyhow!(
                    "Failed to spawn '{}': {}. Is it installed and in PATH?",
                    command,
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
        })
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
