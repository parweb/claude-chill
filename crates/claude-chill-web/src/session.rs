use std::collections::{HashMap, VecDeque};
use std::sync::Arc;
use tokio::sync::{broadcast, mpsc, Mutex, RwLock};
use uuid::Uuid;

use crate::child_manager::{ChildManager, InputEvent};

const MAX_HISTORY_BYTES: usize = 512 * 1024; // 512KB of history

pub struct Session {
    pub id: Uuid,
    pub directory: Option<String>,
    pub input_tx: mpsc::Sender<InputEvent>,
    pub broadcast_tx: broadcast::Sender<Vec<u8>>,
    history: Mutex<VecDeque<Vec<u8>>>,
    history_size: Mutex<usize>,
}

impl Session {
    fn new(id: Uuid, directory: Option<String>, input_tx: mpsc::Sender<InputEvent>, broadcast_tx: broadcast::Sender<Vec<u8>>) -> Self {
        Self {
            id,
            directory,
            input_tx,
            broadcast_tx,
            history: Mutex::new(VecDeque::new()),
            history_size: Mutex::new(0),
        }
    }

    pub async fn add_to_history(&self, data: Vec<u8>) {
        let mut history = self.history.lock().await;
        let mut size = self.history_size.lock().await;
        
        *size += data.len();
        history.push_back(data);
        
        // Trim old entries if over limit
        while *size > MAX_HISTORY_BYTES && !history.is_empty() {
            if let Some(old) = history.pop_front() {
                *size -= old.len();
            }
        }
    }

    pub async fn get_history(&self) -> Vec<Vec<u8>> {
        self.history.lock().await.iter().cloned().collect()
    }
}

#[derive(Clone)]
pub struct SessionStore {
    sessions: Arc<RwLock<HashMap<Uuid, Arc<Session>>>>,
    command: String,
    args: Vec<String>,
}

impl SessionStore {
    pub fn new(command: String, args: Vec<String>) -> Self {
        Self {
            sessions: Arc::new(RwLock::new(HashMap::new())),
            command,
            args,
        }
    }

    pub async fn create(&self, directory: Option<String>) -> Arc<Session> {
        let id = Uuid::new_v4();
        let (input_tx, input_rx) = mpsc::channel(100);
        let (broadcast_tx, _) = broadcast::channel(1024);

        let session = Arc::new(Session::new(id, directory.clone(), input_tx, broadcast_tx.clone()));
        self.sessions.write().await.insert(id, session.clone());

        // Spawn history collector
        let session_for_history = session.clone();
        let mut history_rx = broadcast_tx.subscribe();
        tokio::spawn(async move {
            while let Ok(data) = history_rx.recv().await {
                session_for_history.add_to_history(data).await;
            }
        });

        // Spawn child process
        let command = self.command.clone();
        let args = self.args.clone();
        let sessions = self.sessions.clone();
        tokio::spawn(async move {
            match ChildManager::spawn(command, args, directory, broadcast_tx, input_rx).await {
                Ok(mut manager) => {
                    tracing::info!("Child manager started for session {}", id);
                    if let Err(e) = manager.run().await {
                        tracing::error!("Session {} error: {}", id, e);
                    }
                }
                Err(e) => tracing::error!("Failed to spawn session {}: {}", id, e),
            }
            sessions.write().await.remove(&id);
            tracing::info!("Session {} removed", id);
        });

        session
    }

    pub async fn get(&self, id: Uuid) -> Option<Arc<Session>> {
        self.sessions.read().await.get(&id).cloned()
    }

    pub async fn list(&self) -> Vec<(Uuid, Option<String>)> {
        self.sessions.read().await.values().map(|s| (s.id, s.directory.clone())).collect()
    }
}
