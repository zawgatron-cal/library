// Checks GitHub Releases for a newer Library and installs it with as little friction as possible.
// Windows & Linux AppImage: electron-updater downloads in the background, then one restart prompt.
// macOS: downloads the zip quietly, then swaps Library.app on restart (works with ad-hoc signing).
// Linux .deb: downloads the package and installs via pkexec when possible.
const { app, dialog, shell } = require('electron')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { pipeline } = require('node:stream/promises')
const { createWriteStream } = require('node:fs')
const { Readable } = require('node:stream')

const REPO = 'zawgatron-cal/library'
const CHECK_DELAY_MS = 8_000
const CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000

function parseVersion(v) {
  const m = String(v).replace(/^v/i, '').match(/^(\d+)\.(\d+)\.(\d+)/)
  return m ? [+m[1], +m[2], +m[3]] : null
}

function isNewer(latest, current) {
  const a = parseVersion(latest)
  const b = parseVersion(current)
  if (!a || !b) return false
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i]
  return false
}

function pickAsset(release, pattern) {
  return release.assets?.find((a) => pattern.test(a.name)) ?? null
}

async function fetchLatestRelease() {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': `Library/${app.getVersion()}` },
  })
  if (!res.ok) return null
  return res.json()
}

function assetForThisInstall(release) {
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
  if (process.platform === 'darwin') {
    return pickAsset(release, new RegExp(`mac-${arch}\\.zip$`, 'i'))
  }
  if (process.platform === 'win32') {
    return pickAsset(release, /win-.*\.exe$/i)
  }
  if (process.env.APPIMAGE) {
    const want = process.arch === 'arm64' ? 'arm64' : 'x86_64'
    return pickAsset(release, new RegExp(`${want}\\.AppImage$`, 'i'))
  }
  return pickAsset(release, process.arch === 'arm64' ? /arm64\.deb$/i : /amd64\.deb$/i)
}

async function downloadToFile(url, dest, onProgress) {
  const res = await fetch(url, { headers: { 'User-Agent': `Library/${app.getVersion()}` }, redirect: 'follow' })
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status})`)
  const total = Number(res.headers.get('content-length')) || 0
  let received = 0
  await fsp.mkdir(path.dirname(dest), { recursive: true })
  const tmp = `${dest}.partial`
  const file = createWriteStream(tmp)
  const body = Readable.fromWeb(res.body)
  body.on('data', (chunk) => {
    received += chunk.length
    if (total && onProgress) onProgress(received / total)
  })
  await pipeline(body, file)
  await fsp.rename(tmp, dest)
  return dest
}

function runDetached(command, args, opts = {}) {
  const child = spawn(command, args, { detached: true, stdio: 'ignore', ...opts })
  child.unref()
  return child
}

/* ----- Windows / AppImage via electron-updater ----- */

function setupElectronUpdater(win) {
  const { autoUpdater } = require('electron-updater')
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('error', () => {})

  autoUpdater.on('update-downloaded', async (info) => {
    if (win.isDestroyed()) return
    const { response } = await dialog.showMessageBox(win, {
      type: 'info',
      title: 'Update ready',
      message: `Library ${info.version} is ready.`,
      detail: 'Restart to install. You can keep reading — it will also install when you quit.',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1,
    })
    if (response === 0) autoUpdater.quitAndInstall(false, true)
  })

  autoUpdater.checkForUpdates().catch(() => {})
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), CHECK_INTERVAL_MS)
}

/* ----- macOS: download zip, swap .app on restart ----- */

function macAppPath() {
  // …/Library.app/Contents/MacOS/Library → …/Library.app
  return path.resolve(process.execPath, '..', '..', '..')
}

async function extractMacZip(zipPath, destDir) {
  await fsp.rm(destDir, { recursive: true, force: true })
  await fsp.mkdir(destDir, { recursive: true })
  await new Promise((resolve, reject) => {
    const child = spawn('ditto', ['-x', '-k', zipPath, destDir], { stdio: 'ignore' })
    child.on('error', reject)
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`ditto exited ${code}`))))
  })
  const entries = await fsp.readdir(destDir)
  const appName = entries.find((n) => n.endsWith('.app'))
  if (!appName) throw new Error('Update zip did not contain an .app')
  return path.join(destDir, appName)
}

function writeMacApplyScript(scriptPath) {
  const body = `#!/bin/bash
