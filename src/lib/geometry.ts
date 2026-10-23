import type { Book, Rect } from './db'

export const normalizeRotation = (deg: number) => (((Math.round(deg / 90) * 90) % 360) + 360) % 360

/** Where a rectangle on the unrotated page (in 0–1 fractions) lands once the page is turned clockwise by `rotation`. */
export function rotateRect(r: Rect, rotation: number): Rect {
  switch (normalizeRotation(rotation)) {
    case 90:
      return { x: 1 - r.y - r.h, y: r.x, w: r.h, h: r.w }
    case 180:
      return { x: 1 - r.x - r.w, y: 1 - r.y - r.h, w: r.w, h: r.h }
    case 270:
      return { x: r.y, y: 1 - r.x - r.w, w: r.h, h: r.w }
    default:
      return r
  }
}

/** The inverse of `rotateRect`: from a turned page back to the unrotated one. */
export const unrotateRect = (r: Rect, rotation: number) => rotateRect(r, 360 - normalizeRotation(rotation))

/** The rotation the reader adds to a page: the whole view's plus the page's own. */
export const extraRotation = (book: Pick<Book, 'rotation' | 'pageRotations'>, page: number) =>
  normalizeRotation((book.rotation ?? 0) + (book.pageRotations?.[page] ?? 0))

/** CSS transform that lays an unrotated page-sized box (width × height px) over the page turned by `rotation`. */
export function rotationTransform(rotation: number, width: number, height: number) {
  switch (normalizeRotation(rotation)) {
    case 90:
      return `translate(${height}px, 0) rotate(90deg)`
    case 180:
      return `translate(${width}px, ${height}px) rotate(180deg)`
    case 270:
      return `translate(0, ${width}px) rotate(270deg)`
    default:
      return undefined
  }
}
