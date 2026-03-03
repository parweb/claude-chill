use std::collections::VecDeque;
use std::sync::Arc;
use tokio::sync::{broadcast, Mutex};

pub struct BroadcastManager {
    tx: broadcast::Sender<Vec<u8>>,
    history: Arc<Mutex<VecDeque<Vec<u8>>>>,
    max_history_chunks: usize,
}

impl BroadcastManager {
    pub fn new(capacity: usize, max_history_chunks: usize) -> Self {
        let (tx, _rx) = broadcast::channel(capacity);
        Self {
            tx,
            history: Arc::new(Mutex::new(VecDeque::with_capacity(max_history_chunks))),
            max_history_chunks,
        }
    }

    pub fn tx(&self) -> broadcast::Sender<Vec<u8>> {
        self.tx.clone()
    }

    pub fn subscribe(&self) -> broadcast::Receiver<Vec<u8>> {
        self.tx.subscribe()
    }

    pub async fn add_to_history(&self, data: Vec<u8>) {
        let mut history = self.history.lock().await;
        if history.len() >= self.max_history_chunks {
            history.pop_front();
        }
        history.push_back(data);
    }

    pub async fn get_history(&self) -> Vec<Vec<u8>> {
        let history = self.history.lock().await;
        history.iter().cloned().collect()
    }
}
