import { memo, useMemo } from 'react'
import type { OcrPage } from '../../lib/db'
import { escapeRegExp } from '../../lib/format'
import { rotationTransform } from '../../lib/geometry'

const FONT = 'sans-serif'
const widths = new Map<string, number>()
let measurer: CanvasRenderingContext2D | null = null

/** Width of `text` at a font size of 100px, so each word can be stretched to exactly cover the word in the scan. */
function widthAt100(text: string) {
  let w = widths.get(text)
  if (w === undefined) {
    measurer ??= document.createElement('canvas').getContext('2d')
    if (!measurer) return text.length * 55
    measurer.font = `100px ${FONT}`
    w = measurer.measureText(text).width || 1
    widths.set(text, w)
  }
  return w
}

/**
 * Invisible, selectable words laid over a scanned page where Tesseract found them, so recognised text can be
 * selected, annotated and searched like any other. Laid out on the unrotated page and turned with it.
 */
export const OcrLayer = memo(function OcrLayer({ ocr, width, height, rotation, query }: { ocr: OcrPage; width: number; height: number; rotation: number; query: string }) {
  // Words that fall inside a search match, by line.
  const matched = useMemo(() => {
    const q = query.trim()
    if (!q) return null
    const pattern = new RegExp(escapeRegExp(q), 'gi')
    return ocr.lines.map((line) => {
      const hits = new Set<number>()
      let text = ''
      const starts = line.words.map((w) => {
        const start = text.length
        text += w.text + ' '
        return start
      })
      for (const m of text.matchAll(pattern)) {
        const from = m.index ?? 0
        const to = from + m[0].length
        starts.forEach((start, i) => {
          if (start < to && start + line.words[i].text.length > from) hits.add(i)
        })
      }
      return hits
    })
  }, [ocr, query])

  return (
    <div className="ocr-layer" style={{ width, height, transform: rotationTransform(rotation, width, height) }}>
      {ocr.lines.map((line, li) => (
        <div key={li}>
          {line.words.map((word, wi) => {
            const fontSize = Math.max(1, line.box.h * height * 0.82)
            const boxW = word.box.w * width
            const scaleX = boxW / ((widthAt100(word.text) * fontSize) / 100)
            const last = wi === line.words.length - 1
            return (
              <span
                key={wi}
                style={{
                  left: word.box.x * width,
                  top: line.box.y * height + (line.box.h * height - fontSize) / 2,
                  fontSize,
                  transform: `scaleX(${Math.min(4, Math.max(0.2, scaleX))})`,
                }}
              >
                {matched?.[li].has(wi) ? <mark>{word.text}</mark> : word.text}
                {last ? '\n' : ' '}
              </span>
            )
          })}
        </div>
      ))}
    </div>
  )
})