set -euo pipefail
PID="$1"
DEST="$2"
SRC="$3"
while kill -0 "$PID" 2>/dev/null; do sleep 0.4; done
sleep 0.6
xattr -cr "$SRC" 2>/dev/null || true
rm -rf "$DEST"
mkdir -p "$(dirname "$DEST")"
mv "$SRC" "$DEST"
xattr -cr "$DEST" 2>/dev/null || true
open "$DEST"
rm -f "$0"
`
  fs.writeFileSync(scriptPath, body, { mode: 0o755 })
}

function applyMacUpdateAndRelaunch(newAppPath) {
  const dest = macAppPath()
  const scriptPath = path.join(app.getPath('temp'), `library-apply-${Date.now()}.sh`)
  writeMacApplyScript(scriptPath)
  runDetached('/bin/bash', [scriptPath, String(process.pid), dest, newAppPath])
  app.quit()
}

function setupMacUpdater(win) {
  let busy = false
  let pendingApp = null

  const offerRestart = async (version, newAppPath) => {
    pendingApp = newAppPath
    if (win.isDestroyed()) return
    const { response } = await dialog.showMessageBox(win, {
      type: 'info',
      title: 'Update ready',
      message: `Library ${version} is ready.`,
      detail: 'Restart to install. Choosing Later installs it the next time you quit.',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1,
    })
    if (response === 0) applyMacUpdateAndRelaunch(newAppPath)
  }

  app.on('before-quit', () => {
    if (!pendingApp) return
    const next = pendingApp
    pendingApp = null
    const scriptPath = path.join(app.getPath('temp'), `library-apply-${Date.now()}.sh`)
    writeMacApplyScript(scriptPath)
    runDetached('/bin/bash', [scriptPath, String(process.pid), macAppPath(), next])
  })

  const check = async () => {
    if (busy) return
    busy = true
    try {
      const release = await fetchLatestRelease()
      if (!release || !isNewer(release.tag_name, app.getVersion())) return
      const asset = assetForThisInstall(release)
      if (!asset?.browser_download_url) return

      const version = release.tag_name.replace(/^v/, '')
      const dest = macAppPath()
      try {
        fs.accessSync(path.dirname(dest), fs.constants.W_OK)
      } catch {
        // Can't replace the app in place (e.g. managed /Applications) — open the .dmg instead.
        const dmg = pickAsset(release, new RegExp(`mac-${process.arch === 'arm64' ? 'arm64' : 'x64'}\\.dmg$`, 'i'))
        if (dmg?.browser_download_url) await shell.openExternal(dmg.browser_download_url)
        return
      }

      const dir = path.join(app.getPath('temp'), 'library-updates')
      const zipPath = path.join(dir, asset.name)
      const extractDir = path.join(dir, `extract-${version}`)

      if (!fs.existsSync(zipPath)) {
        await downloadToFile(asset.browser_download_url, zipPath)
      }
      const newApp = await extractMacZip(zipPath, extractDir)
      await offerRestart(version, newApp)
    } catch {
      /* offline, permissions, etc. — try again next interval */
    } finally {
      busy = false
    }
  }

  setTimeout(check, CHECK_DELAY_MS)
  setInterval(check, CHECK_INTERVAL_MS)
}

/* ----- Linux .deb: download + pkexec dpkg ----- */

function setupDebUpdater(win) {
  let busy = false

  const check = async () => {
    if (busy) return
    busy = true
    try {
      const release = await fetchLatestRelease()
      if (!release || !isNewer(release.tag_name, app.getVersion())) return
      const asset = assetForThisInstall(release)
      if (!asset?.browser_download_url) return

      const version = release.tag_name.replace(/^v/, '')
      const debPath = path.join(app.getPath('temp'), 'library-updates', asset.name)
      if (!fs.existsSync(debPath)) await downloadToFile(asset.browser_download_url, debPath)

      if (win.isDestroyed()) return
      const { response } = await dialog.showMessageBox(win, {
        type: 'info',
        title: 'Update ready',
        message: `Library ${version} is ready.`,
        detail: 'Install now? You may be asked for your password.',
        buttons: ['Install now', 'Later'],
        defaultId: 0,
        cancelId: 1,
      })
      if (response !== 0) return

      await new Promise((resolve, reject) => {
        const child = spawn('pkexec', ['dpkg', '-i', debPath], { stdio: 'ignore' })
        child.on('error', reject)
        child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`dpkg exited ${code}`))))
      }).catch(async () => {
        // Fall back to opening the package for the system installer.
        await shell.openPath(debPath)
      })

      if (!win.isDestroyed()) {
        const { response: again } = await dialog.showMessageBox(win, {
          type: 'info',
          title: 'Update installed',
          message: 'Restart Library to use the new version?',
          buttons: ['Restart now', 'Later'],
          defaultId: 0,
          cancelId: 1,
        })
        if (again === 0) {
          app.relaunch()
          app.quit()
        }
      }
    } catch {
      /* ignore */
    } finally {
      busy = false
    }
  }

  setTimeout(check, CHECK_DELAY_MS)
  setInterval(check, CHECK_INTERVAL_MS)
}

/** Call once after the main window exists. No-op in dev or unpackaged builds. */
function setupUpdates(win) {
  if (!app.isPackaged || !win) return

  setTimeout(() => {
    try {
      if (process.platform === 'darwin') {
        setupMacUpdater(win)
      } else if (process.platform === 'win32' || process.env.APPIMAGE) {
        setupElectronUpdater(win)
      } else if (process.platform === 'linux') {
        setupDebUpdater(win)
      }
    } catch {
      /* updater optional */
    }
  }, CHECK_DELAY_MS)
}

module.exports = { setupUpdates, isNewer, parseVersion }
