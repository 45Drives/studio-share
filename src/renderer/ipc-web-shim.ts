type Listener = (event: any, payload: any) => void;

(function installWebIPCShim() {
    if (typeof window === 'undefined') return;
    if ((window as any).electron) return; // Electron present → do nothing

    // Centralizes your API base here. If UI & API are on the same origin,
    // leave as '' so fetch('/api/...') is same-origin (no CORS headaches).
    const API_BASE = (window as any).__API_BASE__ || '';

    async function readHttpError(res: Response): Promise<string> {
        const requestId = String(res.headers.get('x-request-id') || '').trim();
        const raw = await res.text().catch(() => '');
        let parsed: any = null;
        try { parsed = raw ? JSON.parse(raw) : null; } catch { parsed = null; }
        const base =
            (parsed && typeof parsed.error === 'string' && parsed.error) ||
            (parsed && typeof parsed.message === 'string' && parsed.message) ||
            raw ||
            `HTTP ${res.status}`;
        const bodyReqId = parsed && typeof parsed.requestId === 'string' ? parsed.requestId : '';
        const rid = bodyReqId || requestId;
        return rid && !String(base).includes(rid) ? `${base} (request ${rid})` : String(base);
    }

    // Minimal EventEmitter
    const listeners = new Map<string, Set<Listener>>();
    function emit(channel: string, payload: any) {
        const set = listeners.get(channel);
        if (!set) return;
        for (const cb of set) cb({ type: channel }, payload);
    }

    // Server-Sent Events for discovery/live updates
    let sse: EventSource | null = null;
    function ensureSSE() {
        if (sse) return;
        try {
            sse = new EventSource(`${API_BASE}/api/discovery/stream`, { withCredentials: false });
            sse.addEventListener('message', (e: MessageEvent) => {
                // Generic messages (we send typed payloads below)
                try {
                    const data = JSON.parse(e.data);
                    if (data?.type) emit(data.type, data.payload);
                } catch { }
            });
            // Specific typed events (optional – you can also stick to 'message')
            sse.addEventListener('hello', () => { /* ignore */ });

            // If server uses `ssePush({type:'discovered-servers', payload:[...]})`
            sse.addEventListener('discovered-servers', (e: MessageEvent) => {
                try { emit('discovered-servers', JSON.parse((e as any).data)); } catch { }
            });

            // Heartbeat handling is server-side; if it closes, we auto-reconnect
            sse.onerror = () => { /* EventSource auto-reconnects */ };
        } catch (err) {
            console.error('SSE init failed:', err);
        }
    }

    const ipcRenderer = {
        on(channel: string, cb: Listener) {
            if (!listeners.has(channel)) listeners.set(channel, new Set());
            listeners.get(channel)!.add(cb);
            if (channel === 'discovered-servers') ensureSSE();
        },
        removeListener(channel: string, cb: Listener) {
            listeners.get(channel)?.delete(cb);
        },

        async invoke(channel: string, ...args: any[]) {
            switch (channel) {
                case 'scan-network-fallback': {
                    // Kick off the server scan, then fetch current list
                    const scanResp = await fetch(`${API_BASE}/api/discovery/scan`, { method: 'POST' });
                    if (!scanResp.ok) throw new Error(await readHttpError(scanResp));
                    const r = await fetch(`${API_BASE}/api/discovery`);
                    if (!r.ok) throw new Error(await readHttpError(r));
                    const json = await r.json();
                    return json.servers || [];
                }
                default:
                    const r = await fetch(`${API_BASE}/ipc/${encodeURIComponent(channel)}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ args }),
                    });
                    if (!r.ok) throw new Error(`IPC invoke failed: ${channel}: ${await readHttpError(r)}`);
                    return r.json();
            }
        },

        send(channel: string, payload?: any) {
            if (channel === 'renderer-ready') return;
            fetch(`${API_BASE}/ipc/${encodeURIComponent(channel)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ payload }),
            }).catch(() => { });
        },
    };

    (window as any).electron = { ipcRenderer };
})();
