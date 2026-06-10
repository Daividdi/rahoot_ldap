# Offline installation

This folder contains everything the project needs to be built and run on a
machine **without internet access**:

| Contents            | Description                                                      |
|---------------------|------------------------------------------------------------------|
| `deps/`             | pnpm store with every dependency in `pnpm-lock.yaml` (glibc + musl, tar split into 90MB parts) |
| `images/`           | Base Docker images (`node:22-alpine`, `nginx:alpine`)            |
| `bin/`              | pnpm 9.15.9 tarball (installed inside the container at build time) |
| `assets/`           | 3D avatars, icons and animations (~590MB, 90MB parts)            |
| `install-server.sh` | Full installer for a fresh server (see below)                    |
| `prepare.sh`        | Extracts store + Docker images only (used by the installer)      |
| `pack-deps.sh`      | Regenerates the dependency packages (machine with internet)      |

## Fresh server (clean install, no internet)

```bash
git clone <this repository>   # or copy it via USB drive / internal network
cd rahoot
sudo ./offline/install-server.sh
```

The installer prompts for and configures everything interactively:

- Server **FQDN** (and optionally the system hostname)
- Ports (nginx/web, socket) and timezone
- **LDAP/AD credentials** (optional)
- **New admin password** (or generates a random one)
- Extracts dependencies, Docker images and 3D avatars from the repo packages
- Generates local `.env` (mode 600) and `nginx.conf` — **never committed**
- Creates a clean `config/`: no game database, no rankings, no sessions
- Builds 100% offline and starts the containers

Prerequisite on the target machine: Docker + compose plugin already
installed (from your internal mirror). That is the only thing the
installer does not bring along.

## Updating the dependency packages (machine with internet)

Whenever `pnpm-lock.yaml` changes:

```bash
./offline/pack-deps.sh
git add offline/
git commit -m "chore: update offline packages"
```

## Notes

- Files are split into 90MB parts because GitHub rejects files larger
  than 100MB.
- The extracted `.pnpm-store/` stays out of git (`.gitignore`) and the
  heavy parts (`offline/deps`, `offline/images`, `offline/assets`) stay
  out of the Docker build context (`.dockerignore`).
- The real `.env` (domains, LDAP credentials, passwords) never goes into
  git — use `.env.example` as a reference.
