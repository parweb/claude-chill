import { useState, useEffect, useRef } from 'react';
import SessionConnection from './SessionConnection';

export default function useSession(directory, name, initialSessionId, onSessionIdChange) {
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
