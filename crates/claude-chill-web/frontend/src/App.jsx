import React, { useState, useEffect, useRef } from 'react';
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

    return (
        <div
            ref={containerRef}
            className={`absolute inset-0 p-2.5 ${isActive ? 'block' : 'hidden'}`}
        />
    );
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
        onCreate(directory, name || directory.split('/').filter(Boolean).pop() || 'Session');
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div
            onClick={(e) => e.target === e.currentTarget && onClose()}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
        >
            <div className="bg-bg-secondary rounded-lg w-[90%] max-w-[500px] shadow-xl">
                <div className="p-5 border-b border-border flex justify-between items-center">
                    <h2 className="text-text-primary text-lg font-medium m-0">New Claude Session</h2>
                    <button
                        onClick={onClose}
                        className="w-[30px] h-[30px] bg-transparent border-none text-text-secondary text-[28px] cursor-pointer flex items-center justify-center rounded hover:bg-border-hover hover:text-text-primary"
                    >
                        ×
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="p-5">
                    <div className="mb-5">
                        <label className="block text-text-secondary text-[13px] font-medium mb-2">
                            Working Directory:
                        </label>
                        <div className="relative">
                            <input
                                ref={inputRef}
                                type="text"
                                value={directory}
                                onChange={(e) => setDirectory(e.target.value)}
                                className={`w-full px-3 py-2.5 bg-bg-tertiary rounded text-text-primary text-sm outline-none border ${
                                    error ? 'border-error' : 'border-border focus:border-accent'
                                }`}
                                placeholder="/path/to/project"
                                autoComplete="off"
                            />
                            {suggestions.length > 0 && (
                                <div className="absolute top-full left-0 right-0 bg-bg-tertiary border border-t-0 border-border rounded-b max-h-[200px] overflow-y-auto z-10">
                                    {suggestions.map((s) => (
                                        <div
                                            key={s.path}
                                            onClick={() => { setDirectory(s.path + '/'); setSuggestions([]); }}
                                            className="px-3 py-2 cursor-pointer text-[13px] text-text-secondary hover:bg-accent hover:text-white"
                                        >
                                            {s.name}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <small className={`block mt-1.5 text-xs ${error ? 'text-error' : 'text-text-muted'}`}>
                            {error || 'Directory where Claude will run'}
                        </small>
                    </div>
                    <div className="mb-5">
                        <label className="block text-text-secondary text-[13px] font-medium mb-2">
                            Session Name (optional):
                        </label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full px-3 py-2.5 bg-bg-tertiary border border-border rounded text-text-primary text-sm outline-none focus:border-accent"
                            placeholder="My Project"
                        />
                    </div>
                    <div className="flex justify-end gap-2.5 pt-2.5">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 bg-border border-none rounded text-[13px] font-medium text-text-secondary cursor-pointer hover:bg-border-hover hover:text-text-primary"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={!!error}
                            className="px-4 py-2 bg-accent border-none rounded text-[13px] font-medium text-white cursor-pointer hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Create Session
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function SessionView({ sessionData, isActive, onSessionIdChange }) {
    const session = useSession(sessionData.directory, sessionData.name, sessionData.sessionId, onSessionIdChange);
    if (!session) return null;

    return (
        <div className={`${isActive ? 'block' : 'hidden'} h-full relative`}>
            <TerminalView session={session} isActive={isActive} />
            {session.ended && (
                <button
                    onClick={session.restart}
                    className="absolute bottom-5 left-1/2 -translate-x-1/2 px-5 py-2.5 bg-accent text-white border-none rounded text-sm cursor-pointer z-10 hover:bg-accent-hover"
                >
                    ↻ Restart Session
                </button>
            )}
        </div>
    );
}

function EmptyState({ onNewSession }) {
    return (
        <div className="flex flex-col items-center justify-center h-full text-text-muted text-center p-10">
            <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mb-4 opacity-50">
                <polyline points="4 17 10 11 4 5"></polyline>
                <line x1="12" y1="19" x2="20" y2="19"></line>
            </svg>
            <h3 className="text-lg font-medium mb-2 text-text-secondary">No Active Sessions</h3>
            <p className="text-sm mb-5">Create a new session to start working with Claude</p>
            <button 
                onClick={onNewSession} 
                className="px-4 py-2 bg-accent border-none rounded text-white text-[13px] font-medium cursor-pointer hover:bg-accent-hover"
            >
                + New Session
            </button>
        </div>
    );
}

export default function App() {
    const [sessions, setSessions] = useState([]);
    const [activeId, setActiveId] = useState(null);
    const [modalOpen, setModalOpen] = useState(false);

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

    useEffect(() => {
        localStorage.setItem('claude-chill-sessions', JSON.stringify(
            sessions.map(s => ({ sessionId: s.sessionId, directory: s.directory, name: s.name }))
        ));
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

    return (
        <>
            {/* Sidebar */}
            <div className="w-[50px] bg-bg-secondary border-r border-border flex flex-col z-[100]">
                <div className="p-2.5 border-b border-border">
                    <button
                        onClick={() => setModalOpen(true)}
                        title="New Session"
                        className="w-[30px] h-[30px] bg-transparent border-none text-text-secondary cursor-pointer flex items-center justify-center rounded hover:bg-border-hover hover:text-text-primary"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="12" y1="5" x2="12" y2="19" />
                            <line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto py-2">
                    {sessions.map(s => (
                        <div
                            key={s.id}
                            onClick={() => setActiveId(s.id)}
                            title={s.name}
                            className={`w-[34px] h-[34px] mx-auto my-1 rounded flex items-center justify-center cursor-pointer text-xs font-semibold ${
                                activeId === s.id 
                                    ? 'bg-accent text-white' 
                                    : 'bg-border text-text-secondary hover:bg-border-hover hover:text-text-primary'
                            }`}
                        >
                            {s.name.substring(0, 2).toUpperCase()}
                        </div>
                    ))}
                </div>
            </div>

            {/* Main content */}
            <div className="flex-1 flex flex-col overflow-hidden">
                {/* Status */}
                <div className="fixed top-0 right-0 px-4 py-2 bg-black/80 text-white text-xs font-medium z-[1000] rounded-bl">
                    <span className="text-success">● Ready</span>
                </div>

                {/* Tabs */}
                <div className="flex bg-bg-tertiary border-b border-border overflow-x-auto shrink-0">
                    {sessions.map(s => (
                        <div
                            key={s.id}
                            onClick={() => setActiveId(s.id)}
                            className={`px-4 py-2.5 border-r border-border cursor-pointer flex items-center gap-2 min-w-[120px] max-w-[200px] group ${
                                activeId === s.id
                                    ? 'bg-bg-primary text-text-primary border-b-2 border-b-accent'
                                    : 'bg-bg-tertiary text-text-secondary hover:bg-bg-hover'
                            }`}
                        >
                            <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[13px]">{s.name}</span>
                            <span
                                onClick={(e) => { e.stopPropagation(); closeSession(s.id); }}
                                className="w-4 h-4 flex items-center justify-center rounded text-sm cursor-pointer opacity-0 group-hover:opacity-100 hover:bg-border-hover"
                            >
                                ×
                            </span>
                        </div>
                    ))}
                </div>

                {/* Terminals */}
                <div className="flex-1 relative overflow-hidden">
                    {sessions.length === 0 ? (
                        <EmptyState onNewSession={() => setModalOpen(true)} />
                    ) : (
                        sessions.map(s => (
                            <SessionView
                                key={s.id}
                                sessionData={s}
                                isActive={activeId === s.id}
                                onSessionIdChange={(sid) => setSessions(prev => prev.map(x => x.id === s.id ? { ...x, sessionId: sid } : x))}
                            />
                        ))
                    )}
                </div>
            </div>

            <NewSessionModal isOpen={modalOpen} onClose={() => setModalOpen(false)} onCreate={createSession} />
        </>
    );
}
