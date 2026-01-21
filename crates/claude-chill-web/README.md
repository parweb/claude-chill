# claude-chill-web

Web-based terminal interface for claude-chill, allowing browser access to Claude Code through a responsive terminal emulator.

## Architecture

```
Browser (xterm.js) ←→ WebSocket ←→ Web Server (axum) ←→ Pipes ←→ claude-chill ←→ PTY ←→ Claude Code
```

- **Frontend**: xterm.js terminal emulator in the browser
- **Backend**: Axum web server with WebSocket support
- **Process Management**: Spawns claude-chill as a child process
- **Communication**: Bidirectional pipe-based I/O bridged to WebSocket

## Features

- ✨ Full VT100 terminal emulation in the browser
- 🔄 Multiple clients can view the same session (last-writer-wins)
- 🔌 Automatic reconnection with exponential backoff
- 📜 Large scrollback buffer (100K lines by default)
- 🎨 Connection status indicator
- ⌨️ Lookback mode support (Ctrl+6)
- 🔒 Localhost-only binding by default (secure)

## Installation

### Prerequisites

1. Build claude-chill first:
   ```bash
   cargo build --release -p claude-chill
   ```

2. Add claude-chill to your PATH:
   ```bash
   # Option 1: Copy to a directory in PATH
   cp target/release/claude-chill /usr/local/bin/

   # Option 2: Add to PATH in your shell config
   export PATH="$PATH:/path/to/claude-chill/target/release"
   ```

### Build claude-chill-web

```bash
cargo build --release -p claude-chill-web
```

### Install (optional)

```bash
cargo install --path crates/claude-chill-web
```

## Usage

### Basic Usage

```bash
# Start web server (defaults to http://127.0.0.1:8468)
claude-chill-web

# Then open your browser to http://localhost:8468
```

### Custom Port and Bind Address

```bash
# Custom port
claude-chill-web -p 3000

# Bind to all interfaces (CAUTION: exposes to network)
claude-chill-web -b 0.0.0.0

# Both
claude-chill-web -b 0.0.0.0 -p 3000
```

### Configure Claude Chill Options

```bash
# Set history lines
claude-chill-web -H 50000

# Set lookback key
claude-chill-web -k "[ctrl][l]"

# Enable auto-lookback (disabled by default for web)
claude-chill-web -a
```

### Pass Arguments to Claude

```bash
# Run with specific arguments to Claude
claude-chill-web -- --verbose

# Combine all options
claude-chill-web -p 8468 -H 100000 -- --verbose
```

## Configuration File

Create `~/.config/claude-chill-web.toml`:

```toml
# Bind address (default: 127.0.0.1)
bind = "127.0.0.1"

# Port (default: 8468)
port = 8468

# Command to run (default: "claude")
command = "claude"

# History lines (default: inherited from claude-chill default)
history_lines = 100000

# Lookback key (default: inherited from claude-chill default)
lookback_key = "[ctrl][6]"

# Enable auto-lookback (default: false for better web UX)
auto_lookback = false

# Broadcast channel capacity (default: 1024)
broadcast_capacity = 1024

# History chunks for reconnection (default: 1000)
history_chunks = 1000
```

CLI arguments override config file values.

## Security

### Default Security

By default, claude-chill-web binds to `127.0.0.1` (localhost only), making it accessible only from your local machine. This is the recommended configuration.

### Remote Access (Advanced)

For remote access, use SSH port forwarding instead of binding to `0.0.0.0`:

```bash
# On remote server
claude-chill-web

# On local machine
ssh -L 8468:localhost:8468 user@remote-host

# Then access http://localhost:8468 locally
```

### Reverse Proxy (Production)

For production deployment, use a reverse proxy with authentication:

```nginx
# nginx example
location /claude-terminal/ {
    proxy_pass http://127.0.0.1:8468/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;

    # Add authentication
    auth_basic "Claude Terminal";
    auth_basic_user_file /etc/nginx/.htpasswd;
}
```

## Keyboard Shortcuts

- **Ctrl+6**: Toggle lookback mode (shows history)
- **Standard terminal shortcuts**: Work as expected (Ctrl+C, Ctrl+D, etc.)

## Troubleshooting

### "Failed to spawn 'claude-chill': ... Is it installed and in PATH?"

Make sure `claude-chill` is built and in your PATH:

```bash
# Check if claude-chill is accessible
which claude-chill

# Or use absolute path
export PATH="$PATH:$(pwd)/target/release"
claude-chill-web
```

### Port Already in Use

Change the port with `-p`:

```bash
claude-chill-web -p 8081
```

### Browser Won't Connect

1. Check server is running:
   ```bash
   ps aux | grep claude-chill-web
   ```

2. Check port is accessible:
   ```bash
   curl http://localhost:8468
   ```

3. Check browser console for errors (F12)

### Terminal Display Issues

1. Resize browser window to trigger terminal reflow
2. Refresh the page to restart the connection
3. Check browser compatibility (requires modern browser with WebSocket support)

## Development

### Project Structure

```
crates/claude-chill-web/
├── src/
│   ├── main.rs           # Entry point, CLI, tokio runtime
│   ├── config.rs         # Configuration loading
│   ├── server.rs         # Axum server and routing
│   ├── websocket.rs      # WebSocket handler
│   ├── child_manager.rs  # Child process management
│   └── broadcast.rs      # Multi-client broadcasting
└── assets/
    ├── index.html        # Main page
    ├── terminal.js       # Frontend WebSocket client
    ├── terminal.css      # Styling
    └── xterm/            # Vendored xterm.js files
```

### Build and Test

```bash
# Development build
cargo build -p claude-chill-web

# Run with debug logging
RUST_LOG=debug cargo run -p claude-chill-web

# Release build
cargo build --release -p claude-chill-web
```

### Architecture Notes

- **Zero-refactor approach**: claude-chill runs unmodified as child process
- **Last-writer-wins**: All connected clients can type; last input wins
- **Auto-lookback disabled**: Better UX for web (no unexpected dumps)
- **History buffer**: New clients receive recent output for catch-up
- **Lagging clients**: Gracefully handled (skip missed messages)

## Known Limitations

- **No PTY resize after spawn**: Terminal size fixed at spawn time (resize events logged but not applied)
- **No authentication**: Use SSH tunneling or reverse proxy for security
- **No session persistence**: Closing browser disconnects; server continues running
- **Single claude-chill instance**: One child process shared by all clients

## Future Enhancements

- Authentication/authorization support
- TLS/HTTPS support
- Multiple concurrent sessions
- Session persistence and management
- Custom lookback UI (avoid terminal flicker)
- Leader election for input control
- Session recording/playback

## License

Same as claude-chill parent project.

## Contributing

Contributions welcome! Please follow the same contribution guidelines as the parent project.
