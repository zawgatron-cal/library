## Download

| System | File |
| --- | --- |
| **macOS** (Apple silicon: M1, M2, M3, M4) | `Library-…-mac-arm64.dmg` |
| **macOS** (Intel) | `Library-…-mac-x64.dmg` |
| **Windows** 10 and 11 | `Library-…-win-x64.exe` |
| **Linux** (any distribution) | `Library-…-linux-x86_64.AppImage` |
| **Linux** (Debian, Ubuntu, Mint, Pop!_OS) | `Library-…-linux-amd64.deb` |
| **Linux** on ARM | the `arm64` AppImage or deb |

## What’s new in 1.0.3

- **Documents/Library folder** (desktop): optional shelf folder in your Documents. PDFs you add are kept there; drop files into the folder and they appear on your shelves. First-run prompt, or turn it on later in Settings → Storage.
- **Document settings while reading:** Settings has Appearance | Document so you can edit title, author, shelves, favourite/finished/archived, and OCR without leaving the book.
- **I / O** hold for gentle continuous scroll; **J** previous page, **K** next.
- Annotation menu dismisses when you scroll (unless a note is focused), with a fade-out matching the pop-in.
- **Smoother updates:** downloads new versions in the background on Windows, macOS, and Linux, then asks you to restart — including macOS while ad-hoc signed.

## First launch

Library isn't signed with a paid Apple or Microsoft developer certificate yet, so your system asks before opening it the first time.

- **macOS**: If you see **“Apple cannot verify…”** or **“free from malware”**, that is normal for unsigned open-source apps — it is not saying malware was found. Open the `.dmg`, drag **Library** into **Applications**, then in Finder **control-click Library → Open → Open** (first launch only; do not double-click yet). Alternative: try opening once, cancel, then **System Settings → Privacy & Security → Open Anyway**. Details: [Install on macOS](https://github.com/zawgatron-cal/library/blob/main/docs/INSTALL-macos.md).
- **Windows**: if SmartScreen says "Windows protected your PC", click **More info → Run anyway**.
- **Linux (AppImage)**: make it executable (`chmod +x Library-*.AppImage`, or Properties → Permissions) and double-click it.
- **Linux (deb)**: `sudo apt install ./Library-*.deb`, then find Library in your applications.

Your books, notes and highlights stay on your computer. Nothing is uploaded anywhere.
