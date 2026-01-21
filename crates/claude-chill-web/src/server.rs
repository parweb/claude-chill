use std::sync::Arc;
use tokio::sync::mpsc;

use crate::broadcast::BroadcastManager;
use crate::child_manager::InputEvent;
use crate::config::Config;

#[derive(Clone)]
pub struct AppState {
    pub broadcast: Arc<BroadcastManager>,
    pub input_tx: mpsc::Sender<InputEvent>,
}

pub async fn run(_config: Config, _state: AppState) -> anyhow::Result<()> {
    Ok(())
}
