use axum::{
    extract::{
        ws::{WebSocket, WebSocketUpgrade},
        Query, State,
    },
    response::Response,
    routing::get,
    Router,
};
use serde::Deserialize;
use std::net::SocketAddr;
use std::sync::Arc;
use tower_http::{
    services::ServeDir,
    trace::{DefaultMakeSpan, TraceLayer},
};
use uuid::Uuid;

use crate::config::Config;
use crate::websocket::WebSocketHandler;

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<Config>,
}

#[derive(Deserialize)]
pub struct WebSocketQuery {
    #[serde(default)]
    pub directory: Option<String>,
}

pub async fn run(config: Config, state: AppState) -> anyhow::Result<()> {
    let serve_dir = ServeDir::new("crates/claude-chill-web/dist")
        .append_index_html_on_directories(true);

    let app = Router::new()
        .route("/ws", get(websocket_upgrade))
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

async fn websocket_upgrade(
    ws: WebSocketUpgrade,
    Query(query): Query<WebSocketQuery>,
    State(state): State<Arc<AppState>>,
) -> Response {
    ws.on_upgrade(|socket| handle_websocket(socket, query.directory, state))
}

async fn handle_websocket(socket: WebSocket, directory: Option<String>, state: Arc<AppState>) {
    let client_id = Uuid::new_v4();
    tracing::info!(
        "Client {} connected with directory: {:?}",
        client_id,
        directory
    );

    let handler = WebSocketHandler::new(socket, client_id, directory, state.config.clone());

    if let Err(e) = handler.handle().await {
        tracing::error!("WebSocket error for client {}: {}", client_id, e);
    }

    tracing::info!("Client {} disconnected", client_id);
}
