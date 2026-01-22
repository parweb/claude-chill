import TerminalView from '@/components/TerminalView';
import useSession from '@/components/useSession';
import { Button } from '@/components/ui/button';

interface Props {
    sessionData: { directory: string; name: string; sessionId: string | null };
    isActive: boolean;
    onSessionIdChange: (id: string) => void;
}

export default function SessionView({ sessionData, isActive, onSessionIdChange }: Props) {
    const session = useSession(sessionData.directory, sessionData.name, sessionData.sessionId, onSessionIdChange);
    if (!session) return null;

    return (
        <div className={`${isActive ? 'block' : 'hidden'} h-full relative`}>
            <TerminalView session={session} isActive={isActive} />
            {session.ended && (
                <Button
                    onClick={session.restart}
                    className="absolute bottom-5 left-1/2 -translate-x-1/2 z-10"
                >
                    ↻ Restart Session
                </Button>
            )}
        </div>
    );
}
