use axum::{
    extract::{
        ws::{WebSocket, WebSocketUpgrade},
        State,
    },
    http::StatusCode,
    response::{Html, IntoResponse, Response},
    routing::get,
    Router,
};
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::sync::mpsc;
use tower_http::{
    services::ServeDir,
    trace::{DefaultMakeSpan, TraceLayer},
};
use uuid::Uuid;

use crate::broadcast::BroadcastManager;
use crate::child_manager::InputEvent;
use crate::config::Config;
use crate::websocket::WebSocketHandler;

#[derive(Clone)]
pub struct AppState {
    pub broadcast: Arc<BroadcastManager>,
    pub input_tx: mpsc::Sender<InputEvent>,
}

pub async fn run(config: Config, state: AppState) -> anyhow::Result<()> {
    let app = Router::new()
        .route("/", get(serve_index))
        .route("/ws", get(websocket_upgrade))
        .nest_service(
            "/assets",
            ServeDir::new("crates/claude-chill-web/assets"),
        )
        .with_state(Arc::new(state))
        .layer(
            TraceLayer::new_for_http()
                .make_span_with(DefaultMakeSpan::default().include_headers(true)),
        );

    let addr = SocketAddr::from((config.bind_ip, config.port));
    tracing::info!("Web server listening on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;

    axum::serve(listener, app).await?;

    Ok(())
}

async fn serve_index() -> Response {
    Html(include_str!("../assets/index.html")).into_response()
}

async fn websocket_upgrade(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
) -> Response {
    ws.on_upgrade(|socket| handle_websocket(socket, state))
}

async fn handle_websocket(socket: WebSocket, state: Arc<AppState>) {
    let client_id = Uuid::new_v4();
    tracing::info!("Client {} connected", client_id);

    let handler = WebSocketHandler::new(
        socket,
        state.broadcast.subscribe(),
        state.input_tx.clone(),
        client_id,
        state.broadcast.clone(),
    );

    if let Err(e) = handler.handle().await {
        tracing::error!("WebSocket error for client {}: {}", client_id, e);
    }

    tracing::info!("Client {} disconnected", client_id);
}
