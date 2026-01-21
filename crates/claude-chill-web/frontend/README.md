# Claude Chill Web Frontend

This directory contains the frontend code for the Claude Chill web interface, built with Vite.js.

## Development

### Prerequisites

- Bun (recommended) or npm

### Install dependencies

```bash
bun install
# or
npm install
```

### Development server

Start the Vite dev server with hot module replacement:

```bash
bun run dev
# or
npm run dev
```

This will start the development server on http://localhost:5173 with a proxy to the backend WebSocket at `ws://127.0.0.1:8468/ws`.

### Build for production

Build the frontend for production:

```bash
bun run build
# or
npm run build
```

This will create optimized production files in `../dist/` directory.

### Preview production build

Preview the production build locally:

```bash
bun run preview
# or
npm run preview
```

## Architecture

### File Structure

```
frontend/
├── src/
│   ├── main.js              # Entry point, initializes SessionManager
│   ├── session-manager.js   # Manages multiple terminal sessions
│   ├── terminal-session.js  # Individual terminal with WebSocket connection
│   └── styles.css           # Global styles (VS Code inspired)
├── index.html               # HTML template
├── vite.config.js           # Vite configuration
└── package.json             # Dependencies and scripts
```

### Key Components

**SessionManager** (`session-manager.js`)
- Manages multiple terminal sessions
- Handles UI (sidebar, tabs, modal)
- Creates and switches between sessions

**TerminalSession** (`terminal-session.js`)
- Individual xterm.js terminal instance
- WebSocket connection to backend
- Handles terminal I/O and resize events

### Dependencies

- **@xterm/xterm**: Terminal emulator in the browser
- **@xterm/addon-fit**: Fit terminal to container size
- **@xterm/addon-web-links**: Make URLs in terminal clickable

## Backend Integration

The frontend communicates with the Rust backend via:

1. **Static files**: Served by axum's ServeDir from `dist/`
2. **WebSocket**: `/ws` endpoint for terminal I/O
   - Binary frames: Terminal output (stdout)
   - Text frames: Control messages (resize, ping, errors)

## Development Workflow

1. Start the Rust backend server:
   ```bash
   cargo run -p claude-chill-web
   ```

2. In a separate terminal, start the Vite dev server:
   ```bash
   cd frontend
   bun run dev
   ```

3. Open http://localhost:5173 in your browser
   - Frontend served by Vite with HMR
   - WebSocket proxied to backend at :8468

4. Make changes to the frontend code
   - Changes will hot-reload automatically
   - No need to restart the backend

## Production Deployment

For production, build the frontend and let the Rust server serve it:

```bash
cd frontend
bun run build
cd ..
cargo build --release -p claude-chill-web
./target/release/claude-chill-web
```

The backend will serve the optimized production build from `dist/`.
