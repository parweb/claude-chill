import { useOutletContext } from 'react-router';
import SessionView from '@/components/SessionView';
import { useSessionsContext } from '@/pages/home';
import type { Session } from '@/components/types';

export default function SessionPage() {
    const { session } = useOutletContext<{ session: Session }>();
    const { updateSessionId } = useSessionsContext();

    return (
        <SessionView
            sessionData={session}
            isActive={true}
            onSessionIdChange={(sid) => updateSessionId(session.id, sid)}
        />
    );
}
