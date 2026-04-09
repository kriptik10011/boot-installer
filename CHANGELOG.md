# Changelog

All notable changes to Weekly Review are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-04-09

Initial public release.

### Highlights

- **Three weekly views**: Grid (traditional day cards), Smart (adaptive layout), and Radial (3D lattice visualization)
- **Cooking Mode**: Full-takeover view for hands-free meal preparation
- **Onboarding**: Guided 3-step setup wizard
- **Print and PDF export**: Meal plans, shopping lists, and financial summaries

### Events and Calendar

- Categorized events with recurring schedules
- Time input with smart parsing
- Calendar import support

### Meals and Recipes

- Recipe import from supported sites with structured ingredient parsing
- Meal planning with pantry-aware drafting
- Shopping list generation with multi-recipe consolidation
- Inventory tracking with depletion forecasting and unit conversion

### Finances

- Bill tracking with upcoming-payment reminders
- Budget and spending insights
- Transaction logging with category support
- Recurring bill prediction

### Intelligence Layer

- Pattern detection across events, meals, and finances
- Insight surfacing with confidence scoring
- Habit tracking with forgiveness-based streaks
- Drift detection that adapts to changing routines

### Accessibility

- WCAG AA compliant: keyboard navigation, focus traps, ARIA roles, screen reader announcements
- Skip-to-main-content link
- Light and dark themes

### Security and Privacy

- All data stored locally; no cloud sync, no external servers
- SQLCipher-encrypted SQLite database
- Sidecar bearer-token authentication between frontend and backend
- Rate limiting and SSRF protection on all API endpoints
- E2E test endpoints gated behind a development environment variable

### Platforms

- Windows 10/11 (64-bit) installer via NSIS
