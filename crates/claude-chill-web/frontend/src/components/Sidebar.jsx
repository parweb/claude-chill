export default function Sidebar({ sessions, activeId, onSelect, onNewSession }) {
    return (
        <div className="w-[50px] bg-bg-secondary border-r border-border flex flex-col z-[100]">
            <div className="p-2.5 border-b border-border">
                <button
                    onClick={onNewSession}
                    title="New Session"
                    className="w-[30px] h-[30px] bg-transparent border-none text-text-secondary cursor-pointer flex items-center justify-center rounded hover:bg-border-hover hover:text-text-primary"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                </button>
            </div>
            <div className="flex-1 overflow-y-auto py-2">
                {sessions.map(s => (
                    <div
                        key={s.id}
                        onClick={() => onSelect(s.id)}
                        title={s.name}
                        className={`w-[34px] h-[34px] mx-auto my-1 rounded flex items-center justify-center cursor-pointer text-xs font-semibold ${
                            activeId === s.id 
                                ? 'bg-accent text-white' 
                                : 'bg-border text-text-secondary hover:bg-border-hover hover:text-text-primary'
                        }`}
                    >
                        {s.name.substring(0, 2).toUpperCase()}
                    </div>
                ))}
            </div>
        </div>
    );
}
