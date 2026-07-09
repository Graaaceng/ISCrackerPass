# ISC CyberSec

WebApp made as a prevention with different aspects of Cyber Security.

## Quick start

Requires Node ≥ 20 and (optionally) Docker for MongoDB.

```bash
npm install          # installs both workspaces
npm run db:up        # starts MongoDB in Docker (or use your own instance)
npm run dev          # runs API (:5174) and client (:5173) together
```

Open http://localhost:5173. The hero shows a live status line for the API and database. Everything works without MongoDB too — data routes just return 503 until it's up.

## Pages

### Password Cracker

Main attraction of this module. For now it's a simple estimate of the time it takes to crack a given password.

### Voice Cloning (WIP)

The goal of this module is to raise awareness of the possibilities of AI and its potential scams that come with it.

More to come.

## Scripts

| Command                             | What it does                                                                         |
| ----------------------------------- | ------------------------------------------------------------------------------------ |
| `npm run dev`                       | client + server together with hot reload                                             |
| `npm run dev:client` / `dev:server` | one side only                                                                        |
| `npm run build`                     | production client build to `client/dist`                                             |
| `npm run start`                     | run the API (serve `client/dist` behind your reverse proxy, or add `express.static`) |
| `npm run db:up` / `db:down`         | local MongoDB via Docker                                                             |

## Attribution

The ISC logos are © their authors, licensed [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) via [ISC-HEI/isc-logos](https://github.com/ISC-HEI/isc-logos). Keep the attribution (e.g. in the footer) in apps that use them, and note the non-commercial clause.
