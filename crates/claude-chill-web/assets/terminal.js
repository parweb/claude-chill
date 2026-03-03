class SessionManager {
    constructor() {
        this.sessions = new Map();
        this.activeSessionId = null;
        this.sessionCounter = 0;

        this.setupUI();
        this.showEmptyState();
    }

    setupUI() {
        // New session button
        document.getElementById('new-session-btn').addEventListener('click', () => {
            this.showNewSessionModal();
        });

        // Modal handlers
        const modal = document.getElementById('new-session-modal');
        const form = document.getElementById('new-session-form');
        const closeBtn = modal.querySelector('.close-modal');
        const cancelBtn = modal.querySelector('.cancel-btn');

        closeBtn.addEventListener('click', () => this.hideModal());
        cancelBtn.addEventListener('click', () => this.hideModal());

        modal.addEventListener('click', (e) => {
            if (e.target === modal) this.hideModal();
        });

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const formData = new FormData(form);
            const directory = formData.get('directory');
            const name = formData.get('name') || this.getDefaultName(directory);

            this.createSession(directory, name);
            this.hideModal();
            form.reset();
        });
    }

    getDefaultName(directory) {
        if (!directory) return `Session ${this.sessionCounter + 1}`;
        const parts = directory.split('/').filter(p => p);
        return parts[parts.length - 1] || `Session ${this.sessionCounter + 1}`;
    }

    showNewSessionModal() {
        const modal = document.getElementById('new-session-modal');
        modal.classList.add('show');
        document.getElementById('session-dir').focus();
    }

    hideModal() {
        const modal = document.getElementById('new-session-modal');
        modal.classList.remove('show');
    }

    createSession(directory, name) {
        this.sessionCounter++;
        const id = `session-${this.sessionCounter}`;

        const session = new TerminalSession(id, directory, name, this);
        this.sessions.set(id, session);

        this.addSidebarItem(id, name);
        this.addTab(id, name);
        this.switchToSession(id);

        // Hide empty state if it's the first session
        if (this.sessions.size === 1) {
            this.hideEmptyState();
        }
    }

    addSidebarItem(id, name) {
        const item = document.createElement('div');
        item.className = 'session-item';
        item.dataset.sessionId = id;
        item.textContent = name.substring(0, 2).toUpperCase();
        item.title = name;

        item.addEventListener('click', () => {
            this.switchToSession(id);
        });

        document.getElementById('sessions-list').appendChild(item);
    }

    addTab(id, name) {
        const tab = document.createElement('div');
        tab.className = 'tab';
        tab.dataset.sessionId = id;

        const label = document.createElement('span');
        label.className = 'tab-label';
        label.textContent = name;

        const closeBtn = document.createElement('span');
        closeBtn.className = 'tab-close';
        closeBtn.innerHTML = '×';
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.closeSession(id);
        });

        tab.appendChild(label);
        tab.appendChild(closeBtn);

        tab.addEventListener('click', () => {
            this.switchToSession(id);
        });

        document.getElementById('tabs-bar').appendChild(tab);
    }

    switchToSession(id) {
        if (this.activeSessionId === id) return;

        // Deactivate current session
        if (this.activeSessionId) {
            const prevSession = this.sessions.get(this.activeSessionId);
            if (prevSession) prevSession.deactivate();

            // Update UI
            const prevTab = document.querySelector(`.tab[data-session-id="${this.activeSessionId}"]`);
            if (prevTab) prevTab.classList.remove('active');

            const prevSidebarItem = document.querySelector(`.session-item[data-session-id="${this.activeSessionId}"]`);
            if (prevSidebarItem) prevSidebarItem.classList.remove('active');
        }

        // Activate new session
        this.activeSessionId = id;
        const session = this.sessions.get(id);
        if (session) session.activate();

        // Update UI
        const tab = document.querySelector(`.tab[data-session-id="${id}"]`);
        if (tab) tab.classList.add('active');

        const sidebarItem = document.querySelector(`.session-item[data-session-id="${id}"]`);
        if (sidebarItem) sidebarItem.classList.add('active');
    }

    closeSession(id) {
        const session = this.sessions.get(id);
        if (!session) return;

        if (!confirm(`Close session "${session.name}"?`)) return;

        // Close session
        session.destroy();
        this.sessions.delete(id);

        // Remove UI elements
        const tab = document.querySelector(`.tab[data-session-id="${id}"]`);
        if (tab) tab.remove();

        const sidebarItem = document.querySelector(`.session-item[data-session-id="${id}"]`);
        if (sidebarItem) sidebarItem.remove();

        // Switch to another session if this was active
        if (this.activeSessionId === id) {
            this.activeSessionId = null;
            const remainingSessions = Array.from(this.sessions.keys());
            if (remainingSessions.length > 0) {
                this.switchToSession(remainingSessions[0]);
            } else {
                this.showEmptyState();
            }
        }
    }

    showEmptyState() {
        const container = document.getElementById('terminals-container');
        container.innerHTML = `
            <div class="empty-state">
                <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="4 17 10 11 4 5"></polyline>
                    <line x1="12" y1="19" x2="20" y2="19"></line>
                </svg>
                <h3>No Active Sessions</h3>
                <p>Create a new session to start working with Claude</p>
                <button class="btn btn-primary" onclick="window.sessionManager.showNewSessionModal()">
                    <span style="margin-right: 8px;">+</span> New Session
                </button>
            </div>
        `;
    }

    hideEmptyState() {
        const emptyState = document.querySelector('.empty-state');
        if (emptyState) emptyState.remove();
    }

    updateStatus(text, className) {
        const elem = document.getElementById('connection-status');
        if (elem) {
            elem.textContent = text;
            elem.className = className;
        }
    }
}

class TerminalSession {
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

        this.fitAddon = new FitAddon.FitAddon();
        this.term.loadAddon(this.fitAddon);
        this.term.loadAddon(new WebLinksAddon.WebLinksAddon());

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
        const wsUrl = `${protocol}//${window.location.host}/ws?directory=${encodeURIComponent(this.directory)}`;

        this.manager.updateStatus('Connecting...', 'connecting');
        this.ws = new WebSocket(wsUrl);
        this.ws.binaryType = 'arraybuffer';

        this.ws.onopen = () => {
            this.manager.updateStatus('Connected', 'connected');
            this.reconnectAttempts = 0;
            this.sendResize();
            this.term.write(`\r\n\x1b[32m● Connected to session: ${this.name}\x1b[0m\r\n`);
            this.term.write(`\x1b[90m● Working directory: ${this.directory}\x1b[0m\r\n\r\n`);
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

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    window.sessionManager = new SessionManager();
});
