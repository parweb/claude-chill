import { useState, useEffect, useRef } from 'react';

export type SessionType = 'claude' | 'kiro';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onCreate: (directory: string, name: string, sessionType: SessionType) => void;
}

interface DirEntry {
    name: string;
    path: string;
}

export default function NewSessionModal({ isOpen, onClose, onCreate }: Props) {
    const [directory, setDirectory] = useState('');
    const [name, setName] = useState('');
    const [sessionType, setSessionType] = useState<SessionType>('claude');
    const [suggestions, setSuggestions] = useState<DirEntry[]>([]);
    const [selectedIndex, setSelectedIndex] = useState(-1);
    const [focused, setFocused] = useState(false);
    const [error, setError] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            setDirectory('/Users/chris.le-guichoux/Sites/');
            setName('');
            setSessionType('claude');
            setError('');
            setSuggestions([]);
            setSelectedIndex(-1);
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isOpen]);

    useEffect(() => {
        if (!directory) return;
        const timer = setTimeout(async () => {
            // Split into parent dir and partial name being typed
            const lastSlash = directory.lastIndexOf('/');
            const parentPath = directory.substring(0, lastSlash) || '/';
            const partial = directory.substring(lastSlash + 1).toLowerCase();
            
            try {
                const res = await fetch(`/api/directories?path=${encodeURIComponent(parentPath)}`);
                const data = await res.json();
                setError(data.exists ? '' : 'Directory does not exist');
                
                // Filter by partial match
                const filtered = (data.entries || [])
                    .filter((e: DirEntry) => e.name.toLowerCase().startsWith(partial))
                    .slice(0, 10);
                setSuggestions(filtered);
                setSelectedIndex(-1);
            } catch (e) {
                console.error('Failed to fetch directories:', e);
            }
        }, 150);
        return () => clearTimeout(timer);
    }, [directory]);

    const selectSuggestion = (s: DirEntry) => {
        setDirectory(s.path + '/');
        setSuggestions([]);
        setSelectedIndex(-1);
        inputRef.current?.focus();
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            setSuggestions([]);
            setSelectedIndex(-1);
        } else if (e.key === 'ArrowDown' && suggestions.length > 0) {
            e.preventDefault();
            setSelectedIndex(i => Math.min(i + 1, suggestions.length - 1));
        } else if (e.key === 'ArrowUp' && suggestions.length > 0) {
            e.preventDefault();
            setSelectedIndex(i => Math.max(i - 1, 0));
        } else if (e.key === 'Tab' && suggestions.length > 0) {
            e.preventDefault();
            const idx = selectedIndex >= 0 ? selectedIndex : 0;
            selectSuggestion(suggestions[idx]);
        } else if (e.key === 'Enter' && suggestions.length > 0) {
            e.preventDefault();
            selectSuggestion(suggestions[selectedIndex >= 0 ? selectedIndex : 0]);
        }
    };

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
                    <h2 className="text-text-primary text-lg font-medium m-0">New Claude Session</h2>
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
                        <div className="relative">
                            <input
                                ref={inputRef}
                                type="text"
                                value={directory}
                                onChange={(e) => setDirectory(e.target.value)}
                                onKeyDown={handleKeyDown}
                                onFocus={() => setFocused(true)}
                                onBlur={() => setTimeout(() => setFocused(false), 150)}
                                className={`w-full px-3 py-2.5 bg-bg-tertiary rounded text-text-primary text-sm outline-none border ${
                                    error ? 'border-error' : 'border-border focus:border-accent'
                                }`}
                                placeholder="/path/to/project"
                                autoComplete="off"
                            />
                            {focused && suggestions.length > 0 && (
                                <div className="absolute top-full left-0 right-0 bg-bg-tertiary border border-t-0 border-border rounded-b max-h-[200px] overflow-y-auto z-10">
                                    {suggestions.map((s, i) => (
                                        <div
                                            key={s.path}
                                            onClick={() => selectSuggestion(s)}
                                            className={`px-3 py-2 cursor-pointer text-[13px] ${
                                                i === selectedIndex || (selectedIndex === -1 && i === 0)
                                                    ? 'bg-accent text-white'
                                                    : 'text-text-secondary hover:bg-accent hover:text-white'
                                            }`}
                                        >
                                            {s.name}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <small className={`block mt-1.5 text-xs ${error ? 'text-error' : 'text-text-muted'}`}>
                            {error || (suggestions.length > 0 ? '↑↓ navigate • Tab/Enter select • Esc close' : 'Directory where Claude will run')}
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
