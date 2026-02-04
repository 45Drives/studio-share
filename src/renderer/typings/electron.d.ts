// src/types/electron.d.ts

import type { IpcRendererEvent } from 'electron'

export type UploadResult = { ok?: boolean; path?: string; error?: string }
export type ProgressPayload = { percent: number; speed?: string; eta?: string }

export type RsyncProgress = {
  percent?: number
  rate?: string
  eta?: string
  bytesTransferred?: number
  raw?: string
}
export type RsyncOpts = {
  /** local source path (file or directory) */
  src: string
  host: string
  user: string
  destDir: string
  port?: number
  /** path to private key (optional if using ssh-agent) */
  keyPath?: string
  /** limit bandwidth in KB/s */
  bwlimitKb?: number
  /** extra rsync flags */
  extraArgs?: string[]
  /** request proxy transcode after ingest */
  transcodeProxy?: boolean
  /** requested proxy qualities (e.g. ['720p','1080p','original']) */
  proxyQualities?: string[]
  /** request watermark for video files */
  watermark?: boolean
  /** watermark image filename already present in destDir */
  watermarkFileName?: string
  /** qualities that should receive watermark (defaults to proxyQualities) */
  watermarkProxyQualities?: string[]
}
export type LinkType = 'upload' | 'download' | 'collection'
export type Status = 'active' | 'expired' | 'disabled'

export type LinkItem = {
  id: number | string
  type: LinkType
  title?: string | null
  notes?: string | null
  token?: string | null
  url: string
  downloadUrl?: string | null
  createdAt: number
  expiresAt: number | null
  isDisabled: boolean
  passwordRequired?: boolean
  createdIp?: string | null
  createdUa?: string | null
  owner?: { id?: number|string|null, username?: string|null, display_name?: string|null }
  target?: { dirRel?: string; allowUpload?: boolean; files?: Array<{ id?: string; name?: string; size?: number; mime?: string }> }
}
export type AccessRow = {
  user_id: number
  user_name?: string
  name?: string
  user_email?: string
  display_color?: string | null
  granted_at?: string | null
  is_deleted?: boolean
  is_disabled?: boolean
}
export type Commenter = {
  key: string
  id?: number
  username?: string
  name?: string
  user_email?: string,
    display_color?: string

}
export type RsyncResult = { ok?: boolean; error?: string }

export interface ElectronApi {
  ipcRenderer: {
    send: (channel: string, data?: any) => void
    on: (
      channel: string,
      listener: (event: IpcRendererEvent, ...args: any[]) => void
    ) => void
    invoke: <T = any>(channel: string, ...args: any[]) => Promise<T>
    once?: (
      channel: string,
      listener: (event: IpcRendererEvent, ...args: any[]) => void
    ) => void
    removeListener?: (channel: string, listener: (...args: any[]) => void) => void
    removeAllListeners?: (channel: string) => void
  }

  // dialogs / misc
  selectFolder: () => Promise<string | null>
  getOS: () => Promise<string>
  isFirstRunNeeded: (host: string, share: string, smbUser: string) => Promise<boolean>

  // local picks
  pickFiles: () => Promise<Array<{ path: string; name: string; size: number }>>
  pickFolder: () => Promise<Array<{ path: string; name: string; size: number }>>
  pickWatermark: () => Promise<{ path: string; name: string; size: number } | null>

  /** -------- rsync over SSH (recommended path) -------- */
  rsyncStart: (
    opts: RsyncOpts,
    onProgress?: (p: RsyncProgress) => void
  ) => Promise<{ id: string; done: Promise<RsyncResult> }>

  rsyncCancel: (id: string) => void
}

declare global {
  interface Window {
    electron: ElectronApi
    electronAPI: ElectronApi

    /** New structured logging bridge → handled by main on 'log:info|warn|error' */
    appLog?: {
      info: (event: string, data?: any) => void
      warn: (event: string, data?: any) => void
      error: (event: string, data?: any) => void
    }

    /** (Optional) keep legacy logger if you still use it anywhere */
    logger?: {
      log: (...a: any[]) => void
      warn: (...a: any[]) => void
      error: (...a: any[]) => void
    }
  }
}
export { }
