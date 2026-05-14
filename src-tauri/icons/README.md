# Icons

`tauri build` requires the following icon files. Generate them once and
commit the binaries. The fastest path is the Tauri CLI:

```bash
npm run tauri -- icon path/to/source-1024.png
```

That populates:

- `32x32.png`
- `128x128.png`
- `128x128@2x.png`
- `icon.icns` (macOS)
- `icon.ico` (Windows)
- `icon.png` (tray icon, used by `tauri.conf.json`)

For now the dev build will fail until you provide a source PNG and run the
command above. Any 1024×1024 PNG with a transparent background works.
