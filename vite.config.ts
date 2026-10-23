import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Character maps and standard fonts let pdf.js render CJK text and PDFs without embedded fonts, fully offline.
    viteStaticCopy({
      targets: [
        { src: 'node_modules/pdfjs-dist/cmaps/*', dest: 'pdfjs/cmaps', rename: { stripBase: true } },
        { src: 'node_modules/pdfjs-dist/standard_fonts/*', dest: 'pdfjs/standard_fonts', rename: { stripBase: true } },
        // Text recognition: Tesseract's worker, its WebAssembly cores (the browser picks one) and the English model.
        { src: 'node_modules/tesseract.js/dist/worker.min.js', dest: 'tesseract', rename: { stripBase: true } },
        { src: 'node_modules/tesseract.js-core/tesseract-core*-lstm.wasm.js', dest: 'tesseract/core', rename: { stripBase: true } },
        { src: 'node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', dest: 'tesseract/lang', rename: { stripBase: true } },
      ],
    }),
  ],
  optimizeDeps: {
    include: ['pdfjs-dist/build/pdf.worker.min.mjs'],
  },
})
