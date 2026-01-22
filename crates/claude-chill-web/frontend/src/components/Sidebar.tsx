import type { Session } from "@/components/types";
import { LuPlus, LuSettings } from "react-icons/lu";

interface Props {
  sessions: Session[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNewSession: () => void;
  onSettings: () => void;
}

export default function Sidebar({
  sessions,
  activeId,
  onSelect,
  onNewSession,
  onSettings,
}: Props) {
  return (
    <div className="w-[50px] bg-bg-secondary border-r border-border flex flex-col z-[100]">
      <div className="p-2.5 border-b border-border">
        <button
          onClick={onNewSession}
          title="New Session"
          className="w-[30px] h-[30px] bg-transparent border-none text-text-secondary cursor-pointer flex items-center justify-center rounded hover:bg-border-hover hover:text-text-primary"
        >
          <LuPlus size={20} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        {sessions.map((s) => (
          <div
            key={s.id}
            onClick={() => onSelect(s.id)}
            title={s.name}
            className={`w-[34px] h-[34px] mx-auto my-1 rounded flex items-center justify-center cursor-pointer text-xs font-semibold ${
              activeId === s.id
                ? "bg-accent text-white"
                : "bg-border text-text-secondary hover:bg-border-hover hover:text-text-primary"
            }`}
          >
            {s.name.substring(0, 2).toUpperCase()}
          </div>
        ))}
      </div>
      <div className="p-2.5 border-t border-border">
        <button
          onClick={onSettings}
          title="Settings"
          className="w-[30px] h-[30px] bg-transparent border-none text-text-secondary cursor-pointer flex items-center justify-center rounded hover:bg-border-hover hover:text-text-primary"
        >
          <LuSettings size={18} />
        </button>
      </div>
    </div>
  );
}
