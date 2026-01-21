use axum::extract::ws::{Message, WebSocket};
use futures::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::child_manager::InputEvent;
use crate::session::Session;

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
    SessionId { id: String },
    Pong,
}

pub struct WebSocketHandler {
    ws: WebSocket,
    session: Arc<Session>,
}

impl WebSocketHandler {
    pub fn new(ws: WebSocket, session: Arc<Session>) -> Self {
        Self { ws, session }
    }

    pub async fn handle(self) -> anyhow::Result<()> {
        let session_id = self.session.id;
        tracing::info!("WebSocket handler started for session {}", session_id);

        let mut broadcast_rx = self.session.broadcast_tx.subscribe();
        let input_tx = self.session.input_tx.clone();
        let (mut ws_tx, mut ws_rx) = self.ws.split();

        // Send session ID to client
        if let Ok(json) = serde_json::to_string(&ServerMessage::SessionId { id: session_id.to_string() }) {
            let _ = ws_tx.send(Message::Text(json)).await;
        }

        // Send history to reconnecting client
        let history = self.session.get_history().await;
        if !history.is_empty() {
            tracing::info!("Sending {} history chunks to client", history.len());
            for chunk in history {
                if ws_tx.send(Message::Binary(chunk)).await.is_err() {
                    return Ok(());
                }
            }
        }

        loop {
            tokio::select! {
                result = broadcast_rx.recv() => {
                    match result {
                        Ok(data) => {
                            if ws_tx.send(Message::Binary(data)).await.is_err() {
                                break;
                            }
                        }
                        Err(tokio::sync::broadcast::error::RecvError::Lagged(n)) => {
                            tracing::warn!("Client lagged, skipped {} messages", n);
                        }
                        Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
                    }
                }

                msg = ws_rx.next() => {
                    match msg {
                        Some(Ok(Message::Binary(data))) => {
                            let _ = input_tx.send(InputEvent::Data(data.to_vec())).await;
                        }
                        Some(Ok(Message::Text(text))) => {
                            if let Ok(msg) = serde_json::from_str::<ClientMessage>(&text) {
                                match msg {
                                    ClientMessage::Input { data } => {
                                        let _ = input_tx.send(InputEvent::Data(data.into_bytes())).await;
                                    }
                                    ClientMessage::Resize { rows, cols } => {
                                        let _ = input_tx.send(InputEvent::Resize { rows, cols }).await;
                                    }
                                    ClientMessage::Ping => {
                                        if let Ok(json) = serde_json::to_string(&ServerMessage::Pong) {
                                            let _ = ws_tx.send(Message::Text(json)).await;
                                        }
                                    }
                                }
                            }
                        }
                        Some(Ok(Message::Ping(data))) => {
                            let _ = ws_tx.send(Message::Pong(data)).await;
                        }
                        Some(Ok(Message::Close(_))) | None => break,
                        _ => {}
                    }
                }
            }
        }

        tracing::info!("WebSocket disconnected from session {} (session persists)", session_id);
        Ok(())
    }
}
