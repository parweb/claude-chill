import { TerminalSession } from './terminal-session.js';

export class SessionManager {
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
