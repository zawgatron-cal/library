// Desktop shelves live in Documents/Library. PDFs sit on disk there; book metadata stays in IndexedDB.
const { app, dialog, ipcMain, shell } = require('electron')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')

const STATE = () => path.join(app.getPath('userData'), 'shelf.json')

function shelfRoot() {
  return path.join(app.getPath('documents'), 'Library')
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE(), 'utf8'))
  } catch {
    return { prompted: false, enabled: false }
  }
}

function writeState(patch) {
  const next = { ...readState(), ...patch }
  fs.writeFileSync(STATE(), JSON.stringify(next))
  return next
}

function assertInsideShelf(relOrAbs) {
  const root = path.resolve(shelfRoot())
  const abs = path.resolve(root, relOrAbs)
  if (abs !== root && !abs.startsWith(root + path.sep)) throw new Error('Path escapes Library folder')
  return abs
}

function uniqueName(dir, fileName) {
  const base = path.basename(fileName).replace(/[/\\?%*:|"<>]/g, '-') || 'book.pdf'
  const ext = path.extname(base) || '.pdf'
  const stem = path.basename(base, ext) || 'book'
  let candidate = stem + ext
  let n = 1
  while (fs.existsSync(path.join(dir, candidate))) {
    candidate = `${stem} (${n})${ext}`
    n += 1
  }
  return candidate
}

async function ensureShelfDir() {
  const root = shelfRoot()
  await fsp.mkdir(root, { recursive: true })
  writeState({ enabled: true, prompted: true })
  return root
}

async function listPdfs() {
  const root = shelfRoot()
  if (!fs.existsSync(root)) return []
  const out = []
  const entries = await fsp.readdir(root, { withFileTypes: true })
  for (const ent of entries) {
    if (!ent.isFile()) continue
    if (!ent.name.toLowerCase().endsWith('.pdf')) continue
    const abs = path.join(root, ent.name)
    const st = await fsp.stat(abs)
    out.push({ name: ent.name, relative: ent.name, size: st.size, mtimeMs: st.mtimeMs })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

/** Copy or link a PDF onto the shelf. Prefer rename when moving from elsewhere on the same volume. */
async function placeFile({ sourcePath, bytes, fileName, move }) {
  const root = await ensureShelfDir()
  const name = uniqueName(root, fileName || (sourcePath ? path.basename(sourcePath) : 'book.pdf'))
  const dest = path.join(root, name)

  if (sourcePath) {
    const absSource = path.resolve(sourcePath)
    if (absSource.startsWith(root + path.sep) || absSource === dest) {
      return path.relative(root, absSource)
    }
    if (move) {
      try {
        await fsp.rename(absSource, dest)
        return name
      } catch {
        /* cross-device — fall through to copy */
      }
    }
    await fsp.copyFile(absSource, dest)
    if (move) await fsp.unlink(absSource).catch(() => {})
    return name
  }

  if (!bytes) throw new Error('No file data')
  await fsp.writeFile(dest, Buffer.from(bytes))
  return name
}

async function readFile(relative) {
  const abs = assertInsideShelf(relative)
  return fsp.readFile(abs)
}

async function removeFile(relative) {
  const abs = assertInsideShelf(relative)
  await fsp.unlink(abs).catch((err) => {
    if (err.code !== 'ENOENT') throw err
  })
}

function registerLibraryIpc() {
  ipcMain.handle('library:status', async () => {
    const root = shelfRoot()
    const state = readState()
    return {
      path: root,
      exists: fs.existsSync(root),
      enabled: Boolean(state.enabled),
      prompted: Boolean(state.prompted),
    }
  })

  ipcMain.handle('library:enable', async () => {
    const root = await ensureShelfDir()
    return { path: root, exists: true, enabled: true, prompted: true }
  })

  ipcMain.handle('library:decline', async () => {
    const state = writeState({ prompted: true, enabled: false })
    const root = shelfRoot()
    return {
      path: root,
      exists: fs.existsSync(root),
      enabled: Boolean(state.enabled),
      prompted: Boolean(state.prompted),
    }
  })

  ipcMain.handle('library:open', async () => {
    const root = await ensureShelfDir()
    await shell.openPath(root)
    return root
  })

  ipcMain.handle('library:list', async () => listPdfs())

  ipcMain.handle('library:place', async (_e, payload) => placeFile(payload ?? {}))

  ipcMain.handle('library:read', async (_e, relative) => {
    const buf = await readFile(relative)
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  })

  ipcMain.handle('library:remove', async (_e, relative) => removeFile(relative))

  ipcMain.handle('library:pickPdfs', async () => {
    const root = shelfRoot()
    const result = await dialog.showOpenDialog({
      title: 'Add PDFs to Library',
      defaultPath: fs.existsSync(root) ? root : app.getPath('documents'),
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    })
    if (result.canceled) return []
    return result.filePaths
  })
}

module.exports = { registerLibraryIpc, shelfRoot }
