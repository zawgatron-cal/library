const { contextBridge, ipcRenderer, webUtils } = require('electron')

contextBridge.exposeInMainWorld('libraryDesktop', {
  pathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file) || null
    } catch {
      return null
    }
  },
  shelfStatus: () => ipcRenderer.invoke('library:status'),
  enableShelf: () => ipcRenderer.invoke('library:enable'),
  declineShelf: () => ipcRenderer.invoke('library:decline'),
  openShelf: () => ipcRenderer.invoke('library:open'),
  listShelf: () => ipcRenderer.invoke('library:list'),
  placeOnShelf: (payload) => ipcRenderer.invoke('library:place', payload),
  readShelfFile: (relative) => ipcRenderer.invoke('library:read', relative),
  removeShelfFile: (relative) => ipcRenderer.invoke('library:remove', relative),
  pickPdfs: () => ipcRenderer.invoke('library:pickPdfs'),
})
