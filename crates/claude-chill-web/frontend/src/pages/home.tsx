import { useState, useEffect, Activity } from 'react';
import { useNavigate, useParams } from 'react-router';
import Sidebar from '@/components/Sidebar';
import TabBar from '@/components/TabBar';
import EmptyState from '@/components/EmptyState';
import SessionView from '@/components/SessionView';
import NewSessionModal, { type SessionType } from '@/components/NewSessionModal';
import type { Session } from '@/components/types';

export default function HomePage() {
    const [sessions, setSessions] = useState<Session[]>([]);
    const [initialized, setInitialized] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    const navigate = useNavigate();
    const { sessionId: activeId } = useParams();

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch('/api/sessions');
                const serverSessions: { id: string }[] = await res.json();
                const serverIds = new Set(serverSessions.map(s => s.id));
                const saved: Session[] = JSON.parse(localStorage.getItem('claude-chill-sessions') || '[]');
                const restored = saved.filter(s => s.sessionId && serverIds.has(s.sessionId))
                    .map(s => ({ ...s, status: 'connecting' as const, sessionType: s.sessionType || 'claude' as const }));
                if (restored.length > 0) {
                    setSessions(restored);
                    if (!activeId || !restored.some(s => s.id === activeId)) {
                        navigate(`/session/${restored[0].id}`, { replace: true });
                    }
                }
            } catch (e) {
                console.error('Failed to restore sessions:', e);
            }
            setInitialized(true);
        })();
    }, []);

    useEffect(() => {
        if (initialized) {
            localStorage.setItem('claude-chill-sessions', JSON.stringify(sessions));
        }
    }, [sessions, initialized]);

    const createSession = (directory: string, name: string, sessionType: SessionType) => {
        const id = `pending-${Date.now()}`;
        setSessions(prev => [...prev, { id, directory, name, sessionId: null, status: 'connecting', sessionType }]);
        navigate(`/session/${id}`);
    };

    const closeSession = (id: string) => {
        const session = sessions.find(s => s.id === id);
        if (!session || !confirm(`Close session "${session.name}"?`)) return;
        const remaining = sessions.filter(s => s.id !== id);
        setSessions(remaining);
        if (activeId === id) {
            if (remaining.length > 0) {
                navigate(`/session/${remaining[0].id}`);
            } else {
                navigate('/');
            }
        }
    };

    const updateSessionId = (oldId: string, sessionId: string) => {
        setSessions(prev => prev.map(s => 
            s.id === oldId ? { ...s, id: sessionId, sessionId } : s
        ));
        if (activeId === oldId) {
            navigate(`/session/${sessionId}`, { replace: true });
        }
    };

    const updateSessionStatus = (id: string, status: Session['status']) => {
        setSessions(prev => prev.map(s => s.id === id ? { ...s, status } : s));
    };

    return (
        <>
            <Sidebar
                sessions={sessions}
                activeId={activeId ?? null}
                onSelect={(id) => navigate(`/session/${id}`)}
                onNewSession={() => setModalOpen(true)}
            />

            <div className="flex-1 flex flex-col overflow-hidden">
                <TabBar
                    sessions={sessions}
                    activeId={activeId ?? null}
                    onSelect={(id) => navigate(`/session/${id}`)}
                    onClose={closeSession}
                />

                <div className="flex-1 relative overflow-hidden">
                    {sessions.length === 0 ? (
                        <EmptyState onNewSession={() => setModalOpen(true)} />
                    ) : (
                        sessions.map(s => (
                            <Activity key={s.id} mode={s.id === activeId ? 'visible' : 'hidden'}>
                                <SessionView
                                    sessionData={s}
                                    isActive={s.id === activeId}
                                    onSessionIdChange={(sid) => updateSessionId(s.id, sid)}
                                    onStatusChange={(status) => updateSessionStatus(s.id, status)}
                                />
                            </Activity>
                        ))
                    )}
                </div>
            </div>

            <NewSessionModal isOpen={modalOpen} onClose={() => setModalOpen(false)} onCreate={createSession} />
        </>
    );
}
