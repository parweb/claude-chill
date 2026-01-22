use axum::{
    extract::{
        ws::{WebSocket, WebSocketUpgrade},
        Query, State,
    },
    response::{Json, Response},
    routing::get,
    Router,
};
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use std::sync::Arc;
use tower_http::{
    services::{ServeDir, ServeFile},
    trace::{DefaultMakeSpan, TraceLayer},
};
use uuid::Uuid;

use crate::config::Config;
use crate::session::SessionStore;
use crate::websocket::WebSocketHandler;

#[derive(Clone)]
pub struct AppState {
    pub sessions: SessionStore,
}

#[derive(Deserialize, Clone, Copy, Default, Debug)]
#[serde(rename_all = "snake_case")]
pub enum SessionType {
    #[default]
    Claude,
    Kiro,
}

#[derive(Deserialize)]
pub struct WebSocketQuery {
    #[serde(default)]
    pub directory: Option<String>,
    #[serde(default)]
    pub session_id: Option<Uuid>,
    #[serde(default)]
    pub session_type: SessionType,
}

#[derive(Serialize)]
struct SessionInfo {
    id: Uuid,
    directory: Option<String>,
}

pub async fn run(config: Config, state: AppState) -> anyhow::Result<()> {
    let index_fallback = ServeFile::new("crates/claude-chill-web/dist/index.html");
    let serve_dir = ServeDir::new("crates/claude-chill-web/dist")
        .not_found_service(index_fallback);

    let app = Router::new()
        .route("/ws", get(websocket_upgrade))
        .route("/api/sessions", get(list_sessions))
        .route("/api/directories", get(list_directories))
        .with_state(Arc::new(state))
        .layer(
            TraceLayer::new_for_http()
                .make_span_with(DefaultMakeSpan::default().include_headers(true)),
        )
        .fallback_service(serve_dir);

    let addr = SocketAddr::from((config.bind_ip, config.port));
    tracing::info!("Web server listening on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}

async fn list_sessions(State(state): State<Arc<AppState>>) -> Json<Vec<SessionInfo>> {
    Json(state.sessions.list().await.into_iter().map(|(id, directory)| SessionInfo { id, directory }).collect())
}

#[derive(Deserialize)]
pub struct DirQuery {
    #[serde(default)]
    path: Option<String>,
}

#[derive(Serialize)]
struct DirEntry {
    name: String,
    path: String,
}

#[derive(Serialize)]
struct DirResponse {
    entries: Vec<DirEntry>,
    exists: bool,
}

async fn list_directories(Query(query): Query<DirQuery>) -> Json<DirResponse> {
    let base = query.path.unwrap_or_else(|| "/Users/chris.le-guichoux/Sites".to_string());
    let path = std::path::Path::new(&base);
    
    if !path.exists() {
        return Json(DirResponse { entries: vec![], exists: false });
    }
    
    if !path.is_dir() {
        return Json(DirResponse { entries: vec![], exists: true });
    }

    let mut entries = vec![];
    if let Ok(read_dir) = std::fs::read_dir(path) {
        for entry in read_dir.flatten() {
            if let Ok(ft) = entry.file_type() {
                if ft.is_dir() {
                    if let Some(name) = entry.file_name().to_str() {
                        if !name.starts_with('.') {
                            entries.push(DirEntry {
                                name: name.to_string(),
                                path: entry.path().to_string_lossy().to_string(),
                            });
                        }
                    }
                }
            }
        }
    }
    entries.sort_by(|a, b| a.name.cmp(&b.name));
    Json(DirResponse { entries, exists: true })
}

async fn websocket_upgrade(
    ws: WebSocketUpgrade,
    Query(query): Query<WebSocketQuery>,
    State(state): State<Arc<AppState>>,
) -> Response {
    let directory = query.directory.filter(|d| !d.is_empty());
    let session_id = query.session_id;
    let session_type = query.session_type;
    ws.on_upgrade(move |socket| handle_websocket(socket, directory, session_id, session_type, state))
}

async fn handle_websocket(
    socket: WebSocket,
    directory: Option<String>,
    session_id: Option<Uuid>,
    session_type: SessionType,
    state: Arc<AppState>,
) {
    let session = match session_id {
        Some(id) => {
            if let Some(s) = state.sessions.get(id).await {
                tracing::info!("Client reconnecting to session {}", id);
                s
            } else {
                tracing::info!("Session {} not found, creating new", id);
                state.sessions.create(directory, session_type).await
            }
        }
        None => {
            tracing::info!("Creating new session");
            state.sessions.create(directory, session_type).await
        }
    };

    let handler = WebSocketHandler::new(socket, session);
    if let Err(e) = handler.handle().await {
        tracing::error!("WebSocket error: {}", e);
    }
}
