use serde::{Deserialize, Serialize};
use std::fs;
use std::net::IpAddr;
use std::path::PathBuf;

#[derive(Debug, Clone, Deserialize)]
#[serde(default)]
pub struct TomlConfig {
    pub bind: Option<String>,
    pub port: Option<u16>,
    pub command: Option<String>,
    pub history_lines: Option<usize>,
    pub lookback_key: Option<String>,
    pub auto_lookback: Option<bool>,
    pub broadcast_capacity: Option<usize>,
    pub history_chunks: Option<usize>,
    pub default_directory: Option<String>,
}

impl Default for TomlConfig {
    fn default() -> Self {
        Self {
            bind: None,
            port: None,
            command: None,
            history_lines: None,
            lookback_key: None,
            auto_lookback: None,
            broadcast_capacity: None,
            history_chunks: None,
            default_directory: None,
        }
    }
}

#[derive(Debug, Clone)]
pub struct Config {
    pub bind_ip: IpAddr,
    pub port: u16,
    pub command: String,
    pub command_args: Vec<String>,
    pub history_lines: Option<usize>,
    pub lookback_key: Option<String>,
    pub auto_lookback: bool,
    pub broadcast_capacity: usize,
    pub history_chunks: usize,
    pub default_directory: String,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            bind_ip: "127.0.0.1".parse().unwrap(),
            port: 8468,
            command: "claude".to_string(),
            command_args: vec![],
            history_lines: None,
            lookback_key: None,
            auto_lookback: false,
            broadcast_capacity: 1024,
            history_chunks: 1000,
            default_directory: dirs::home_dir()
                .map(|h| h.to_string_lossy().to_string())
                .unwrap_or_else(|| "/".to_string()),
        }
    }
}

impl Config {
    pub fn load() -> Self {
        let config_path = Self::config_path();
        match config_path {
            Some(path) if path.exists() => Self::load_from_file(&path),
            _ => Self::default(),
        }
    }

    pub fn config_path() -> Option<PathBuf> {
        dirs::config_dir().map(|d| d.join("claude-chill-web.toml"))
    }

    fn load_from_file(path: &PathBuf) -> Self {
        let toml_config = match fs::read_to_string(path) {
            Ok(content) => match toml::from_str::<TomlConfig>(&content) {
                Ok(config) => config,
                Err(e) => {
                    eprintln!(
                        "Warning: Failed to parse config file {}: {}",
                        path.display(),
                        e
                    );
                    TomlConfig::default()
                }
            },
            Err(e) => {
                eprintln!(
                    "Warning: Failed to read config file {}: {}",
                    path.display(),
                    e
                );
                TomlConfig::default()
            }
        };

        Self::from_toml(toml_config)
    }

    fn from_toml(toml: TomlConfig) -> Self {
        let mut config = Self::default();

        if let Some(bind) = toml.bind {
            if let Ok(ip) = bind.parse() {
                config.bind_ip = ip;
            } else {
                eprintln!("Warning: Invalid bind IP '{}', using default", bind);
            }
        }

        if let Some(port) = toml.port {
            config.port = port;
        }

        if let Some(command) = toml.command {
            config.command = command;
        }

        if let Some(history_lines) = toml.history_lines {
            config.history_lines = Some(history_lines);
        }

        if let Some(lookback_key) = toml.lookback_key {
            config.lookback_key = Some(lookback_key);
        }

        if let Some(auto_lookback) = toml.auto_lookback {
            config.auto_lookback = auto_lookback;
        }

        if let Some(broadcast_capacity) = toml.broadcast_capacity {
            config.broadcast_capacity = broadcast_capacity;
        }

        if let Some(history_chunks) = toml.history_chunks {
            config.history_chunks = history_chunks;
        }

        if let Some(default_directory) = toml.default_directory {
            config.default_directory = default_directory;
        }

        config
    }

    pub fn save(&self) -> anyhow::Result<()> {
        let path = Self::config_path().ok_or_else(|| anyhow::anyhow!("No config directory"))?;
        let toml = TomlConfigWrite {
            default_directory: Some(self.default_directory.clone()),
        };
        let content = toml::to_string_pretty(&toml)?;
        fs::write(path, content)?;
        Ok(())
    }

    pub fn child_command(&self) -> String {
        "claude-chill".to_string()
    }

    pub fn child_args(&self) -> Vec<String> {
        let mut args = vec![];

        if let Some(history_lines) = self.history_lines {
            args.push("-H".to_string());
            args.push(history_lines.to_string());
        }

        if let Some(ref lookback_key) = self.lookback_key {
            args.push("-k".to_string());
            args.push(lookback_key.clone());
        }

        // Set auto_lookback to 0 (disabled) by default for better web UX
        args.push("-a".to_string());
        if self.auto_lookback {
            args.push("5000".to_string());
        } else {
            args.push("0".to_string());
        }

        args.push("--".to_string());
        args.push(self.command.clone());
        args.extend(self.command_args.clone());

        args
    }
}

#[derive(Serialize)]
struct TomlConfigWrite {
    default_directory: Option<String>,
}
