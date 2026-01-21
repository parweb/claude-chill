import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

export class TerminalSession {
    constructor(id, directory, name, manager) {
        this.id = id;
        this.directory = directory;
        this.name = name;
        this.manager = manager;
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;

        this.createTerminal();
        this.connect();
    }

    createTerminal() {
        // Create terminal wrapper
        this.wrapper = document.createElement('div');
        this.wrapper.className = 'terminal-wrapper';
        this.wrapper.dataset.sessionId = this.id;
        document.getElementById('terminals-container').appendChild(this.wrapper);

        // Create xterm terminal
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

        this.fitAddon = new FitAddon();
        this.term.loadAddon(this.fitAddon);
        this.term.loadAddon(new WebLinksAddon());

        this.term.open(this.wrapper);
        this.fitAddon.fit();

        // Handle user input
        this.term.onData((data) => {
            const encoder = new TextEncoder();
            const bytes = encoder.encode(data);
            this.sendInput(bytes);
        });

        // Handle window resize
        window.addEventListener('resize', () => this.handleResize());
    }

    handleResize() {
        if (this.wrapper.classList.contains('active')) {
            this.fitAddon.fit();
            this.sendResize();
        }
    }

    connect() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = this.directory 
            ? `${protocol}//${window.location.host}/ws?directory=${encodeURIComponent(this.directory)}`
            : `${protocol}//${window.location.host}/ws`;

        this.manager.updateStatus('Connecting...', 'connecting');
        this.ws = new WebSocket(wsUrl);
        this.ws.binaryType = 'arraybuffer';

        this.ws.onopen = () => {
            this.manager.updateStatus('Connected', 'connected');
            this.reconnectAttempts = 0;
            this.sendResize();
            this.term.write(`\r\n\x1b[32m● Connected to session: ${this.name}\x1b[0m\r\n`);
            if (this.directory) {
                this.term.write(`\x1b[90m● Working directory: ${this.directory}\x1b[0m\r\n\r\n`);
            }
        };

        this.ws.onmessage = (event) => {
            if (event.data instanceof ArrayBuffer) {
                const uint8Array = new Uint8Array(event.data);
                this.term.write(uint8Array);
            } else {
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
            this.manager.updateStatus('Error', 'error');
        };

        this.ws.onclose = () => {
            this.manager.updateStatus('Disconnected', 'disconnected');
            this.reconnect();
        };
    }

    handleControlMessage(msg) {
        switch (msg.type) {
            case 'Pong':
                break;
            case 'Error':
                console.error('Server error:', msg.message);
                this.term.write(`\r\n\x1b[31m● Server error: ${msg.message}\x1b[0m\r\n`);
                break;
            default:
                console.warn('Unknown control message:', msg);
        }
    }

    reconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            this.manager.updateStatus('Failed to reconnect', 'error');
            this.term.write('\r\n\x1b[31m● Failed to reconnect to server. Please refresh.\x1b[0m\r\n');
            return;
        }

        this.reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);

        this.manager.updateStatus(`Reconnecting in ${Math.round(delay / 1000)}s...`, 'reconnecting');
        this.term.write(`\r\n\x1b[33m● Connection lost. Reconnecting (attempt ${this.reconnectAttempts})...\x1b[0m\r\n`);

        setTimeout(() => {
            console.log(`Reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
            this.connect();
        }, delay);
    }

    sendInput(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
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

    activate() {
        this.wrapper.classList.add('active');
        this.fitAddon.fit();
        this.sendResize();
        this.term.focus();
    }

    deactivate() {
        this.wrapper.classList.remove('active');
    }

    destroy() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        if (this.term) {
            this.term.dispose();
        }
        if (this.wrapper) {
            this.wrapper.remove();
        }
    }
}
