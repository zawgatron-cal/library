## Download

| System | File |
| --- | --- |
| **macOS** (Apple silicon: M1, M2, M3, M4) | `Library-…-mac-arm64.dmg` |
| **macOS** (Intel) | `Library-…-mac-x64.dmg` |
| **Windows** 10 and 11 | `Library-…-win-x64.exe` |
| **Linux** (any distribution) | `Library-…-linux-x86_64.AppImage` |
| **Linux** (Debian, Ubuntu, Mint, Pop!_OS) | `Library-…-linux-amd64.deb` |
| **Linux** on ARM | the `arm64` AppImage or deb |

## Fix in this build

**1.0.1** (this build) includes the update checker. An earlier broken build of 1.0.1 could crash on launch with `Cannot find module './update.cjs'` — re-download from this release and replace the app in Applications. Your books stay put.

## First launch

Library isn't signed with a paid Apple or Microsoft developer certificate yet, so your system asks before opening it the first time.

- **macOS**: If you see **“Apple cannot verify…”** or **“free from malware”**, that is normal for unsigned open-source apps — it is not saying malware was found. Open the `.dmg`, drag **Library** into **Applications**, then in Finder **control-click Library → Open → Open** (first launch only; do not double-click yet). Alternative: try opening once, cancel, then **System Settings → Privacy & Security → Open Anyway**. Details: [Install on macOS](https://github.com/zawgatron-cal/library/blob/main/docs/INSTALL-macos.md).
- **Windows**: if SmartScreen says "Windows protected your PC", click **More info → Run anyway**.
- **Linux (AppImage)**: make it executable (`chmod +x Library-*.AppImage`, or Properties → Permissions) and double-click it.
- **Linux (deb)**: `sudo apt install ./Library-*.deb`, then find Library in your applications.

Your books, notes and highlights stay on your computer. Nothing is uploaded anywhere.
