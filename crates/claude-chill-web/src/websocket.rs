use axum::extract::ws::{Message, WebSocket};
use futures::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::{broadcast, mpsc};
use uuid::Uuid;

use crate::child_manager::{ChildManager, InputEvent};
use crate::config::Config;

#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
enum ClientMessage {
    Input { data: String },
    Resize { rows: u16, cols: u16 },
    Ping,
}

#[derive(Debug, Serialize)]
#[serde(tag = "type")]
enum ServerMessage {
    Pong,
    Error { message: String },
}

pub struct WebSocketHandler {
    ws: WebSocket,
    client_id: Uuid,
    directory: Option<String>,
    config: Arc<Config>,
}

impl WebSocketHandler {
    pub fn new(
        ws: WebSocket,
        client_id: Uuid,
        directory: Option<String>,
        config: Arc<Config>,
    ) -> Self {
        Self {
            ws,
            client_id,
            directory,
            config,
        }
    }

    pub async fn handle(mut self) -> anyhow::Result<()> {
        tracing::info!(
            "WebSocket handler started for client {} in directory {:?}",
            self.client_id,
            self.directory
        );

        // Create channels for this session
        let (input_tx, input_rx) = mpsc::channel(100);
        let (broadcast_tx, mut broadcast_rx) = broadcast::channel(1024);

        // Spawn child manager for this session
        let command = self.config.child_command();
        let args = self.config.child_args();
        let directory = self.directory.clone();

        let mut child_handle = tokio::spawn(async move {
            match ChildManager::spawn(command, args, directory, broadcast_tx, input_rx).await {
                Ok(mut manager) => {
                    tracing::info!("Child manager started for session");
                    if let Err(e) = manager.run().await {
                        tracing::error!("Child manager error: {}", e);
                    }
                    tracing::info!("Child manager exited for session");
                }
                Err(e) => {
                    tracing::error!("Failed to spawn child for session: {}", e);
                }
            }
        });

        // Extract fields before splitting WebSocket
        let client_id = self.client_id;
        let mut input_tx = input_tx;

        // Split WebSocket into sender and receiver
        let (mut ws_tx, mut ws_rx) = self.ws.split();

        // Main event loop
        let result = loop {
            tokio::select! {
                // Receive from broadcast channel and send to WebSocket
                result = broadcast_rx.recv() => {
                    match result {
                        Ok(data) => {
                            tracing::trace!(
                                "Sending {} bytes to client {}",
                                data.len(),
                                client_id
                            );

                            if let Err(e) = ws_tx.send(Message::Binary(data)).await {
                                tracing::warn!(
                                    "Failed to send to client {}: {}",
                                    client_id,
                                    e
                                );
                                break Ok(());
                            }
                        }
                        Err(broadcast::error::RecvError::Lagged(skipped)) => {
                            tracing::warn!(
                                "Client {} lagged behind, skipped {} messages",
                                client_id,
                                skipped
                            );
                            // Continue receiving new messages
                        }
                        Err(broadcast::error::RecvError::Closed) => {
                            tracing::info!("Broadcast channel closed for client {}", client_id);
                            break Ok(());
                        }
                    }
                }

                // Receive from WebSocket and send to input channel
                msg = ws_rx.next() => {
                    match msg {
                        Some(Ok(Message::Binary(data))) => {
                            tracing::trace!(
                                "Received {} bytes from client {}",
                                data.len(),
                                client_id
                            );

                            if let Err(e) = input_tx.send(InputEvent::Data(data.to_vec())).await {
                                tracing::error!(
                                    "Failed to send input to child manager: {}",
                                    e
                                );
                                break Ok(());
                            }
                        }

                        Some(Ok(Message::Text(text))) => {
                            tracing::trace!(
                                "Received text message from client {}: {}",
                                client_id,
                                text
                            );

                            match serde_json::from_str::<ClientMessage>(&text) {
                                Ok(msg) => {
                                    if let Err(e) = Self::handle_control_message(
                                        msg,
                                        &mut ws_tx,
                                        &mut input_tx,
                                        client_id
                                    ).await {
                                        tracing::warn!(
                                            "Error handling control message from client {}: {}",
                                            client_id,
                                            e
                                        );
                                    }
                                }
                                Err(e) => {
                                    tracing::warn!(
                                        "Failed to parse message from client {}: {}",
                                        client_id,
                                        e
                                    );

                                    let error_msg = ServerMessage::Error {
                                        message: format!("Invalid message format: {}", e),
                                    };

                                    if let Ok(json) = serde_json::to_string(&error_msg) {
                                        let _ = ws_tx.send(Message::Text(json)).await;
                                    }
                                }
                            }
                        }

                        Some(Ok(Message::Close(_))) => {
                            tracing::info!("Client {} requested close", client_id);
                            break Ok(());
                        }

                        Some(Ok(Message::Ping(data))) => {
                            tracing::trace!("Received ping from client {}", client_id);
                            if let Err(e) = ws_tx.send(Message::Pong(data)).await {
                                tracing::warn!("Failed to send pong to client {}: {}", client_id, e);
                                break Ok(());
                            }
                        }

                        Some(Ok(Message::Pong(_))) => {
                            // Ignore pongs
                        }

                        Some(Err(e)) => {
                            tracing::warn!("WebSocket error for client {}: {}", client_id, e);
                            break Ok(());
                        }

                        None => {
                            tracing::info!("WebSocket stream ended for client {}", client_id);
                            break Ok(());
                        }
                    }
                }

                // Child process exited
                _ = &mut child_handle => {
                    tracing::info!("Child process exited for client {}", client_id);
                    // Send notification to client
                    let msg = b"\r\n\x1b[33mSession ended\x1b[0m\r\n";
                    let _ = ws_tx.send(Message::Binary(msg.to_vec())).await;
                    break Ok(());
                }
            }
        };

        // Cleanup: abort child process if still running
        child_handle.abort();

        tracing::info!("WebSocket handler finished for client {}", client_id);
        result
    }

    async fn handle_control_message(
        msg: ClientMessage,
        ws_tx: &mut futures::stream::SplitSink<WebSocket, Message>,
        input_tx: &mut mpsc::Sender<InputEvent>,
        client_id: Uuid,
    ) -> anyhow::Result<()> {
        match msg {
            ClientMessage::Input { data } => {
                // Convert base64 or raw string to bytes
                let bytes = data.as_bytes().to_vec();
                input_tx.send(InputEvent::Data(bytes)).await?;
            }

            ClientMessage::Resize { rows, cols } => {
                tracing::debug!(
                    "Client {} requested resize to {}x{}",
                    client_id,
                    rows,
                    cols
                );
                input_tx.send(InputEvent::Resize { rows, cols }).await?;
            }

            ClientMessage::Ping => {
                let pong = ServerMessage::Pong;
                let json = serde_json::to_string(&pong)?;
                ws_tx.send(Message::Text(json)).await?;
            }
        }

        Ok(())
    }
}
