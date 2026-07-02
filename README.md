 ```markdown
# ♟ Chess 3D

A fully‑featured 3D chess game built with **Three.js**, **Supabase**, and **Vercel**. Play locally against a friend or the AI, or compete online with real‑time multiplayer, voice chat, and full account management.

## ✨ Features

### 🔹 Core gameplay
- 3D chessboard rendered with **Three.js** – rotate, pan, and zoom
- Full chess engine: all piece movements, castling, en passant, pawn promotion
- Check, checkmate, stalemate, and three‑fold repetition detection
- Move animation and sound effects

### 🔹 Game modes
- **Two‑player** – pass‑and‑play locally
- **vs AI** – three difficulty levels (Novice, Knight, Master) with time‑controlled iterative deepening
- **Online** – real‑time 1‑vs‑1 matches with countdown, timers, and rematch

### 🔹 Online play (Supabase)
- Public rooms (join the most recent) and private rooms (shared code)
- Host / joiner role: host always Red, joiner Black
- Synchronised timers and board state
- **Voice chat** via WebRTC with mute/speaker toggles and talking indicator
- Match freezing / reconnection (10‑minute window)

### 🔹 Authentication & account
- Email / password sign‑up and login
- OAuth: **Google** and **GitHub** (Facebook “Coming soon”)
- Magic‑link sign‑in for new users (onboarding flow after link)
- Profile page with avatar (Cropper.js), online status, edit fields
- Password reset with strength checklist, 1‑hour cooldown, and live countdown
- All Supabase email templates branded (password change, email change, phone change)

### 🔹 Cloud sync & offline backup
- Save / restore offline games locally
- Upload backups to Supabase and restore them on any device

### 🔹 UI / UX
- Dark, gold‑themed glassmorphism design
- Mobile‑friendly with touch controls
- Loading spinners and toast notifications throughout
- Navigation locks to prevent leaving critical pages

## 🛠 Tech Stack

| Layer | Technology |
|-------|------------|
| 3D rendering | [Three.js](https://threejs.org/) r128 |
| Backend / DB | [Supabase](https://supabase.com/) (Auth, Database, Storage, Realtime) |
| Hosting | [Vercel](https://vercel.com/) |
| Voice | WebRTC (peer‑to‑peer) via Supabase Realtime Broadcast |
| Image cropping | [Cropper.js](https://fengyuanchen.github.io/cropperjs/) |
| Fonts | Inter, Material Symbols |

## 📁 Project structure

```

├── index.html              # Main game UI and canvas
├── main.js                 # Orchestrator: game modes, online logic, save/restore
├── game_engine.js          # Chess rules, AI, Three.js rendering, SFX
├── database.js             # Supabase queries, voice signalling, backup sync
├── ui_handler.js           # DOM manipulation, event wiring, toasts
├── voice_handler.js        # WebRTC peer connection and audio controls
├── user_login.html         # Login / Signup / OAuth / Magic link
├── profile.html            # Profile management with avatar cropping
├── forgot_password.html    # Password reset request (username or email)
├── reset_password.html     # Set new password with strength checklist
├── welcome.html            # Post‑onboarding welcome screen
├── onboarding.html         # Post‑signup profile completion with avatar upload
└── api/
└── resize-avatar.js    # (optional) Vercel serverless function for image resize

```

## 🚀 Getting Started

### Prerequisites
- A [Supabase](https://supabase.com) project
- A [Vercel](https://vercel.com) account (or any static host)
- (Optional) Google, GitHub OAuth credentials for social login

### 1. Clone the repository
```bash
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git
cd YOUR_REPO
```

2. Supabase setup

1. Create a Supabase project.
2. Run the SQL from the project summary (or the provided migration) to create tables (profiles, online_games, chat_messages, offline_backups) and set up triggers and RLS policies.
3. Enable the required Auth providers (Email, Google, GitHub) in Authentication → Providers.
4. Set the Site URL in Authentication → URL Configuration to your Vercel domain.
5. Update config.js (or the hardcoded values in each file) with your Supabase URL and anon key.

3. Deploy to Vercel

1. Push the repository to GitHub.
2. Import the project into Vercel.
3. Set environment variables in Vercel (if using the optional image‑resize function):
   · SUPABASE_URL
   · SUPABASE_SERVICE_ROLE_KEY
4. Deploy.

4. (Optional) Voice chat

Voice is peer‑to‑peer using Supabase Realtime Broadcast. No TURN server is configured by default – add one in voice_handler.js if you experience connectivity issues on restrictive networks.

📜 License

This project is released under the MIT License, which means you can freely use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the software. See the LICENSE file for the full text.

```
MIT License

Copyright (c) 2025 Chess 3D

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:
…
```

Note: If you prefer a license with even fewer restrictions, you can replace MIT with the Unlicense (public domain). Just swap the text above.

🤝 Contributing

Pull requests and suggestions are welcome. For major changes, please open an issue first to discuss what you would like to change.

📧 Contact

If you have any questions, feel free to reach out via the repository issues.

---

Enjoy the game! ♚

```