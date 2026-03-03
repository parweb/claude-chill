use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::io::{Read, Write};
use std::sync::Arc;
use tokio::sync::{broadcast, mpsc, Mutex};

#[derive(Debug, Clone)]
pub enum InputEvent {
    Data(Vec<u8>),
    Resize { rows: u16, cols: u16 },
}

pub struct PtyManager {
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    reader: Option<Box<dyn Read + Send>>,
    child: Box<dyn portable_pty::Child + Send + Sync>,
    master: Box<dyn portable_pty::MasterPty + Send>,
    broadcast_tx: broadcast::Sender<Vec<u8>>,
    input_rx: mpsc::Receiver<InputEvent>,
}

impl PtyManager {
    pub fn spawn(
        command: String,
        args: Vec<String>,
        current_dir: Option<String>,
        rows: u16,
        cols: u16,
        broadcast_tx: broadcast::Sender<Vec<u8>>,
        input_rx: mpsc::Receiver<InputEvent>,
    ) -> anyhow::Result<Self> {
        tracing::info!(
            "Spawning PTY process: {} {:?} in directory: {:?} ({}x{})",
            command, args, current_dir, cols, rows
        );

        let pty_system = native_pty_system();
        let pair = pty_system.openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })?;

        let mut cmd = CommandBuilder::new(&command);
        cmd.args(&args);
        if let Some(ref dir) = current_dir {
            cmd.cwd(dir);
        }

        let child = pair.slave.spawn_command(cmd)?;
        let reader = pair.master.try_clone_reader()?;
        let writer = pair.master.take_writer()?;

        tracing::info!("PTY process spawned successfully");

        Ok(Self {
            writer: Arc::new(Mutex::new(writer)),
            reader: Some(reader),
            child,
            master: pair.master,
            broadcast_tx,
            input_rx,
        })
    }

    pub async fn run(mut self) -> anyhow::Result<()> {
        let mut reader = self.reader.take().unwrap();
        let writer = self.writer.clone();
        let broadcast_tx = self.broadcast_tx.clone();

        // Spawn blocking reader task
        let read_handle = tokio::task::spawn_blocking(move || {
            let mut buf = [0u8; 8192];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        if broadcast_tx.send(buf[..n].to_vec()).is_err() {
                            break;
                        }
                    }
                    Err(e) => {
                        tracing::debug!("PTY read error (likely closed): {}", e);
                        break;
                    }
                }
            }
        });

        // Handle input and resize events
        loop {
            tokio::select! {
                event = self.input_rx.recv() => {
                    match event {
                        Some(InputEvent::Data(data)) => {
                            let mut w = writer.lock().await;
                            if w.write_all(&data).is_err() {
                                break;
                            }
                            let _ = w.flush();
                        }
                        Some(InputEvent::Resize { rows, cols }) => {
                            tracing::debug!("Resizing PTY to {}x{}", cols, rows);
                            let _ = self.master.resize(PtySize {
                                rows,
                                cols,
                                pixel_width: 0,
                                pixel_height: 0,
                            });
                        }
                        None => break,
                    }
                }
            }
            if read_handle.is_finished() {
                break;
            }
        }

        // Wait for child to exit
        let _ = self.child.wait();
        tracing::info!("PTY manager shutting down");
        Ok(())
    }
}
