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

    // Create session once, never cleanup (Activity will hide/show but WS stays open)
    if (!sessionRef.current) {
        sessionRef.current = new SessionConnection(directory, name, initialSessionId, () => {
            forceUpdate({});
            if (sessionRef.current?.sessionId && sessionRef.current.sessionId !== initialSessionId) {
                onSessionIdChange(sessionRef.current.sessionId);
            }
            if (sessionRef.current) {
                onStatusChange(sessionRef.current.status);
            }
        });
    }

    useEffect(() => {
        sessionRef.current?.connect();
    }, []);

    return sessionRef.current;
}
