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
    electronAPI: ElectronApi // if you also expose this alias
    logger: {
      log: (...a: any[]) => void
      warn: (...a: any[]) => void
      error: (...a: any[]) => void
    }
  }
}
export {}
