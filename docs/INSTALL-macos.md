# Install Library on macOS

When you download Library from GitHub, macOS shows a message like **“Apple cannot verify that Library is free from malware”** or **“the developer cannot be verified.”**

That does **not** mean the app was flagged as malware. It means Apple has not checked this build through their paid Developer Program (Library is open source and ad-hoc signed, not notarized). The same warning appears for many indie and open-source Mac apps distributed outside the App Store.

## Install

1. Download the correct `.dmg` from [Releases](https://github.com/zawgatron-cal/textbook/releases/latest):
   - **Apple silicon** (M1, M2, M3, M4, …): `Library-…-mac-arm64.dmg`
   - **Intel Mac**: `Library-…-mac-x64.dmg`
2. Open the `.dmg` and drag **Library** into **Applications**.
3. **Eject the disk image** (optional but avoids opening the copy still inside the `.dmg`).

## First launch (pick one method)

### Method A — Right-click Open (usually easiest)

1. Open **Finder → Applications**.
2. **Control-click** (or right-click) **Library**, then choose **Open** from the menu.  
   Do **not** double-click yet.
3. In the dialog, click **Open** again.
4. Library starts. After this once, you can double-click Library like any other app.

### Method B — Privacy & Security

1. Double-click **Library** once. When macOS blocks it, click **Done** or **Cancel** (not **Move to Trash**).
2. Open **System Settings → Privacy & Security**.
3. Scroll down to **Security**. You should see that **Library** was blocked.
4. Click **Open Anyway**, confirm with your password or Touch ID, then click **Open** in the next dialog.

If **Open Anyway** does not appear, use Method A, or try opening Library once more and check Settings again within a minute.

### Still blocked?

If the app was copied from the `.dmg` but launch still fails, remove the download quarantine flag in Terminal (safe for apps you chose to install):

```bash
xattr -cr /Applications/Library.app
```

Then use **Method A** once.

## Wrong architecture

On Apple silicon, use the **arm64** `.dmg`. The Intel `.dmg` can run under Rosetta but is slower; if you see odd errors, switch to arm64.

## Removing the warning for everyone (maintainers)

End users only see this until the app is **signed with an Apple Developer ID** and **notarized**. That requires enrolling in the [Apple Developer Program](https://developer.apple.com/programs/) and setting signing secrets in the release workflow. See the comment on `identity` in `electron-builder.yml`.
