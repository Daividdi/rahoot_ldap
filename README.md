<p align="center">
  <img width="450" height="120" align="center" src="https://raw.githubusercontent.com/Ralex91/Rahoot/main/.github/logo.svg">
</p>

<p align="center">
  <strong>Fork with extended features: 3D avatars, game modes, XP system, rankings and analytics.</strong><br>
  Based on <a href="https://github.com/Ralex91/Rahoot">Ralex91/Rahoot</a>
</p>

---

## What this fork adds

- **3D avatars** — 100Avatars R3 collection (VRM) with Mixamo animations, rendered in-browser via Three.js
- **Game modes** — Classic, Solo and Team vs Team
- **Player profiles** — XP, level progression and tier badges
- **Weekly ranking** — shows the closed week's leaderboard
- **Manager dashboard** — analytics per quiz session
- **Avatar selection screen** — browse and favourite avatars before joining
- **SQLite persistence** — game history, player names and profiles stored locally

---

## Stack

| Layer | Tech |
|---|---|
| Runtime | Node.js 22, pnpm workspaces |
| Web | Next.js 15 (standalone output) |
| Socket | Custom TypeScript server (esbuild) |
| Proxy | Nginx (Docker) |
| Data | SQLite (better-sqlite3) + JSON config files |

---

## Quick deploy (new server)

```bash
# 1. Clone the repo
git clone https://github.com/Daividdi/Rahoot.git
cd Rahoot

# 2. Run — replaces all setup steps
./deploy.sh your-domain.com
```

`deploy.sh` will:
- Create the `../config/` data directory
- Seed default `game.json` and example quizzes
- Generate a `.env` for your domain
- Download the 3D avatar collection (~590 MB, skipped if already present)
- Build the Docker image and start all containers (app + nginx)

> **HTTPS:** after deploy, run `certbot --nginx -d your-domain.com`

---

## Environment variables

Copy `.env.example` to `.env` and fill in the values:

```bash
cp .env.example .env
```

| Variable | Description | Example |
|---|---|---|
| `WEB_ORIGIN` | Public URL of the web app | `http://rahoot.example.com` |
| `SOCKET_URL` | Public URL of the socket server | `http://rahoot.example.com:3002` |
| `TZ` | Server timezone | `America/Sao_Paulo` |
| `WEB_PORT` | Host port → web container (3000) | `3003` |
| `SOCKET_PORT` | Host port → socket container (3001) | `3002` |

> **Never commit `.env`** — it is already in `.gitignore`. Use `.env.example` as the template.

---

## Configuration files

All runtime data lives in `../config/` (one level above the repo, created by `deploy.sh`):

```
config/
├── game.json          ← master password and global settings
├── quizz/             ← one JSON file per quiz
├── rahoot.db          ← SQLite database (players, history, badges)
├── avatars-3d/        ← 3D avatar models and animations (~590 MB)
│   ├── r3/models/     ← VRM files
│   ├── r3/icons/      ← PNG thumbnails
│   ├── animations/    ← FBX Mixamo animations
│   └── catalog.json   ← avatar index read by the app
└── history.json       ← game session history
```

### game.json

```json
{
  "managerPassword": "change-me",
  "music": true
}
```

### Quiz format (`config/quizz/my-quiz.json`)

```json
{
  "subject": "My Quiz",
  "questions": [
    {
      "question": "What is the correct answer?",
      "answers": ["Wrong", "Correct", "Wrong", "Wrong"],
      "image": "https://example.com/image.jpg",
      "solution": 1,
      "cooldown": 5,
      "time": 15
    }
  ]
}
```

| Field | Type | Description |
|---|---|---|
| `subject` | string | Quiz title |
| `question` | string | Question text |
| `answers` | string[] | 2 to 4 options |
| `image` | string (optional) | Image URL shown above the question |
| `solution` | number | Zero-based index of the correct answer |
| `cooldown` | number | Seconds before the question is shown |
| `time` | number | Seconds allowed to answer |

---

## Development

```bash
# Start with live reload (mounts source as volume)
cp .env.example .env   # edit WEB_ORIGIN and SOCKET_URL
docker compose -f docker-compose.dev.yml up
```

Or without Docker:

```bash
pnpm install
# terminal 1
cd packages/socket && pnpm dev
# terminal 2
cd packages/web && pnpm dev
```

---

## Rollback

```bash
./rollback.sh list          # list available backups
./rollback.sh <tag>         # restore from backup
./rollback.sh <tag> --dry   # preview without touching anything
```

---

## Re-download 3D avatars

If the `config/avatars-3d/` folder is missing or incomplete:

```bash
AVATARS_ROOT=../config/avatars-3d node fetch-r3.mjs
```

---

## Original project

This is a fork of [Ralex91/Rahoot](https://github.com/Ralex91/Rahoot). All original credits apply.
