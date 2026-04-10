# Tauri Layer (Desktop Shell)

## What Is Tauri?

Tauri is a framework for building desktop applications. It creates a native window that displays your web app (React), while giving access to desktop features like:

- System tray icons
- Native notifications
- File dialogs
- Window controls

## Why Tauri Instead of Electron?

| Electron | Tauri |
|----------|-------|
| Ships entire Chrome browser | Uses system's built-in WebView |
| 150-200 MB app size | 3-10 MB app size |
| 150+ MB RAM usage | 30-50 MB RAM usage |
| Written in JavaScript | Written in Rust (faster, safer) |

**Bottom line:** Tauri makes smaller, faster apps.

---

## File Structure

```
src-tauri/
├── Cargo.toml           # Rust dependencies (like package.json for Rust)
├── tauri.conf.json      # App configuration (window, permissions, plugins)
├── src/
│   ├── main.rs          # Entry point (just calls lib.rs)
│   └── lib.rs           # Main Tauri setup (85 lines)
└── icons/               # App icons for different platforms
    ├── 32x32.png
    ├── 128x128.png
    └── icon.ico
```

---

## Key File: tauri.conf.json

This is the main configuration file.

```json
{
  "productName": "Weekly Review",
  "version": "0.1.0",
  "identifier": "com.weeklyreview.app",
  "app": {
    "windows": [{
      "title": "Weekly Review",
      "width": 1280,
      "height": 800,
      "minWidth": 1024,
      "minHeight": 600,
      "resizable": true
    }]
  },
  "plugins": {
    "shell": {
      "sidecar": [{
        "name": "backend",     // FastAPI runs as sidecar
        "args": []
      }]
    },
    "notification": { "all": true }  // Enable notifications
  }
}
```

### What You Can Change Here

| Setting | What It Does | Example Change |
|---------|--------------|----------------|
| `width`, `height` | Default window size | Make it 1600x900 |
| `minWidth`, `minHeight` | Minimum allowed size | Prevent tiny window |
| `title` | Window title bar text | "My Weekly Planner" |
| `resizable` | Allow resize | Set to `false` for fixed size |

---

## Key File: lib.rs

This is the Rust code that sets up Tauri features.

```rust
// src-tauri/src/lib.rs

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // 1. Add notification plugin
        .plugin(tauri_plugin_notification::init())

        // 2. Set up system tray
        .setup(|app| {
            let tray_menu = Menu::with_items(app, &[
                &MenuItem::with_id(app, "show", "Show", true, None::<&str>)?,
                &MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?,
                &PredefinedMenuItem::separator(app)?,
                &MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?,
            ])?;

            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&tray_menu)
                .build(app)?;
            Ok(())
        })

        // 3. Handle window close (minimize to tray instead)
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                window.hide().unwrap();
                api.prevent_close();  // Don't actually close
            }
        })

        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### What This Code Does

1. **Notification Plugin** - Enables desktop notifications
2. **System Tray Menu** - Creates right-click menu with Show, Settings, Quit
3. **Close Handler** - When you click X, app hides to tray instead of quitting

---

## Common Modifications

### Change Window Size

Edit `src-tauri/tauri.conf.json`:
```json
"windows": [{
  "width": 1600,   // Changed from 1280
  "height": 900    // Changed from 800
}]
```

### Add New Tray Menu Item

Edit `src-tauri/src/lib.rs`:
```rust
let tray_menu = Menu::with_items(app, &[
    &MenuItem::with_id(app, "show", "Show", true, None::<&str>)?,
    &MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?,
    &MenuItem::with_id(app, "new_event", "Quick Add Event", true, None::<&str>)?,  // NEW
    &PredefinedMenuItem::separator(app)?,
    &MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?,
])?;
```

### Disable "Minimize to Tray"

Remove or comment out the `on_window_event` handler in `lib.rs`. The app will close normally when X is clicked.

### Change App Icon

Replace files in `src-tauri/icons/`:
- `32x32.png` - Small icon
- `128x128.png` - Medium icon
- `icon.ico` - Windows icon

---

## Tauri Plugins Used

| Plugin | Purpose | Config Location |
|--------|---------|-----------------|
| `tauri-plugin-notification` | Desktop notifications | `Cargo.toml` + `lib.rs` |
| `tauri-plugin-shell` | Run sidecar (FastAPI) | `tauri.conf.json` |

---

## When to Modify Tauri

| If You Want To... | Modify... |
|-------------------|-----------|
| Change window size | `tauri.conf.json` |
| Add tray menu options | `lib.rs` |
| Change notification behavior | `lib.rs` |
| Add new native capability | `Cargo.toml` + `lib.rs` |
| Change app icon | `icons/` folder |
| Disable minimize to tray | `lib.rs` (remove handler) |

---

## Testing Tauri Changes

```bash
# Rebuild and run
npm run tauri dev

# Build for production
npm run tauri build
```

**Note:** Tauri changes require rebuilding the Rust code, which is slower than React changes.
