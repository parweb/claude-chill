import { useState, useEffect } from 'react';
import DirectoryInput from '@/components/DirectoryInput';

export type SessionType = 'claude' | 'kiro';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onCreate: (directory: string, name: string, sessionType: SessionType) => void;
}

export default function NewSessionModal({ isOpen, onClose, onCreate }: Props) {
    const [directory, setDirectory] = useState('');
    const [name, setName] = useState('');
    const [sessionType, setSessionType] = useState<SessionType>('claude');
    const [error, setError] = useState('');
    const [ready, setReady] = useState(false);

    useEffect(() => {
        if (isOpen) {
            fetch('/api/config')
                .then(res => res.json())
                .then(data => {
                    setDirectory(data.default_directory + '/');
                    setReady(true);
                })
                .catch(() => {
                    setDirectory('/');
                    setReady(true);
                });
            setName('');
            setSessionType('claude');
            setError('');
        } else {
            setReady(false);
        }
    }, [isOpen]);

    // Validate directory exists
    useEffect(() => {
        if (!directory) return;
        const timer = setTimeout(async () => {
            const lastSlash = directory.lastIndexOf('/');
            const parentPath = directory.substring(0, lastSlash) || '/';
            try {
                const res = await fetch(`/api/directories?path=${encodeURIComponent(parentPath)}`);
                const data = await res.json();
                setError(data.exists ? '' : 'Directory does not exist');
            } catch {
                setError('');
            }
        }, 200);
        return () => clearTimeout(timer);
    }, [directory]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (error) return;
        onCreate(directory, name || directory.split('/').filter(Boolean).pop() || 'Session', sessionType);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div
            onClick={(e) => e.target === e.currentTarget && onClose()}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
        >
            <div className="bg-bg-secondary rounded-lg w-[90%] max-w-[500px] shadow-xl">
                <div className="p-5 border-b border-border flex justify-between items-center">
                    <h2 className="text-text-primary text-lg font-medium m-0">New Session</h2>
                    <button
                        onClick={onClose}
                        className="w-[30px] h-[30px] bg-transparent border-none text-text-secondary text-[28px] cursor-pointer flex items-center justify-center rounded hover:bg-border-hover hover:text-text-primary"
                    >
                        ×
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="p-5">
                    <div className="mb-5">
                        <label className="block text-text-secondary text-[13px] font-medium mb-2">
                            Working Directory:
                        </label>
                        <DirectoryInput
                            value={directory}
                            onChange={setDirectory}
                            error={error}
                            autoFocus={ready}
                        />
                        <small className={`block mt-1.5 text-xs ${error ? 'text-error' : 'text-text-muted'}`}>
                            {error || 'Type to search directories (fuzzy match)'}
                        </small>
                    </div>
                    <div className="mb-5">
                        <label className="block text-text-secondary text-[13px] font-medium mb-2">
                            Session Type:
                        </label>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => setSessionType('claude')}
                                className={`flex-1 px-3 py-2.5 rounded text-sm font-medium border transition-colors ${
                                    sessionType === 'claude'
                                        ? 'bg-accent text-white border-accent'
                                        : 'bg-bg-tertiary text-text-secondary border-border hover:border-accent'
                                }`}
                            >
                                Claude Code
                            </button>
                            <button
                                type="button"
                                onClick={() => setSessionType('kiro')}
                                className={`flex-1 px-3 py-2.5 rounded text-sm font-medium border transition-colors ${
                                    sessionType === 'kiro'
                                        ? 'bg-accent text-white border-accent'
                                        : 'bg-bg-tertiary text-text-secondary border-border hover:border-accent'
                                }`}
                            >
                                Kiro CLI
                            </button>
                        </div>
                    </div>
                    <div className="mb-5">
                        <label className="block text-text-secondary text-[13px] font-medium mb-2">
                            Session Name (optional):
                        </label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full px-3 py-2.5 bg-bg-tertiary border border-border rounded text-text-primary text-sm outline-none focus:border-accent"
                            placeholder="My Project"
                        />
                    </div>
                    <div className="flex justify-end gap-2.5 pt-2.5">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 bg-border border-none rounded text-[13px] font-medium text-text-secondary cursor-pointer hover:bg-border-hover hover:text-text-primary"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={!!error}
                            className="px-4 py-2 bg-accent border-none rounded text-[13px] font-medium text-white cursor-pointer hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Create Session
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
