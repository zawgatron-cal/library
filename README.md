# Library

A light-weight, cozy, open-source PDF reader for reading and studying literature — kept entirely on your own computer.

Library is built around one idea: reading should feel handcrafted. Soft themes, warm paper tones, gentle typography, and a quiet interface that gets out of the way so you can sink into a book, a paper, or a course reader.

## Features

### Your shelves

- **Drag-and-drop import** of one or many PDFs; title and author are read from the file's metadata, and a cover is rendered from the first page.
- **Stored locally** in your browser's IndexedDB. Nothing is uploaded anywhere, and it all works offline.
- **Continue reading** card, reading progress on every cover, and filters for _Reading_, _Up next_, _Finished_ and _Favourites_.
- **Shelves (tags)**, search, and sorting by recently read, recently added, title, author or progress.
- **Daily reading goal** with a streak and a little week-at-a-glance chart.

### Reading

- Smooth continuous scrolling with virtualized page rendering, so a book with a thousand pages still feels light.
- **Fit**, zoom steps, and an optional **two-page spread** for books.
- Your **place is remembered** in every book, along with its zoom level.
- **Table of contents** from the PDF outline, with the current chapter highlighted.
- **Full-text search** with in-page match marks.
- **Focus mode** hides everything except the page.
- **Keyboard shortcuts** for everything (press <kbd>?</kbd> in the reader).

### Studying

- **Highlights** in five soft colours, made by selecting text. Add a note to any highlight.
- **Bookmarks** with optional labels.
- **Notebook**: a lined notepad for each book, with one-click page references.
- **Export** highlights, notes and bookmarks to Markdown.

### Make it yours

- **Eight themes**: Parchment, Sage, Rosewater, Mist, Lavender, Candlelight, Forest and Midnight.
- **Blend your own**: pick six colours (background, surface, ink, pencil, accent, paper) and everything else is mixed from them.
- **Page colour**: keep pages original, tint them toward the theme's paper colour, or switch to night pages, which recolour the PDF to match dark themes. Tint strength is adjustable.
- **Interface font** (Nunito, Fraunces, Literata, Atkinson Hyperlegible or your system font), interface size, corner roundness, page spacing, paper grain, and reduced motion.

## Getting started

```bash
npm install
npm run dev
```

Then open http://localhost:5173 and drop in a PDF.

| Script            | What it does                         |
| ----------------- | ------------------------------------ |
| `npm run dev`     | Start the dev server                 |
| `npm run build`   | Type-check and build to `dist/`      |
| `npm run preview` | Serve the production build locally   |
| `npm run lint`    | Lint with ESLint                     |

## Keyboard shortcuts

| Keys                     | Action                 |
| ------------------------ | ---------------------- |
| <kbd>→</kbd> / <kbd>J</kbd> | Next page           |
| <kbd>←</kbd> / <kbd>K</kbd> | Previous page       |
| <kbd>G</kbd>             | Go to page             |
| <kbd>+</kbd> / <kbd>−</kbd> | Zoom in / out       |
| <kbd>0</kbd>             | Fit                    |
| <kbd>D</kbd>             | Two-page spread        |
| <kbd>B</kbd>             | Bookmark page          |
| <kbd>H</kbd>             | Highlight selection    |
| <kbd>/</kbd> or <kbd>Ctrl/⌘ F</kbd> | Search in book |
| <kbd>T</kbd>             | Toggle sidebar         |
| <kbd>F</kbd>             | Focus mode             |
| <kbd>Esc</kbd>           | Close / exit focus     |

## How it's built

React 19, TypeScript, Vite and Tailwind CSS v4, with [react-pdf](https://github.com/wojtekmaj/react-pdf) (pdf.js) for rendering and [idb](https://github.com/jakearchibald/idb) for storage.

```
src/
  lib/
    db.ts           IndexedDB: books, PDF files, highlights
    pdf.ts          pdf.js setup, import (metadata + cover)
    themes.ts       Preset themes and colour helpers
    preferences.ts  Settings shape, fonts, defaults
    settings.tsx    Settings context; applies the theme as CSS variables
    readingLog.ts   Daily reading time and streaks
    export.ts       Markdown export
  components/
    library/        Bookshelf, covers, book details
    reader/         Reader, virtualized page stack, sidebar, highlight popover
    settings/       Appearance & settings sheet
    ui/             Buttons, dialogs, sheets, menus, toasts
```

Theming works through six CSS variables (`--canvas`, `--surface`, `--ink`, `--muted`, `--accent`, `--paper`). Every other colour, including borders, hovers and soft accents, is derived from them with `color-mix()`. PDF pages are themed with blend-mode overlays: a multiply layer for warm tints, and an inverted canvas mapped onto the theme's ink and paper colours for night pages.

Your data lives in the browser profile you use Library in. From **Settings → Storage** you can ask the browser to protect it from automatic clean-up.

