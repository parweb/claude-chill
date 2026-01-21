use axum::extract::ws::{Message, WebSocket};
use futures::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::{broadcast, mpsc};
use uuid::Uuid;

use crate::broadcast::BroadcastManager;
use crate::child_manager::InputEvent;

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
    broadcast_rx: broadcast::Receiver<Vec<u8>>,
    input_tx: mpsc::Sender<InputEvent>,
    client_id: Uuid,
    broadcast_manager: Arc<BroadcastManager>,
}

impl WebSocketHandler {
    pub fn new(
        ws: WebSocket,
        broadcast_rx: broadcast::Receiver<Vec<u8>>,
        input_tx: mpsc::Sender<InputEvent>,
        client_id: Uuid,
        broadcast_manager: Arc<BroadcastManager>,
    ) -> Self {
        Self {
            ws,
            broadcast_rx,
            input_tx,
            client_id,
            broadcast_manager,
        }
    }

    pub async fn handle(mut self) -> anyhow::Result<()> {
        tracing::info!("WebSocket handler started for client {}", self.client_id);

        // Send history to new client for catch-up
        let history = self.broadcast_manager.get_history().await;
        tracing::info!(
            "Sending {} history chunks to client {}",
            history.len(),
            self.client_id
        );

        for chunk in history {
            if let Err(e) = self.ws.send(Message::Binary(chunk)).await {
                tracing::warn!(
                    "Failed to send history to client {}: {}",
                    self.client_id,
                    e
                );
                return Ok(());
            }
        }

        // Extract fields before splitting WebSocket
        let client_id = self.client_id;
        let mut input_tx = self.input_tx;
        let mut broadcast_rx = self.broadcast_rx;

        // Split WebSocket into sender and receiver
        let (mut ws_tx, mut ws_rx) = self.ws.split();

        // Main event loop
        loop {
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
                                break;
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
                            break;
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
                                break;
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
                            break;
                        }

                        Some(Ok(Message::Ping(data))) => {
                            tracing::trace!("Received ping from client {}", client_id);
                            if let Err(e) = ws_tx.send(Message::Pong(data)).await {
                                tracing::warn!("Failed to send pong to client {}: {}", client_id, e);
                                break;
                            }
                        }

                        Some(Ok(Message::Pong(_))) => {
                            // Ignore pongs
                        }

                        Some(Err(e)) => {
                            tracing::warn!("WebSocket error for client {}: {}", client_id, e);
                            break;
                        }

                        None => {
                            tracing::info!("WebSocket stream ended for client {}", client_id);
                            break;
                        }
                    }
                }
            }
        }

        tracing::info!("WebSocket handler finished for client {}", client_id);
        Ok(())
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
