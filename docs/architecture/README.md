# Workspace Explained

This folder contains documentation to help you understand the Weekly Review codebase. Use these guides when testing the app to identify what needs to change.

---

## Documents

| File | Purpose |
|------|---------|
| [01-ARCHITECTURE-OVERVIEW.md](./01-ARCHITECTURE-OVERVIEW.md) | Big picture - how the layers work together |
| [02-TAURI-LAYER.md](./02-TAURI-LAYER.md) | Desktop shell - window, tray, notifications |
| [03-REACT-LAYER.md](./03-REACT-LAYER.md) | Frontend UI - components, state, styling |
| [04-FASTAPI-LAYER.md](./04-FASTAPI-LAYER.md) | Backend API - endpoints, validation, logic |
| [05-SQLITE-LAYER.md](./05-SQLITE-LAYER.md) | Database - tables, models, data storage |
| [06-QUICK-REFERENCE.md](./06-QUICK-REFERENCE.md) | Commands, file locations, troubleshooting |
| [07-HOW-TO-MAKE-CHANGES.md](./07-HOW-TO-MAKE-CHANGES.md) | Decision tree for modifications |

---

## Reading Order

**First time?** Read in order (01 → 07).

**Know what you want to change?** Jump to [07-HOW-TO-MAKE-CHANGES.md](./07-HOW-TO-MAKE-CHANGES.md).

**Need a quick command?** See [06-QUICK-REFERENCE.md](./06-QUICK-REFERENCE.md).

---

## The Architecture at a Glance

```
┌─────────────────────────────────────────────┐
│           TAURI (Desktop Shell)             │
│   Window, System Tray, Notifications        │
│   Location: src-tauri/                      │
└─────────────────────────────────────────────┘
                    │
       ┌────────────┴────────────┐
       ▼                         ▼
┌─────────────────┐    ┌─────────────────────┐
│  REACT (UI)     │    │  FASTAPI (Backend)  │
│  What you see   │◄──►│  Business logic     │
│  src/           │    │  backend/app/       │
└─────────────────┘    └─────────────────────┘
                                │
                                ▼
                       ┌─────────────────────┐
                       │  SQLITE (Database)  │
                       │  Your data          │
                       │  weekly_review.db   │
                       └─────────────────────┘
```

---

## Quick Decision Guide

| I want to change... | Read... |
|---------------------|---------|
| How something looks | [03-REACT-LAYER.md](./03-REACT-LAYER.md) |
| What data is stored | [05-SQLITE-LAYER.md](./05-SQLITE-LAYER.md) + [04-FASTAPI-LAYER.md](./04-FASTAPI-LAYER.md) |
| Business logic (calculations) | [04-FASTAPI-LAYER.md](./04-FASTAPI-LAYER.md) |
| Window/tray/notifications | [02-TAURI-LAYER.md](./02-TAURI-LAYER.md) |
| Navigation/pages | [03-REACT-LAYER.md](./03-REACT-LAYER.md) |

---

## When Testing the App

1. Use the app on your Windows machine
2. Note what you like and don't like
3. Refer to [07-HOW-TO-MAKE-CHANGES.md](./07-HOW-TO-MAKE-CHANGES.md) to identify which layer to modify
4. Identify the specific changes needed and which files to modify

---

## Tech Stack Summary

| Layer | Technology | Language | Purpose |
|-------|------------|----------|---------|
| Desktop | Tauri 2.0 | Rust | Native window, OS features |
| Frontend | React 18 | TypeScript | User interface |
| State | Zustand | TypeScript | Global app state |
| Data Fetching | TanStack Query | TypeScript | API caching |
| Styling | Tailwind CSS v4 | CSS | Dark theme, utilities |
| Backend | FastAPI | Python | REST API |
| ORM | SQLAlchemy | Python | Database queries |
| Database | SQLite | SQL | Data storage |
