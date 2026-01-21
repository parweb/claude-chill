use std::net::IpAddr;

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
}

impl Default for Config {
    fn default() -> Self {
        Self {
            bind_ip: "127.0.0.1".parse().unwrap(),
            port: 8080,
            command: "claude".to_string(),
            command_args: vec![],
            history_lines: None,
            lookback_key: None,
            auto_lookback: false,
            broadcast_capacity: 1024,
            history_chunks: 1000,
        }
    }
}
