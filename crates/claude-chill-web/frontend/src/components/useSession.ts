import { useState, useEffect, useRef } from 'react';
import SessionConnection, { type ConnectionStatus } from '@/components/SessionConnection';

export default function useSession(
    directory: string,
    name: string,
    initialSessionId: string | null,
    onSessionIdChange: (id: string) => void,
    onStatusChange: (status: ConnectionStatus) => void
): SessionConnection | null {
    const [, forceUpdate] = useState({});
    const sessionRef = useRef<SessionConnection | null>(null);

    useEffect(() => {
        const session = new SessionConnection(directory, name, initialSessionId, () => {
            forceUpdate({});
            if (session.sessionId && session.sessionId !== initialSessionId) {
                onSessionIdChange(session.sessionId);
            }
            onStatusChange(session.status);
        });
        sessionRef.current = session;
        session.connect();
        return () => session.close();
    }, []);

    return sessionRef.current;
}
