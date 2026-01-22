import { useState, useEffect, useRef } from 'react';
import Fuse from 'fuse.js';

interface DirEntry {
    name: string;
    path: string;
}

interface Props {
    value: string;
    onChange: (value: string) => void;
    error?: string;
    placeholder?: string;
    autoFocus?: boolean;
}

export default function DirectoryInput({ value, onChange, error, placeholder = '/path/to/directory', autoFocus }: Props) {
    const [suggestions, setSuggestions] = useState<DirEntry[]>([]);
    const [selectedIndex, setSelectedIndex] = useState(-1);
    const [focused, setFocused] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (autoFocus) inputRef.current?.focus();
    }, [autoFocus]);

    useEffect(() => {
        if (!value) return;
        const timer = setTimeout(async () => {
            const lastSlash = value.lastIndexOf('/');
            const parentPath = value.substring(0, lastSlash) || '/';
            const partial = value.substring(lastSlash + 1).toLowerCase();

            try {
                const res = await fetch(`/api/directories?path=${encodeURIComponent(parentPath)}`);
                const data = await res.json();

                if (!data.entries?.length) {
                    setSuggestions([]);
                    return;
                }

                // Use Fuse.js for fuzzy search
                if (partial) {
                    const fuse = new Fuse(data.entries, { keys: ['name'], threshold: 0.4 });
                    const results = fuse.search(partial).slice(0, 10);
                    setSuggestions(results.map(r => r.item));
                } else {
                    setSuggestions(data.entries.slice(0, 10));
                }
                setSelectedIndex(-1);
            } catch {
                setSuggestions([]);
            }
        }, 150);
        return () => clearTimeout(timer);
    }, [value]);

    const selectSuggestion = (s: DirEntry) => {
        onChange(s.path + '/');
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
            selectSuggestion(suggestions[selectedIndex >= 0 ? selectedIndex : 0]);
        } else if (e.key === 'Enter' && suggestions.length > 0 && selectedIndex >= 0) {
            e.preventDefault();
            selectSuggestion(suggestions[selectedIndex]);
        }
    };

    return (
        <div className="relative">
            <input
                ref={inputRef}
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => setFocused(true)}
                onBlur={() => setTimeout(() => setFocused(false), 150)}
                className={`w-full px-3 py-2.5 bg-bg-tertiary rounded text-text-primary text-sm outline-none border ${
                    error ? 'border-error' : 'border-border focus:border-accent'
                }`}
                placeholder={placeholder}
                autoComplete="off"
            />
            {focused && suggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 bg-bg-tertiary border border-t-0 border-border rounded-b max-h-[200px] overflow-y-auto z-10">
                    {suggestions.map((s, i) => (
                        <div
                            key={s.path}
                            onClick={() => selectSuggestion(s)}
                            className={`px-3 py-2 cursor-pointer text-[13px] ${
                                i === selectedIndex
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
    );
}
