# Weekly Review

Your personal command center for the week ahead. A desktop application that unifies events, meals, and finances into a single decision-focused weekly overview.

## Screenshots

| Grid View | Smart View | Radial View |
|:---:|:---:|:---:|
| ![Grid view](assets/screenshot-grid.png) | ![Smart view](assets/screenshot-smart.png) | ![Radial view](assets/screenshot-radial.png) |
| Traditional day cards | Adaptive layout | 3D lattice background |

## Features

- **Weekly Overview** - See your entire week at a glance with day cards
- **Event Management** - Track appointments, meetings, and tasks
- **Meal Planning** - Plan meals and generate shopping lists
- **Bill Tracking** - Never miss a payment with upcoming bills view
- **Intelligent Insights** - Smart suggestions based on your patterns
- **Habit Tracking** - Build streaks with forgiveness-based tracking
- **Three Views** - Switch between Grid, Smart, and Radial layouts to match your workflow

## Installation

### Windows

1. Download the latest installer from [Releases](../../releases)
2. Run `Weekly-Review_x.x.x_x64-setup.exe`
3. Follow the installation wizard
4. Launch "Weekly Review" from your Start Menu or Desktop

### Requirements

- Windows 10/11 (64-bit)
- 500MB disk space
- Internet connection (for initial setup only)

## Build from Source

### Prerequisites

- [Node.js 20+](https://nodejs.org/) (LTS recommended)
- [Python 3.11+](https://www.python.org/downloads/)
- [Rust toolchain](https://rustup.rs/) (for Tauri native shell)
- [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with the **"Desktop development with C++"** workload (required by the `sqlcipher3` Python package)

> **Windows build note**: The `sqlcipher3` package compiles a native C extension during
> `pip install`. If you see compilation errors mentioning missing headers or `cl.exe`,
> install Visual Studio Build Tools and select the "Desktop development with C++" workload.

### Build Steps

```bash
# 1. Install frontend dependencies
npm install

# 2. Install backend dependencies
cd backend
pip install -r requirements.txt
pip install pyinstaller
cd ..

# 3. Build the Python sidecar binary (required before any Tauri build)
npm run sidecar:build

# 4. Build the desktop app installer
npm run tauri:build
```

The installer is written to `src-tauri/target/release/bundle/nsis/`.

### Notes

- Step 3 (`sidecar:build`) is mandatory. The compiled sidecar binary is gitignored, so a fresh clone has no backend executable until this step runs. Skipping it causes `tauri build` to fail with a missing-binary error.
- `npm run tauri:dev` starts a hot-reload development build of the full desktop app (requires the backend running separately).

## Getting Started

1. **First Launch** - Choose "Start Fresh" or "Explore with sample data"
2. **Add Events** - Click any day card to add events
3. **Plan Meals** - Use the meals section to plan your week
4. **Track Bills** - Add recurring bills to stay on top of finances
5. **Review Weekly** - Use Sunday evening planning mode for best results

## Data Privacy

- All data stored locally on your computer
- No cloud sync or external servers
- Data location: `%LOCALAPPDATA%\WeeklyReview`

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Settings | Click gear icon |
| Navigate weeks | <- -> arrows in header |
| Toggle view mode | List/Smart button |

## Troubleshooting

### App won't start
1. Check if another instance is running in Task Manager
2. Try running as Administrator
3. Reinstall the application

### Data not saving
1. Check disk space
2. Verify write permissions to `%LOCALAPPDATA%\WeeklyReview`

## License

MIT License - See [LICENSE](LICENSE) for details.

## Support

For issues and feature requests, please visit the [GitHub Issues](../../issues) page.

---

Built with [Tauri](https://tauri.app), [React](https://react.dev), and [FastAPI](https://fastapi.tiangolo.com).
