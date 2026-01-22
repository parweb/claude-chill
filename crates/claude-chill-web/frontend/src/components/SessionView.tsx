import type { ConnectionStatus } from "@/components/SessionConnection";
import TerminalView from "@/components/TerminalView";
import type { SessionType } from "@/components/types";
import useSession from "@/components/useSession";

interface Props {
  sessionData: {
    directory: string;
    name: string;
    sessionId: string | null;
    sessionType: SessionType;
  };
  isActive: boolean;
  onSessionIdChange: (id: string) => void;
  onStatusChange: (status: ConnectionStatus) => void;
}

export default function SessionView({
  sessionData,
  isActive,
  onSessionIdChange,
  onStatusChange,
}: Props) {
  const session = useSession(
    sessionData.directory,
    sessionData.name,
    sessionData.sessionId,
    sessionData.sessionType,
    onSessionIdChange,
    onStatusChange,
  );
  if (!session) return null;

  return (
    <div className="h-full relative">
      <TerminalView session={session} isActive={isActive} />
      {session.status === "ended" && (
        <button
          onClick={session.restart}
          className="absolute bottom-5 left-1/2 -translate-x-1/2 z-10 px-4 py-2 bg-accent text-white rounded hover:bg-accent-hover"
        >
          ↻ Restart Session
        </button>
      )}
    </div>
  );
}
