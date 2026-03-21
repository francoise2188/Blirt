# Where we work on Blirt (for you and your AI assistant)

## The important part

| Location | Role |
|----------|------|
| **`C:\BlirtProject`** | **This is the real app.** Run the dev server here, edit code here, commit and push from here. |
| **OneDrive `Desktop\Blirt`** (or similar) | **Not the main codebase.** It might be an old copy, a small export, or out of date. Don’t rely on it as the only copy. |

## Why this matters

- Cursor (and other tools) only “see” the **folder you opened**. If you open OneDrive `Blirt` but run **`npm run dev`** from **`C:\BlirtProject`**, the AI might edit the wrong files or miss your latest work.
- **Best habit:** Open **`C:\BlirtProject`** as your project folder in Cursor when you work on Blirt.

## What’s in BlirtProject (high level)

- **Next.js** — web app for guests (record video/voice, text) and hosts (events, prompts, QR, etc.).
- **Supabase** — database and file uploads for Blirts.
- **Guest recording** — browser camera/mic (`src/lib/guestMediaCapture.ts`), guest UI under `src/app/guest/`.

## Git

- Pushes go from **`C:\BlirtProject`** to GitHub (e.g. `francoise2188/Blirt`).

---

*This file is duplicated in spirit by `.cursor/rules/project-location-and-workflow.mdc` so Cursor’s AI is reminded automatically when that project is open.*
