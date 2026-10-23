// Checks GitHub Releases for a newer Library and prompts to update. Windows and Linux AppImage can install
// in the background via electron-updater; macOS and Linux deb open the release page (Mac needs notarization for
// silent updates).
const { app, dialog, shell } = require('electron')

const REPO = 'zawgatron-cal/library'
const CHECK_DELAY_MS = 12_000
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

function pickAssetUrl(release, pattern) {
  const asset = release.assets?.find((a) => pattern.test(a.name))
  return asset?.browser_download_url ?? release.url
}

async function fetchLatestReleaseFull() {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': `Library/${app.getVersion()}` },
  })
  if (!res.ok) return null
  const data = await res.json()
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
  let url = data.html_url
  if (process.platform === 'darwin') {
    url = pickAssetUrl(data, new RegExp(`mac-${arch}\\.dmg$`, 'i'))
  } else if (process.platform === 'win32') {
    url = pickAssetUrl(data, /win-.*\.exe$/i)
  } else if (process.env.APPIMAGE) {
    const want = process.arch === 'arm64' ? 'arm64' : 'x86_64'
    url = pickAssetUrl(data, new RegExp(`${want}\\.AppImage$`, 'i'))
  } else {
    url = pickAssetUrl(data, process.arch === 'arm64' ? /arm64\.deb$/i : /amd64\.deb$/i)
  }
  return { version: data.tag_name, url }
}

async function promptManualUpdate(win, latest) {
  const current = app.getVersion()
  if (!isNewer(latest.version, current)) return

  const platform =
    process.platform === 'darwin'
      ? 'Download the new .dmg and replace Library in Applications (control-click → Open the first time, as before).'
      : process.platform === 'linux'
        ? 'Download the new installer from GitHub and install it over the old copy.'
        : 'Download the new installer from GitHub.'

  const { response } = await dialog.showMessageBox(win, {
    type: 'info',
    title: 'Update available',
    message: `Library ${latest.version.replace(/^v/, '')} is available.`,
    detail: `You're on ${current}.\n\n${platform}`,
    buttons: ['Download update', 'Not now'],
    defaultId: 0,
    cancelId: 1,
  })
  if (response === 0) shell.openExternal(latest.url)
}

function setupAutoUpdater(win) {
  const { autoUpdater } = require('electron-updater')
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('error', () => {})

  autoUpdater.on('update-available', async (info) => {
    const { response } = await dialog.showMessageBox(win, {
      type: 'info',
      title: 'Update available',
      message: `Library ${info.version} is available.`,
      detail: `You're on ${app.getVersion()}. Download and install it now?`,
      buttons: ['Download', 'Later'],
      defaultId: 0,
      cancelId: 1,
    })
    if (response === 0) autoUpdater.downloadUpdate().catch(() => {})
  })

  autoUpdater.on('update-not-available', () => {})

  autoUpdater.on('update-downloaded', async (info) => {
    const { response } = await dialog.showMessageBox(win, {
      type: 'info',
      title: 'Update ready',
      message: `Library ${info.version} has been downloaded.`,
      detail: 'Restart now to finish installing?',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1,
    })
    if (response === 0) autoUpdater.quitAndInstall()
  })

  autoUpdater.checkForUpdates().catch(() => {})
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), CHECK_INTERVAL_MS)
}

function setupManualChecks(win) {
  const run = async () => {
    try {
      const latest = await fetchLatestReleaseFull()
      if (latest) await promptManualUpdate(win, latest)
    } catch {
      /* offline or GitHub unreachable */
    }
  }
  setTimeout(run, CHECK_DELAY_MS)
  setInterval(run, CHECK_INTERVAL_MS)
}

/** Call once after the main window exists. No-op in dev or unpackaged builds. */
function setupUpdates(win) {
  if (!app.isPackaged || !win) return

  const useAutoUpdater = process.platform === 'win32' || (process.platform === 'linux' && Boolean(process.env.APPIMAGE))

  setTimeout(() => {
    if (useAutoUpdater) {
      try {
        setupAutoUpdater(win)
      } catch {
        setupManualChecks(win)
      }
    } else {
      setupManualChecks(win)
    }
  }, CHECK_DELAY_MS)
}

module.exports = { setupUpdates, isNewer, parseVersion }
