export default class SessionConnection {
    constructor(directory, name, sessionId, onStateChange) {
        this.directory = directory;
        this.name = name;
        this.sessionId = sessionId;
        this.onStateChange = onStateChange;
        this.ws = null;
        this.term = null;
        this.fitAddon = null;
        this.connected = false;
        this.ended = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
    }

    connect() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const params = new URLSearchParams();
        if (this.directory) params.set('directory', this.directory);
        if (this.sessionId) params.set('session_id', this.sessionId);
        const url = `${protocol}//${window.location.host}/ws${params.toString() ? '?' + params : ''}`;

        this.ws = new WebSocket(url);
        this.ws.binaryType = 'arraybuffer';

        this.ws.onopen = () => {
            this.connected = true;
            this.reconnectAttempts = 0;
            this.onStateChange();
            this.sendResize();
            if (!this.sessionId) {
                this.term?.write(`\r\n\x1b[32m● Connected to session: ${this.name}\x1b[0m\r\n`);
                if (this.directory) {
                    this.term?.write(`\x1b[90m● Working directory: ${this.directory}\x1b[0m\r\n\r\n`);
                }
            }
        };

        this.ws.onmessage = (event) => {
            if (event.data instanceof ArrayBuffer) {
                this.term?.write(new Uint8Array(event.data));
            } else {
                try {
                    const msg = JSON.parse(event.data);
                    if (msg.type === 'SessionId') {
                        this.sessionId = msg.id;
                        this.onStateChange();
                    } else if (msg.type === 'SessionEnded') {
                        this.ended = true;
                        this.term?.write(`\r\n\x1b[33m● Session ended\x1b[0m\r\n`);
                        this.onStateChange();
                    }
                } catch (e) {
                    console.error('Failed to parse message:', e);
                }
            }
        };

        this.ws.onclose = () => {
            this.connected = false;
            this.onStateChange();
            if (!this.ended) this.reconnect();
        };

        this.ws.onerror = (e) => console.error('WebSocket error:', e);
    }

    reconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            this.term?.write('\r\n\x1b[31m● Failed to reconnect. Please refresh.\x1b[0m\r\n');
            return;
        }
        this.reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
        this.term?.write(`\r\n\x1b[33m● Connection lost. Reconnecting (attempt ${this.reconnectAttempts})...\x1b[0m\r\n`);
        setTimeout(() => this.connect(), delay);
    }

    sendInput = (data) => {
        if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(data);
    };

    sendResize = () => {
        if (this.ws?.readyState === WebSocket.OPEN && this.term) {
            this.ws.send(JSON.stringify({ type: 'Resize', rows: this.term.rows, cols: this.term.cols }));
        }
    };

    restart = () => {
        this.sessionId = null;
        this.ended = false;
        this.reconnectAttempts = 0;
        this.term?.clear();
        this.onStateChange();
        this.connect();
    };

    close() {
        this.ws?.close();
    }
}
