export interface Session {
    id: string;
    directory: string;
    name: string;
    sessionId: string | null;
    status: 'connecting' | 'connected' | 'disconnected' | 'ended';
}
