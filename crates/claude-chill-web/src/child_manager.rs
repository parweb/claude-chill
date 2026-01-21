use tokio::sync::{broadcast, mpsc};

#[derive(Debug, Clone)]
pub enum InputEvent {
    Data(Vec<u8>),
    Resize { rows: u16, cols: u16 },
}

pub struct ChildManager {
    // Placeholder for now
}

impl ChildManager {
    pub async fn spawn(
        _command: String,
        _args: Vec<String>,
        _broadcast_tx: broadcast::Sender<Vec<u8>>,
        _input_rx: mpsc::Receiver<InputEvent>,
    ) -> anyhow::Result<Self> {
        Ok(Self {})
    }

    pub async fn run(&mut self) -> anyhow::Result<()> {
        Ok(())
    }
}
