import { LuTerminal } from 'react-icons/lu';

interface Props {
    onNewSession: () => void;
}

export default function EmptyState({ onNewSession }: Props) {
    return (
        <div className="flex flex-col items-center justify-center h-full text-text-muted text-center p-10">
            <LuTerminal size={64} className="mb-4 opacity-50" />
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
