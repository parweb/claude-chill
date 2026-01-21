use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{broadcast, mpsc, RwLock};
use uuid::Uuid;

use crate::child_manager::{ChildManager, InputEvent};

pub struct Session {
    pub id: Uuid,
    pub directory: Option<String>,
    pub input_tx: mpsc::Sender<InputEvent>,
    pub broadcast_tx: broadcast::Sender<Vec<u8>>,
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

        let session = Arc::new(Session {
            id,
            directory: directory.clone(),
            input_tx,
            broadcast_tx: broadcast_tx.clone(),
        });

        self.sessions.write().await.insert(id, session.clone());

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
