import { app, BrowserWindow, ipcMain } from 'electron'

export function initAutoUpdates(getMainWindow: () => BrowserWindow | null) {
    // Never run auto-update in dev
    if (!app.isPackaged) return

    let autoUpdater: any
    try {
        ;({ autoUpdater } = require('electron-updater'))
    } catch (e) {
        console.warn('[updates] electron-updater is unavailable; auto-update disabled.', e)
        return
    }

    // Optional: safer UX defaults
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.fullChangelog = false
    autoUpdater.allowPrerelease = false

    function normalizeUpdaterError(err: any): string {
        const raw = String(err?.message || err || 'Unknown updater error')
        const compact = raw.replace(/\s+/g, ' ').trim()

        // electron-updater can surface entire GitHub Atom/XML payloads in error messages.
        // Convert those into actionable, user-facing text.
        if (/<(feed|entry|content|title|updated|link)\b/i.test(compact) || /&lt;[a-z!/]/i.test(compact)) {
            return 'Updater could not parse GitHub release metadata. Ensure the release is published (not draft), has semver tag format (e.g. v0.5.0), and includes required update assets.'
        }
        if (/No published versions on GitHub/i.test(compact)) {
            return 'No published versions were found on GitHub. Publish the release first.'
        }
        if (/Cannot find .*latest\.yml|404/i.test(compact)) {
            return 'Update metadata was not found. Ensure latest.yml/latest-mac.yml is uploaded to the release.'
        }

        return compact
    }

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
            message: normalizeUpdaterError(err),
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
