import { app, BrowserWindow, ipcMain } from 'electron'
import https from 'https'

const LICENSE_SERVER_URL = 'https://studio-license.45d.io'
const PREMIUM_REPO_OWNER = '45Drives'
const PREMIUM_REPO_NAME = '45Flow'

/**
 * Handles the Community → Premium upgrade flow.
 *
 * This is NOT a general auto-updater — it only activates when the user
 * explicitly enters a valid license key in the Settings upgrade panel.
 *
 * Flow:
 *   1. User enters license key in Settings
 *   2. Renderer calls 'upgrade:validate' → we check key with license server
 *   3. If valid, renderer calls 'upgrade:start' → we set feed to Premium repo,
 *      download the update, and install it
 *   4. App restarts as Premium Edition (same appId, in-place replacement)
 */
export function initPremiumUpgrade(getMainWindow: () => BrowserWindow | null) {
    if (!app.isPackaged) return

    let autoUpdater: any = null
    try {
        ;({ autoUpdater } = require('electron-updater'))
    } catch (e) {
        console.warn('[upgrade] electron-updater unavailable; premium upgrade disabled.', e)
        return
    }

    // ── Validate license key against VPS ────────────────────────────────
    ipcMain.handle('upgrade:validate', async (_event, licenseKey: string) => {
        const key = String(licenseKey || '').trim()
        if (!key) return { ok: false, error: 'Please enter a license key.' }

        try {
            const resp = await fetch(`${LICENSE_SERVER_URL}/api/licenses/validate`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ licenseKey: key }),
                signal: AbortSignal.timeout(10_000),
            })

            const body = await resp.json()

            if (!resp.ok || !body.ok) {
                const errorMap: Record<string, string> = {
                    invalid_license_key: 'Invalid license key format.',
                    license_not_found: 'License key not found. Please check your key and try again.',
                    license_revoked: 'This license has been revoked. Contact support.',
                    license_expired: 'This license has expired. Please renew to upgrade.',
                }
                return { ok: false, error: errorMap[body.error] || body.error || 'Validation failed.' }
            }

            return { ok: true, product: body.product, perpetual: body.perpetual, expiresAt: body.expiresAt }
        } catch (err: any) {
            if (err?.name === 'AbortError' || /timeout/i.test(err?.message || '')) {
                return { ok: false, error: 'Could not reach the license server. Check your internet connection.' }
            }
            return { ok: false, error: `License validation failed: ${err?.message || 'Unknown error'}` }
        }
    })

    // ── Download and install Premium edition ────────────────────────────
    ipcMain.handle('upgrade:start', async () => {
        if (!autoUpdater) return { ok: false, error: 'Updater not available.' }

        try {
            // Point updater at the Premium releases repo
            autoUpdater.setFeedURL({
                provider: 'github',
                owner: PREMIUM_REPO_OWNER,
                repo: PREMIUM_REPO_NAME,
            })

            autoUpdater.autoDownload = true
            autoUpdater.autoInstallOnAppQuit = false
            autoUpdater.allowPrerelease = false

            const win = getMainWindow()

            autoUpdater.on('download-progress', (p: any) => {
                win?.webContents.send('upgrade:progress', {
                    percent: p.percent,
                    transferred: p.transferred,
                    total: p.total,
                    bytesPerSecond: p.bytesPerSecond,
                })
            })

            autoUpdater.on('update-downloaded', () => {
                win?.webContents.send('upgrade:downloaded')
            })

            autoUpdater.on('error', (err: any) => {
                win?.webContents.send('upgrade:error', {
                    message: err?.message || 'Download failed.',
                })
            })

            const result = await autoUpdater.checkForUpdates()
            if (!result?.updateInfo?.version) {
                return { ok: false, error: 'No Premium release found. Please try again later.' }
            }

            return { ok: true, version: result.updateInfo.version }
        } catch (err: any) {
            return { ok: false, error: `Upgrade failed: ${err?.message || 'Unknown error'}` }
        }
    })

    // ── Install downloaded update (restart app) ─────────────────────────
    ipcMain.handle('upgrade:install', () => {
        if (!autoUpdater) return { ok: false, error: 'Updater not available.' }
        autoUpdater.quitAndInstall(false, true)
        return { ok: true }
    })
}
