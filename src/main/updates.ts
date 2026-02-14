import { app, BrowserWindow, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'

export function initAutoUpdates(getMainWindow: () => BrowserWindow | null) {
    // Never run auto-update in dev
    if (!app.isPackaged) return

    // Optional: safer UX defaults
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true

    autoUpdater.on('checking-for-update', () => {
        getMainWindow()?.webContents.send('update:checking')
    })

    autoUpdater.on('update-available', (info) => {
        getMainWindow()?.webContents.send('update:available', info)
    })

    autoUpdater.on('update-not-available', (info) => {
        getMainWindow()?.webContents.send('update:none', info)
    })

    autoUpdater.on('download-progress', (p) => {
        getMainWindow()?.webContents.send('update:progress', {
            percent: p.percent,
            transferred: p.transferred,
            total: p.total,
            bytesPerSecond: p.bytesPerSecond,
        })
    })

    autoUpdater.on('update-downloaded', (info) => {
        // At this point you can either:
        // - let it install on quit (autoInstallOnAppQuit=true)
        // - or prompt and call quitAndInstall
        getMainWindow()?.webContents.send('update:downloaded', info)

        // getMainWindow()?.webContents.send('update:downloaded', {
        //     ...info,
        //     willInstallOnQuit: true,
        // })
    })

    autoUpdater.on('error', (err) => {
        getMainWindow()?.webContents.send('update:error', {
            message: err?.message || String(err),
        })
    })

    ipcMain.handle('update:check', async () => {
        return await autoUpdater.checkForUpdates()
    })

    ipcMain.handle('update:install', async () => {
        autoUpdater.quitAndInstall(false, true)
        return { ok: true }
    })

    // Do an initial check shortly after app is ready
    setTimeout(() => autoUpdater.checkForUpdatesAndNotify(), 5_000)
}
