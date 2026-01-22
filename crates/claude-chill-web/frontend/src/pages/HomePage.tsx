import { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import TabBar from '@/components/TabBar';
import EmptyState from '@/components/EmptyState';
import SessionView from '@/components/SessionView';
import NewSessionModal from '@/components/NewSessionModal';
import type { Session } from '@/components/types';

export default function HomePage() {
    const [sessions, setSessions] = useState<Session[]>([]);
    const [activeId, setActiveId] = useState<string | null>(null);
    const [modalOpen, setModalOpen] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch('/api/sessions');
                const serverSessions: { id: string }[] = await res.json();
                const serverIds = new Set(serverSessions.map(s => s.id));
                const saved = JSON.parse(localStorage.getItem('claude-chill-sessions') || '[]');
                const restored = saved.filter((s: { sessionId: string }) => serverIds.has(s.sessionId));
                if (restored.length > 0) {
                    const sessionsWithIds = restored.map((s: Omit<Session, 'id'>, i: number) => ({ ...s, id: `session-${i}` }));
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

    const createSession = (directory: string, name: string) => {
        const id = `session-${Date.now()}`;
        setSessions(prev => [...prev, { id, directory, name, sessionId: null }]);
        setActiveId(id);
    };

    const closeSession = (id: string) => {
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
            <Sidebar
                sessions={sessions}
                activeId={activeId}
                onSelect={setActiveId}
                onNewSession={() => setModalOpen(true)}
            />

            <div className="flex-1 flex flex-col overflow-hidden">
                <div className="fixed top-0 right-0 px-4 py-2 bg-black/80 text-white text-xs font-medium z-[1000] rounded-bl">
                    <span className="text-success">● Ready</span>
                </div>

                <TabBar
                    sessions={sessions}
                    activeId={activeId}
                    onSelect={setActiveId}
                    onClose={closeSession}
                />

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
