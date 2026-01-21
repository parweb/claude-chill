class TerminalWebSocket {
    constructor() {
        this.term = new Terminal({
            cursorBlink: true,
            fontSize: 14,
            fontFamily: 'Menlo, Monaco, "Courier New", monospace',
            scrollback: 100000,
            theme: {
                background: '#1e1e1e',
                foreground: '#d4d4d4',
            },
        });

        this.fitAddon = new FitAddon.FitAddon();
        this.term.loadAddon(this.fitAddon);
        this.term.loadAddon(new WebLinksAddon.WebLinksAddon());

        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
    }

    connect() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws`;

        this.updateStatus('Connecting...', 'connecting');
        this.ws = new WebSocket(wsUrl);
        this.ws.binaryType = 'arraybuffer';

        this.ws.onopen = () => {
            this.updateStatus('Connected', 'connected');
            this.reconnectAttempts = 0;
            this.sendResize();
        };

        this.ws.onmessage = (event) => {
            if (event.data instanceof ArrayBuffer) {
                // Binary message - terminal output
                const uint8Array = new Uint8Array(event.data);
                this.term.write(uint8Array);
            } else {
                // Text message - control messages
                try {
                    const msg = JSON.parse(event.data);
                    this.handleControlMessage(msg);
                } catch (e) {
                    console.error('Failed to parse control message:', e);
                }
            }
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.updateStatus('Error', 'error');
        };

        this.ws.onclose = (event) => {
            console.log('WebSocket closed:', event.code, event.reason);
            this.updateStatus('Disconnected', 'disconnected');
            this.reconnect();
        };
    }

    handleControlMessage(msg) {
        switch (msg.type) {
            case 'Pong':
                // Pong received
                break;
            case 'Error':
                console.error('Server error:', msg.message);
                this.term.write(`\r\n\x1b[31mServer error: ${msg.message}\x1b[0m\r\n`);
                break;
            default:
                console.warn('Unknown control message:', msg);
        }
    }

    reconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            this.updateStatus('Failed to reconnect', 'error');
            this.term.write('\r\n\x1b[31mFailed to reconnect to server. Please refresh the page.\x1b[0m\r\n');
            return;
        }

        this.reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);

        this.updateStatus(`Reconnecting in ${Math.round(delay / 1000)}s...`, 'reconnecting');

        setTimeout(() => {
            console.log(`Reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
            this.connect();
        }, delay);
    }

    sendInput(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            // Send as binary data (raw bytes)
            this.ws.send(data);
        }
    }

    sendResize() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const msg = {
                type: 'Resize',
                rows: this.term.rows,
                cols: this.term.cols,
            };
            this.ws.send(JSON.stringify(msg));
        }
    }

    sendPing() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const msg = { type: 'Ping' };
            this.ws.send(JSON.stringify(msg));
        }
    }

    init() {
        // Open terminal in container
        this.term.open(document.getElementById('terminal-container'));
        this.fitAddon.fit();

        // Handle user input from terminal
        this.term.onData((data) => {
            // Convert string to Uint8Array
            const encoder = new TextEncoder();
            const bytes = encoder.encode(data);
            this.sendInput(bytes);
        });

        // Handle window resize
        window.addEventListener('resize', () => {
            this.fitAddon.fit();
            this.sendResize();
        });

        // Handle visibility change (tab switching)
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.sendResize();
            }
        });

        // Periodic ping to keep connection alive
        setInterval(() => {
            this.sendPing();
        }, 30000); // Every 30 seconds

        // Connect to WebSocket
        this.connect();
    }

    updateStatus(text, className) {
        const elem = document.getElementById('connection-status');
        if (elem) {
            elem.textContent = text;
            elem.className = className;
        }
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const terminal = new TerminalWebSocket();
    terminal.init();
});
