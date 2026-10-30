/** Thin wrapper around the Electron preload API. Absent in the browser build. */

export type ShelfStatus = {
  path: string
  exists: boolean
  enabled: boolean
  prompted: boolean
}

export type ShelfPdf = {
  name: string
  relative: string
  size: number
  mtimeMs: number
}

type LibraryDesktopApi = {
  pathForFile: (file: File) => string | null
  shelfStatus: () => Promise<ShelfStatus>
  enableShelf: () => Promise<ShelfStatus>
  declineShelf: () => Promise<ShelfStatus>
  openShelf: () => Promise<string>
  listShelf: () => Promise<ShelfPdf[]>
  placeOnShelf: (payload: {
    sourcePath?: string
    bytes?: ArrayBuffer
    fileName?: string
    move?: boolean
  }) => Promise<string>
  readShelfFile: (relative: string) => Promise<ArrayBuffer>
  removeShelfFile: (relative: string) => Promise<void>
  pickPdfs: () => Promise<string[]>
}

declare global {
  interface Window {
    libraryDesktop?: LibraryDesktopApi
  }
}

export const isDesktop = () => typeof window !== 'undefined' && !!window.libraryDesktop

export const desktop = () => window.libraryDesktop
