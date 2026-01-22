export default function TabBar({ sessions, activeId, onSelect, onClose }) {
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
