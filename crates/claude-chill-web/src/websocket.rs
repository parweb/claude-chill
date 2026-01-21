use axum::extract::ws::WebSocket;
use tokio::sync::{broadcast, mpsc};
use uuid::Uuid;

use crate::child_manager::InputEvent;

pub struct WebSocketHandler {
    ws: WebSocket,
    broadcast_rx: broadcast::Receiver<Vec<u8>>,
    input_tx: mpsc::Sender<InputEvent>,
    client_id: Uuid,
}

impl WebSocketHandler {
    pub fn new(
        ws: WebSocket,
        broadcast_rx: broadcast::Receiver<Vec<u8>>,
        input_tx: mpsc::Sender<InputEvent>,
        client_id: Uuid,
    ) -> Self {
        Self {
            ws,
            broadcast_rx,
            input_tx,
            client_id,
        }
    }

    pub async fn handle(self) -> anyhow::Result<()> {
        Ok(())
    }
}
