import type { Session, SessionType } from "@/components/types";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { LuLayers, LuGlobe, LuX } from "react-icons/lu";

interface Props {
  sessions: Session[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
}

function ProviderIcon({ type }: { type: SessionType }) {
  return {
    kiro: <LuLayers className="w-4 h-4 shrink-0" />,
    claude: <LuGlobe className="w-4 h-4 shrink-0" />,
  }[type];
}

function StatusDot({ status }: { status: Session["status"] }) {
  const config = {
    connecting: { color: "text-yellow-500", label: "Connecting..." },
    connected: { color: "text-success", label: "Connected" },
    disconnected: { color: "text-yellow-500", label: "Disconnected" },
    ended: { color: "text-error", label: "Session ended" },
  };
  const { color, label } = config[status || "connecting"];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <span className={`${color} cursor-help`}>●</span>
      </PopoverTrigger>
      <PopoverContent className="w-auto px-2 py-1 text-xs">
        {label}
      </PopoverContent>
    </Popover>
  );
}

export default function TabBar({
  sessions,
  activeId,
  onSelect,
  onClose,
}: Props) {
  return (
    <div className="flex bg-bg-tertiary border-b border-border overflow-x-auto shrink-0">
      {sessions.map((session) => (
        <div
          key={session.id}
          onClick={() => onSelect(session.id)}
          className={`px-4 py-2.5 border-r border-border cursor-pointer flex items-center gap-2 min-w-[120px] max-w-[200px] group ${
            activeId === session.id
              ? "bg-bg-primary text-text-primary border-b-2 border-b-accent"
              : "bg-bg-tertiary text-text-secondary hover:bg-bg-hover"
          }`}
        >
          <ProviderIcon type={session.sessionType} />
          <StatusDot status={session.status} />

          <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[13px]">
            {session.name}
          </span>

          <span
            onClick={(e) => {
              e.stopPropagation();
              onClose(session.id);
            }}
            className="w-4 h-4 flex items-center justify-center rounded text-sm cursor-pointer opacity-0 group-hover:opacity-100 hover:bg-border-hover"
          >
            <LuX size={10} />
          </span>
        </div>
      ))}
    </div>
  );
}
