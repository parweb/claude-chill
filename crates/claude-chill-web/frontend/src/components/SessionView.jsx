import TerminalView from './TerminalView';
import useSession from './useSession';

export default function SessionView({ sessionData, isActive, onSessionIdChange }) {
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
