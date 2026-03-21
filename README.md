# Aditya Srivastava — Interactive Portfolio City

**Live:** https://adityasrivastava-dev.github.io/

Drive through a 3D city where every building is a system I built over 4 years as a Backend Architect.

## How to Deploy on GitHub Pages

1. **Upload all 4 files to the root of your repo:**

   ```
   index.html        ← gate page (recruiter/engineer mode select)
   city.html         ← main 3D city
   city-engine.js    ← Three.js engine (car, physics, weather, lighting)
   city-data.js      ← all building data & journey slides
   ```

2. **In GitHub repo Settings → Pages → Source:**
   - Set to `Deploy from branch`
   - Branch: `main`, folder: `/ (root)`
   - Save → wait ~60 seconds → live at `https://adityasrivastava-dev.github.io/`

3. **No build step needed** — pure HTML/CSS/JS, no npm, no bundler.

## Controls

| Key          | Action                 |
| ------------ | ---------------------- |
| W / ↑        | Accelerate             |
| S / ↓        | Brake / Reverse        |
| A / D or ← → | Steer                  |
| E            | Enter nearest building |
| Space        | Handbrake              |
| J            | Journey Board          |
| T            | Cycle weather          |

## Features

- **12 buildings** — each is a real system: Auth Tower, API Forge, Cloud District, The Bridge, Data Vaults, LedgerFlow, Arch Quarter, Survey Bridge, MovePulse, Monolith Quarter + 2 education buildings
- **Weather system** — Night / Day / Sunset / Fog / Rain / Snow — each changes sky, lighting, fog, particles
- **Oracle AI** — powered by Claude Sonnet (requires API key to be set)
- **Journey Board** — career timeline from 2015 to present
- **Two modes** — Recruiter (business language) / Engineer (technical depth)
- **Generative music** — Web Audio API ambient soundtrack

## Stack

Three.js r128 · Vanilla JS · Web Audio API · Anthropic Claude API (Oracle)

## Note on Oracle AI

The Oracle chat uses the Anthropic API client-side. For production, wrap it in a backend proxy to protect the API key. For personal portfolio use, the current direct approach is fine.

---

Built by Aditya Srivastava | Backend Architect | Trilasoft Solutions
