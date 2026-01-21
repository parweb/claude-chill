import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

function TerminalView({ session, isActive }) {
    const containerRef = useRef(null);

    useEffect(() => {
        if (!containerRef.current || session.term) return;

        const term = new Terminal({
            cursorBlink: true,
            fontSize: 14,
            fontFamily: 'Menlo, Monaco, "Courier New", monospace',
            scrollback: 100000,
            theme: { background: '#1e1e1e', foreground: '#d4d4d4' },
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        term.loadAddon(new WebLinksAddon());
        term.open(containerRef.current);
        fitAddon.fit();

        session.term = term;
        session.fitAddon = fitAddon;

        term.onData((data) => session.sendInput(new TextEncoder().encode(data)));

        return () => {
            term.dispose();
            session.term = null;
        };
    }, [session]);

    useEffect(() => {
        if (isActive && session.fitAddon) {
            setTimeout(() => {
                session.fitAddon.fit();
                session.term?.focus();
                session.sendResize();
            }, 0);
        }
    }, [isActive, session]);

    useEffect(() => {
        const handleResize = () => {
            if (isActive && session.fitAddon) {
                session.fitAddon.fit();
                session.sendResize();
            }
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [isActive, session]);

    return <div ref={containerRef} className={`terminal-wrapper ${isActive ? 'active' : ''}`} />;
}

class SessionConnection {
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
            if (!this.ended) {
                this.reconnect();
            }
        };

        this.ws.onerror = (e) => {
            console.error('WebSocket error:', e);
        };
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
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(data);
        }
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

function useSession(directory, name, initialSessionId, onSessionIdChange) {
    const [, forceUpdate] = useState({});
    const sessionRef = useRef(null);

    useEffect(() => {
        const session = new SessionConnection(directory, name, initialSessionId, () => {
            forceUpdate({});
            if (session.sessionId && session.sessionId !== initialSessionId) {
                onSessionIdChange(session.sessionId);
            }
        });
        sessionRef.current = session;
        session.connect();
        return () => session.close();
    }, []);

    return sessionRef.current;
}

function NewSessionModal({ isOpen, onClose, onCreate }) {
    const [directory, setDirectory] = useState('');
    const [name, setName] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [error, setError] = useState('');
    const inputRef = useRef(null);

    useEffect(() => {
        if (isOpen) {
            setDirectory('/Users/chris.le-guichoux/Sites/');
            setName('');
            setError('');
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isOpen]);

    useEffect(() => {
        if (!directory) return;
        const timer = setTimeout(async () => {
            const path = directory.replace(/\/$/, '') || '/Users/chris.le-guichoux/Sites';
            try {
                const res = await fetch(`/api/directories?path=${encodeURIComponent(path)}`);
                const data = await res.json();
                setError(data.exists ? '' : 'Directory does not exist');
                setSuggestions(data.entries?.slice(0, 10) || []);
            } catch (e) {
                console.error('Failed to fetch directories:', e);
            }
        }, 150);
        return () => clearTimeout(timer);
    }, [directory]);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (error) return;
        const sessionName = name || directory.split('/').filter(Boolean).pop() || 'Session';
        onCreate(directory, sessionName);
        onClose();
    };

    const handleSuggestionClick = (path) => {
        setDirectory(path + '/');
        setSuggestions([]);
    };

    if (!isOpen) return null;

    return (
        <div className="modal show" onClick={(e) => e.target.className === 'modal show' && onClose()}>
            <div className="modal-content">
                <div className="modal-header">
                    <h2>New Claude Session</h2>
                    <button className="close-modal" onClick={onClose}>&times;</button>
                </div>
                <form id="new-session-form" onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label htmlFor="session-dir">Working Directory:</label>
                        <div className="autocomplete-wrapper">
                            <input
                                ref={inputRef}
                                type="text"
                                id="session-dir"
                                value={directory}
                                onChange={(e) => setDirectory(e.target.value)}
                                className={error ? 'error' : ''}
                                placeholder="/path/to/project"
                                autoComplete="off"
                            />
                            {suggestions.length > 0 && (
                                <div className="suggestions">
                                    {suggestions.map((s) => (
                                        <div key={s.path} className="suggestion-item" onClick={() => handleSuggestionClick(s.path)}>
                                            {s.name}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <small className={error ? 'error' : ''}>{error || 'Directory where Claude will run'}</small>
                    </div>
                    <div className="form-group">
                        <label htmlFor="session-name">Session Name (optional):</label>
                        <input
                            type="text"
                            id="session-name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="My Project"
                        />
                    </div>
                    <div className="form-actions">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
                        <button type="submit" className="btn btn-primary" disabled={!!error}>Create Session</button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function SessionTab({ session, isActive, onClick, onClose }) {
    return (
        <div className={`tab ${isActive ? 'active' : ''}`} onClick={onClick}>
            <span className="tab-label">{session.name}</span>
            <span className="tab-close" onClick={(e) => { e.stopPropagation(); onClose(); }}>×</span>
        </div>
    );
}

function SidebarItem({ session, isActive, onClick }) {
    return (
        <div
            className={`session-item ${isActive ? 'active' : ''}`}
            onClick={onClick}
            title={session.name}
        >
            {session.name.substring(0, 2).toUpperCase()}
        </div>
    );
}

function SessionView({ sessionData, isActive, onSessionIdChange }) {
    const session = useSession(sessionData.directory, sessionData.name, sessionData.sessionId, onSessionIdChange);

    if (!session) return null;

    return (
        <div style={{ display: isActive ? 'block' : 'none', height: '100%', position: 'relative' }}>
            <TerminalView session={session} isActive={isActive} />
            {session.ended && (
                <button className="restart-session-btn" onClick={session.restart}>
                    ↻ Restart Session
                </button>
            )}
        </div>
    );
}

function EmptyState({ onNewSession }) {
    return (
        <div className="empty-state">
            <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="4 17 10 11 4 5"></polyline>
                <line x1="12" y1="19" x2="20" y2="19"></line>
            </svg>
            <h3>No Active Sessions</h3>
            <p>Create a new session to start working with Claude</p>
            <button className="btn btn-primary" onClick={onNewSession}>
                <span style={{ marginRight: '8px' }}>+</span> New Session
            </button>
        </div>
    );
}

export default function App() {
    const [sessions, setSessions] = useState([]);
    const [activeId, setActiveId] = useState(null);
    const [modalOpen, setModalOpen] = useState(false);
    const [status, setStatus] = useState('Ready');

    // Restore sessions on mount
    useEffect(() => {
        (async () => {
            try {
                const res = await fetch('/api/sessions');
                const serverSessions = await res.json();
                const serverIds = new Set(serverSessions.map(s => s.id));
                const saved = JSON.parse(localStorage.getItem('claude-chill-sessions') || '[]');
                const restored = saved.filter(s => serverIds.has(s.sessionId));
                if (restored.length > 0) {
                    const sessionsWithIds = restored.map((s, i) => ({ ...s, id: `session-${i}` }));
                    setSessions(sessionsWithIds);
                    setActiveId(sessionsWithIds[0].id);
                }
            } catch (e) {
                console.error('Failed to restore sessions:', e);
            }
        })();
    }, []);

    // Save sessions to localStorage
    useEffect(() => {
        const data = sessions.map(s => ({
            sessionId: s.sessionId,
            directory: s.directory,
            name: s.name,
        }));
        localStorage.setItem('claude-chill-sessions', JSON.stringify(data));
    }, [sessions]);

    const createSession = (directory, name) => {
        const id = `session-${Date.now()}`;
        setSessions(prev => [...prev, { id, directory, name, sessionId: null }]);
        setActiveId(id);
    };

    const closeSession = (id) => {
        const session = sessions.find(s => s.id === id);
        if (!session || !confirm(`Close session "${session.name}"?`)) return;

        setSessions(prev => prev.filter(s => s.id !== id));
        if (activeId === id) {
            const remaining = sessions.filter(s => s.id !== id);
            setActiveId(remaining.length > 0 ? remaining[0].id : null);
        }
    };

    const updateSessionId = (id, sessionId) => {
        setSessions(prev => prev.map(s => s.id === id ? { ...s, sessionId } : s));
    };

    return (
        <>
            <div id="sidebar">
                <div id="sidebar-header">
                    <button className="icon-button" onClick={() => setModalOpen(true)} title="New Session">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="12" y1="5" x2="12" y2="19"></line>
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                        </svg>
                    </button>
                </div>
                <div id="sessions-list">
                    {sessions.map(s => (
                        <SidebarItem
                            key={s.id}
                            session={s}
                            isActive={activeId === s.id}
                            onClick={() => setActiveId(s.id)}
                        />
                    ))}
                </div>
            </div>

            <div id="main-content">
                <div id="status">
                    <span id="connection-status">{status}</span>
                </div>

                <div id="tabs-bar">
                    {sessions.map(s => (
                        <SessionTab
                            key={s.id}
                            session={s}
                            isActive={activeId === s.id}
                            onClick={() => setActiveId(s.id)}
                            onClose={() => closeSession(s.id)}
                        />
                    ))}
                </div>

                <div id="terminals-container">
                    {sessions.length === 0 ? (
                        <EmptyState onNewSession={() => setModalOpen(true)} />
                    ) : (
                        sessions.map(s => (
                            <SessionView
                                key={s.id}
                                sessionData={s}
                                isActive={activeId === s.id}
                                onSessionIdChange={(sid) => updateSessionId(s.id, sid)}
                            />
                        ))
                    )}
                </div>
            </div>

            <NewSessionModal
                isOpen={modalOpen}
                onClose={() => setModalOpen(false)}
                onCreate={createSession}
            />
        </>
    );
}
