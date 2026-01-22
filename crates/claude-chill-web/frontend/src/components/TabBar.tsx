import type { Session, SessionType } from '@/components/types';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface Props {
    sessions: Session[];
    activeId: string | null;
    onSelect: (id: string) => void;
    onClose: (id: string) => void;
}

function ProviderIcon({ type }: { type: SessionType }) {
    if (type === 'kiro') {
        return (
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" fill="none"/>
            </svg>
        );
    }
    // Claude icon
    return (
        <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
        </svg>
    );
}

function StatusDot({ status }: { status: Session['status'] }) {
    const config = {
        connecting: { color: 'text-yellow-500', label: 'Connecting...' },
        connected: { color: 'text-success', label: 'Connected' },
        disconnected: { color: 'text-yellow-500', label: 'Disconnected' },
        ended: { color: 'text-error', label: 'Session ended' },
    };
    const { color, label } = config[status || 'connecting'];

    return (
        <Popover>
            <PopoverTrigger asChild>
                <span className={`${color} cursor-help`}>●</span>
            </PopoverTrigger>
            <PopoverContent className="w-auto px-2 py-1 text-xs">{label}</PopoverContent>
        </Popover>
    );
}

export default function TabBar({ sessions, activeId, onSelect, onClose }: Props) {
    return (
        <div className="flex bg-bg-tertiary border-b border-border overflow-x-auto shrink-0">
            {sessions.map(s => (
                <div
                    key={s.id}
                    onClick={() => onSelect(s.id)}
                    className={`px-4 py-2.5 border-r border-border cursor-pointer flex items-center gap-2 min-w-[120px] max-w-[200px] group ${
                        activeId === s.id
                            ? 'bg-bg-primary text-text-primary border-b-2 border-b-accent'
                            : 'bg-bg-tertiary text-text-secondary hover:bg-bg-hover'
                    }`}
                >
                    <ProviderIcon type={s.sessionType} />
                    <StatusDot status={s.status} />
                    <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[13px]">{s.name}</span>
                    <span
                        onClick={(e) => { e.stopPropagation(); onClose(s.id); }}
                        className="w-4 h-4 flex items-center justify-center rounded text-sm cursor-pointer opacity-0 group-hover:opacity-100 hover:bg-border-hover"
                    >
                        ×
                    </span>
                </div>
            ))}
        </div>
    );
}
