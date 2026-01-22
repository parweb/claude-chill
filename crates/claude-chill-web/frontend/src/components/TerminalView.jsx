import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

export default function TerminalView({ session, isActive }) {
    const containerRef = useRef(null);

    useEffect(() => {
        if (!containerRef.current || session.term) return;

        const term = new Terminal({
            cursorBlink: true,
            fontSize: 14,
            fontFamily: 'Menlo, Monaco, "Courier New", monospace',
            scrollback: 100000,
            theme: { background: '#1e1e1e', foreground: '#d4d4d4' },
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        term.loadAddon(new WebLinksAddon());
        term.open(containerRef.current);
        fitAddon.fit();

        session.term = term;
        session.fitAddon = fitAddon;

        term.onData((data) => session.sendInput(new TextEncoder().encode(data)));

        return () => {
            term.dispose();
            session.term = null;
        };
    }, [session]);

    useEffect(() => {
        if (isActive && session.fitAddon) {
            setTimeout(() => {
                session.fitAddon.fit();
                session.term?.focus();
                session.sendResize();
            }, 0);
        }
    }, [isActive, session]);

    useEffect(() => {
        const handleResize = () => {
            if (isActive && session.fitAddon) {
                session.fitAddon.fit();
                session.sendResize();
            }
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [isActive, session]);

    return (
        <div
            ref={containerRef}
            className={`absolute inset-0 p-2.5 ${isActive ? 'block' : 'hidden'}`}
        />
    );
}
