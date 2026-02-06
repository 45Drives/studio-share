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
  access_mode?: 'open' | 'restricted'
  auth_mode?: 'none' | 'password'
  allow_comments?: boolean
  createdIp?: string | null
  createdUa?: string | null
  owner?: { id?: number|string|null, username?: string|null, display_name?: string|null }
  target?: { dirRel?: string; allowUpload?: boolean; files?: Array<{ id?: string; name?: string; size?: number; mime?: string }> }
}
export type Role = {
  id: number
  name: string
  can_view: boolean
  can_comment: boolean
  can_download: boolean
  can_upload: boolean
  is_system?: boolean
}
export type AccessRow = {
  user_id: number
  user_name?: string
  name?: string
  user_email?: string
  display_color?: string | null
  role_id?: number | null
  role_name?: string | null
  role?: {
    id: number
    name: string
    permissions: {
      view: boolean
      comment: boolean
      download: boolean
      upload: boolean
    }
  } | null
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
  role_id?: number | null
  role_name?: string | null
  role?: Role | null

}
export type RsyncResult = { ok?: boolean; error?: string }
export type ExistingUser = {
  id?: string | number
  username: string
  name?: string
  user_email?: string
  display_color?: string
  role_id?: number | null
  role_name?: string | null
  role?: Role | null
  default_role_id?: number | null
  default_role_name?: string | null
  default_role?: Role | null
}

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
