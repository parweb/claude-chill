interface Props {
    onNewSession: () => void;
}

export default function EmptyState({ onNewSession }: Props) {
    return (
        <div className="flex flex-col items-center justify-center h-full text-text-muted text-center p-10">
            <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mb-4 opacity-50">
                <polyline points="4 17 10 11 4 5"></polyline>
                <line x1="12" y1="19" x2="20" y2="19"></line>
            </svg>
            <h3 className="text-lg font-medium mb-2 text-text-secondary">No Active Sessions</h3>
            <p className="text-sm mb-5">Create a new session to start working with Claude</p>
            <button 
                onClick={onNewSession} 
                className="px-4 py-2 bg-accent border-none rounded text-white text-[13px] font-medium cursor-pointer hover:bg-accent-hover"
            >
                + New Session
            </button>
        </div>
    );
}
