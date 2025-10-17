export interface Server {
  ip: string;
  name: string;
  lastSeen: number;
  status: "unknown" | "complete" | "not complete";
  setupComplete?: boolean;
  shareName?: string;
  serverName?: string;
  setupTime?: string;
  serverInfo?: {
    moboMake: string;
    moboModel: string;
    serverModel: string;
    aliasStyle: string;
    chassisSize: string;
  };
  manuallyAdded?: boolean;
  fallbackAdded?: boolean;
}

export type DivisionType = 'default' | 'enterprise' | 'homelab' | 'professional' | 'studio';

export interface DiscoveryState {
  servers: Server[]
  fallbackTriggered: boolean
}

export type SavedServer = {
  id: string;
  host: string;
  name?: string;
  username: string;
  favorite?: boolean;
  lastUsedAt?: number;
  // future: token?: string;
};

export interface ConnectionMeta {
  /** Bearer token returned by /api/login */
  token?: string;

  /** TCP port the broadcaster listens on (default 9095) */
  port?: number;

  /**
   * If the remote server advertises an HTTPS host (e.g., box-a.protocase.local),
   * we store it here so the UI can show where we’re connected.
   */
  httpsHost?: string;

  /**
   * Base URL to call for API requests:
   *  - "" (empty string) → same-origin (browser dev behind Caddy)
   *  - "https://box-a.protocase.local" → remote box over HTTPS (browser/electron)
   *  - "http://192.168.x.x:9095" → electron-only fallback when no HTTPS
   */
  apiBase?: string;
  ssh?:{server:string; username:string;}
}
