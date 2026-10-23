// The desktop shell: one sandboxed window showing the web app, served from a private `app://library` origin so
// IndexedDB, module workers, WebAssembly and fetch behave exactly as they do on the web.
const { app, BrowserWindow, Menu, net, protocol, screen, shell } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const SCHEME = 'app'
const ORIGIN = `${SCHEME}://library`
const DIST = path.join(__dirname, '..', 'dist')
const DEV_URL = process.env.LIBRARY_DEV_URL
const isMac = process.platform === 'darwin'

protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
])

if (!app.requestSingleInstanceLock()) app.quit()

/* ----- window size, remembered between launches ----- */

const stateFile = () => path.join(app.getPath('userData'), 'window.json')

function savedBounds() {
  try {
    const b = JSON.parse(fs.readFileSync(stateFile(), 'utf8'))
    const visible = screen.getAllDisplays().some(({ workArea: a }) => b.x < a.x + a.width && b.x + b.width > a.x && b.y < a.y + a.height && b.y + b.height > a.y)
    return visible ? b : { width: b.width, height: b.height }
  } catch {
    return { width: 1280, height: 860 }
  }
}

function rememberBounds(win) {
  let timer
  const save = () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      if (win.isDestroyed() || win.isMinimized() || win.isFullScreen()) return
      fs.writeFile(stateFile(), JSON.stringify({ ...win.getNormalBounds(), maximized: win.isMaximized() }), () => {})
    }, 400)
  }
  win.on('resize', save)
  win.on('move', save)
  win.on('maximize', save)
  win.on('unmaximize', save)
}

/* ----- menus ----- */

// On macOS the menu carries the standard shortcuts (copy, paste, hide, quit...). Zoom items are left out on purpose:
// ⌘+ / ⌘− belong to the reader's own page zoom, not to scaling the whole interface.
function setMenu() {
  if (!isMac) return Menu.setApplicationMenu(null)
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { role: 'appMenu' },
      { role: 'editMenu' },
      { label: 'View', submenu: [{ role: 'togglefullscreen' }, ...(app.isPackaged ? [] : [{ role: 'reload' }, { role: 'toggleDevTools' }])] },
      { role: 'windowMenu' },
    ]),
  )
}

/* ----- window ----- */

let win = null

function createWindow() {
  const bounds = savedBounds()
  win = new BrowserWindow({
    ...bounds,
    minWidth: 720,
    minHeight: 520,
    show: false,
    title: 'Library',
    backgroundColor: '#ebe4d6',
    icon: isMac ? undefined : path.join(__dirname, 'icons', 'icon.png'),
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false },
  })
  if (bounds.maximized) win.maximize()
  win.once('ready-to-show', () => win.show())
  rememberBounds(win)

  // Links inside PDFs open in the default browser; the app itself never navigates away.
  const appUrl = DEV_URL ?? ORIGIN
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?|mailto):/i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith(appUrl)) return
    event.preventDefault()
    if (/^(https?|mailto):/i.test(url)) shell.openExternal(url)
  })

  win.loadURL(DEV_URL ?? `${ORIGIN}/index.html`)
  win.on('closed', () => (win = null))
}

app.on('second-instance', () => {
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.focus()
})

app.whenReady().then(() => {
  protocol.handle(SCHEME, (request) => {
    const { pathname } = new URL(request.url)
    const file = path.normalize(path.join(DIST, decodeURIComponent(pathname)))
    if (!file.startsWith(DIST + path.sep)) return new Response('Not found', { status: 404 })
    return net.fetch(pathToFileURL(file).toString())
  })
  setMenu()
  createWindow()
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow())
})

app.on('window-all-closed', () => {
  if (!isMac) app.quit()
})
