mod broadcast;
mod child_manager;
mod config;
mod server;
mod websocket;

use clap::Parser;
use config::Config;

#[derive(Parser, Debug)]
#[command(
    name = "claude-chill-web",
    about = "Web-based terminal interface for claude-chill",
    version
)]
struct Cli {
    /// Port to bind to
    #[arg(short, long, default_value = "8080")]
    port: u16,

    /// IP address to bind to (default: 127.0.0.1 for localhost only)
    #[arg(short, long, default_value = "127.0.0.1")]
    bind: String,

    /// Number of history lines to keep in claude-chill
    #[arg(short = 'H', long)]
    history_lines: Option<usize>,

    /// Lookback key combination (e.g., "[ctrl][6]")
    #[arg(short = 'k', long)]
    lookback_key: Option<String>,

    /// Enable auto-lookback after timeout (disabled by default for better web UX)
    #[arg(short = 'a', long)]
    enable_auto_lookback: bool,

    /// Command to run (default: "claude")
    #[arg(default_value = "claude")]
    command: String,

    /// Arguments to pass to the command
    #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
    args: Vec<String>,
}

impl Cli {
    fn merge_with_config(self, mut config: Config) -> anyhow::Result<Config> {
        // CLI args override config file
        if let Ok(ip) = self.bind.parse() {
            config.bind_ip = ip;
        } else {
            anyhow::bail!("Invalid bind IP address: {}", self.bind);
        }

        config.port = self.port;

        if self.history_lines.is_some() {
            config.history_lines = self.history_lines;
        }

        if self.lookback_key.is_some() {
            config.lookback_key = self.lookback_key;
        }

        if self.enable_auto_lookback {
            config.auto_lookback = true;
        }

        config.command = self.command;
        config.command_args = self.args;

        Ok(config)
    }
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    let cli = Cli::parse();
    let base_config = Config::load();
    let config = cli.merge_with_config(base_config)?;

    tracing::info!(
        "Starting claude-chill-web on http://{}:{}",
        config.bind_ip,
        config.port
    );
    tracing::info!("Child command: {} {}", config.child_command(), config.child_args().join(" "));

    // Create channels
    let (input_tx, input_rx) = tokio::sync::mpsc::channel(100);
    let broadcast = std::sync::Arc::new(broadcast::BroadcastManager::new(
        config.broadcast_capacity,
        config.history_chunks,
    ));

    // Spawn child manager task
    let broadcast_tx = broadcast.tx();
    let child_command = config.child_command();
    let child_args = config.child_args();

    tokio::spawn(async move {
        match child_manager::ChildManager::spawn(
            child_command.clone(),
            child_args.clone(),
            broadcast_tx.clone(),
            input_rx,
        )
        .await
        {
            Ok(mut manager) => {
                tracing::info!("Child manager started");

                // Run child manager loop
                loop {
                    match manager.run().await {
                        Ok(_) => {
                            tracing::info!("Child process exited normally");
                            break;
                        }
                        Err(e) => {
                            tracing::error!("Child manager error: {}", e);
                            break;
                        }
                    }
                }

                // Notify about child exit
                let exit_msg = b"\r\n\x1b[33mChild process exited. Server will continue running.\x1b[0m\r\n";
                let _ = broadcast_tx.send(exit_msg.to_vec());
            }
            Err(e) => {
                tracing::error!("Failed to spawn child: {}", e);
                eprintln!("Error: {}", e);
                std::process::exit(1);
            }
        }
    });

    // Add broadcast history tracking task
    let broadcast_for_history = broadcast.clone();
    let mut history_rx = broadcast.subscribe();
    tokio::spawn(async move {
        while let Ok(data) = history_rx.recv().await {
            broadcast_for_history.add_to_history(data).await;
        }
    });

    // Start web server
    let state = server::AppState {
        broadcast,
        input_tx,
    };

    server::run(config, state).await?;

    Ok(())
}
