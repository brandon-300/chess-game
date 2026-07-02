# ♟️ Chess 3D

A browser-based 3D chess game rendered with **Three.js**, playable locally, against an AI, or online against other players in real time — no installs, no plugins, just open it in a browser.

**Live demo:** [chess-game-ten-cyan.vercel.app](https://chess-game-ten-cyan.vercel.app)

![HTML](https://img.shields.io/badge/HTML-52.4%25-orange) ![JavaScript](https://img.shields.io/badge/JavaScript-47.6%25-yellow) ![License](https://img.shields.io/badge/license-Unlicense-blue)

---

## Overview

Chess 3D is a fully client-side chess application built with vanilla HTML, CSS, and JavaScript — no frameworks, no bundlers, no build step. The board and pieces are rendered in 3D using Three.js, and the whole thing runs directly in the browser. User accounts, profiles, and online multiplayer are powered by [Supabase](https://supabase.com) (Auth, Postgres, and Realtime).

It supports three ways to play:

- **Two Players (local)** — pass-and-play on the same device
- **vs AI** — three difficulty levels, choose your color
- **Online** — public matchmaking rooms or private rooms with a shareable room code, plus in-match chat

## Features

- 🎨 **3D rendered board** using Three.js, with a custom gold-and-candlelight "royal" theme (Cinzel / Cormorant Garamond fonts, glassmorphism UI)
- 👥 **Local two-player mode** — pass-and-play on one device
- 🤖 **AI opponent** with three difficulty levels (Novice, Knight, Master) and a choice of playing as Red or Black
- 🌐 **Online multiplayer**
  - Public rooms with matchmaking
  - Private rooms via shareable room codes
  - Countdown-to-start sequence
  - Rematch requests after a game ends
  - Leave/forfeit confirmation and reconnect handling for dropped connections
- 🎙️ **Real-time voice chat** between players during online matches (peer-to-peer WebRTC audio, no typing needed — just talk)
- 🔐 **Accounts via Supabase Auth** — sign up, log in, forgot/reset password, and a profile page with an avatar
- ⏱️ **Per-player move timers** with a low-time visual warning
- ♛ **Pawn promotion** picker
- ↩️ **Undo move** in local modes
- ☁️ **Save & restore** — save progress locally, sync local (offline) game data to the cloud, restore it back, and clear synced cloud data on demand
- 📶 **Offline detection** banner when the connection drops
- 📱 **Mobile-first, responsive UI** built for touch devices

## Tech Stack

| Layer | Technology |
|---|---|
| 3D rendering | [Three.js](https://threejs.org/) (r128) |
| Game logic / UI | Vanilla JavaScript (ES modules), HTML5, CSS3 — no framework, no build tooling |
| Voice chat | WebRTC (peer-to-peer audio), signaled over Supabase Realtime |
| Backend / data | [Supabase](https://supabase.com) — Auth, Postgres database, Realtime |
| Hosting | [Vercel](https://vercel.com) |
| Fonts | Cinzel & Cormorant Garamond (Google Fonts) |

## Project Structure

```
chess-game/
├── index.html            # Main game page — 3D board, menus, in-game HUD, chat, modals
├── main.js                # Entry point; boots the app and wires the other modules together
├── game_engine.js         # Core chess rules: move generation/validation, game state, AI logic
├── ui_handler.js          # DOM & 3D scene glue — rendering, input handling, animations, panels
├── config.js               # App/Supabase configuration (project URL & public anon key)
├── database.js            # Supabase queries — auth, profile, save/restore, online rooms & voice-call signaling
├── user_login.html        # Sign in / sign up page
├── forgot_password.html   # Request a password reset email
├── reset_password.html    # Set a new password from the reset link
└── profile.html            # User profile page (avatar, account details)
```

## Getting Started

Because the app uses native ES modules (`main.js` is loaded via `<script type="module">`), it needs to be served over `http(s)://` rather than opened directly as a `file://` URL.

### 1. Clone the repository

```bash
git clone https://github.com/brandon-300/chess-game.git
cd chess-game
```

### 2. Set up Supabase (for accounts, profiles, and online play)

1. Create a free project at [supabase.com](https://supabase.com).
2. Enable **Email/Password** sign-in under Authentication.
3. Set up the tables/columns that `database.js` expects (profiles, saved games, online rooms, chat/call logs, etc.) to match the queries in that file.
4. Copy your **Project URL** and **anon public key** into `config.js`.

> Local two-player and vs-AI modes will work without Supabase configured; accounts, cloud save/restore, and online multiplayer (including voice chat) require it.

> Voice chat uses WebRTC, with signaling passed over a Supabase Realtime channel. It requires microphone permission and a working STUN/TURN setup for players on restrictive networks (e.g. mobile carriers) to connect to each other.

### 3. Serve the project locally

Any static file server works, for example:

```bash
# Using Node
npx serve .

# Using Python
python3 -m http.server 8000
```

Then open `http://localhost:<port>/index.html` in your browser.

### 4. Deploy

The project is a static site, so it deploys as-is to any static host. The live demo is hosted on [Vercel](https://vercel.com) — simply import the repo and deploy with no build command.

## How to Play

1. Open the app and choose a mode from the main menu: **Two Players**, **vs AI**, or **Online**.
2. **Two Players** — pass the device between moves.
3. **vs AI** — pick a difficulty (Novice / Knight / Master) and a color, then play.
4. **Online** — sign in, then either:
   - Join or create a **Public Room** to be matched with another player, or
   - Create or join a **Private Room** using a room code to play with someone specific.
5. Grant microphone permission when prompted so you can talk to your opponent live during an online match.
6. Tap the board to select and move pieces; promote pawns via the on-screen picker when they reach the final rank.
7. Save progress, restore a previous game, or sync your offline data to the cloud from the main menu buttons.

## Contributing

Issues and pull requests are welcome — this project has no formal roadmap or contribution process, so feel free to fork it, open a PR, or file an issue with a bug or idea.

## License

This project is released into the public domain under the **Unlicense**. That means you're free to copy, modify, distribute, sell, or build on it for any purpose, commercial or otherwise, with no attribution required. See [LICENSE](LICENSE) for the full text.
