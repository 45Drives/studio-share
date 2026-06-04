export type { Server, DivisionType, SavedServer } from '../shared/types';

export interface DiscoveryState {
  servers: Server[]
  fallbackTriggered: boolean
}

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
  ssh?:{server:string; username:string; port: number | undefined; keyPath?: string;}
}

/**
 * Default 45Flow watermark image definition
 */
export interface Default45FlowWatermark {
  id: string
  name: string
  path: string
  description: string
}

/**
 * Default 45Flow watermark images
 * These are served from houston-broadcaster's built-in assets at /opt/45drives/houston-broadcaster/watermarks/
 */
export const DEFAULT_45FLOW_WATERMARKS: Default45FlowWatermark[] = [
  {
    id: '45drives',
    name: '45Drives',
    path: '/.watermarks-builtin/45drives.png',
    description: '45Drives logo with fan',
  },
  {
    id: '45drives-nofan',
    name: '45Drives (No Fan)',
    path: '/.watermarks-builtin/45drives-nofan.png',
    description: '45Drives logo without fan',
  },
  {
    id: '45fan',
    name: '45 Fan',
    path: '/.watermarks-builtin/45fan.png',
    description: '45Drives fan icon',
  },
  {
    id: '45homelab',
    name: '45HomeLab',
    path: '/.watermarks-builtin/45homelab.png',
    description: '45HomeLab branding',
  },
  {
    id: '45professional',
    name: '45Professional',
    path: '/.watermarks-builtin/45professional.png',
    description: '45Professional branding',
  },
  {
    id: '45studio',
    name: '45Studio',
    path: '/.watermarks-builtin/45studio.png',
    description: '45Studio branding',
  },
  {
    id: '45flow-grad',
    name: '45Flow Gradient',
    path: '/.watermarks-builtin/45Flow-grad.png',
    description: '45Flow logo with gradient',
  },
  {
    id: '45flow-w',
    name: '45Flow White',
    path: '/.watermarks-builtin/45Flow-w.png',
    description: '45Flow logo in white',
  },
]
