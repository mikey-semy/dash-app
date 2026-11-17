# DU

Personal file sharing and static-site publishing at [files.example.com](https://files.example.com).

- Upload files or folders by selection, drag-and-drop or paste. Folder paths are preserved; ignore rules exclude dependencies, caches and secrets. Review excluded entries before sending.
- Share a short link. Recipients download original files, a ZIP, or selected members. Images, audio, video, PDF, UTF-8 text and Markdown support preview.
- Paste text to open the full-screen editor. Syntax detection, source copying and password-protected Raw preserve the original text. Preview/editor limit: 5 MiB.
- History at `/history` supports search, selection, individual removal and adding files to an existing link. Rename transfer titles and filenames independently, directly in place.
- Retention: 1/6/24 hours, 3/7 days, forever, or one completed download. The lock generates and copies a six-digit PIN; double-click removes it. Current-transfer settings are independent of new-upload defaults.
- Trash and file removal require a second click to confirm. Deleted and expired transfers disappear from history; restoration is not available.
- A transfer containing `index.html` or `index.htm` is a site. New sites receive a distinct readable title; the inline generator proposes another title while editing. Enter/blur saves, Escape cancels. Files and links remain unchanged.
- Publish/unpublish controls public access. Presentation mode hides DU controls. A custom `404.html` handles missing site pages; otherwise a centered red cross is shown.
- Connect a domain in transfer settings after pointing its DNS at the DU server. HTTPS is issued and renewed by Traefik. Once verified, copy, QR and native sharing use the domain; otherwise they use the DU short link. React/Vue route fallback is optional for built SPAs.

Up to **100 files / 2 GB** per transfer. Total quota: **20 GB**, including temporary ZIPs. Interrupted uploads can resume in the same browser for 24 hours; changed source files are rejected.

## Setup and deployment

Copy `.env.example` to `.env` and fill in the owner PIN, S3 and hosting configuration. Example values are neutral; credentials and runtime data are excluded from Git.

Pushes to `main` run checks and deploy through GitHub Actions. The service uses the `holder` Compose project, S3 objects and a persistent SQLite volume. `holder-sites.service` exports validated domain routes without giving the app access to Docker socket or other applications' configuration.

## Development

Node.js 24:

```sh
npm ci
npm run lint
npm run format:check
npm test
npm run build
npx playwright test
```

Start with `node --env-file=.env server/main.js`. For a local address, set `PUBLIC_URL=http://localhost:3000` and allow that origin in the bucket CORS configuration.

Project conventions are in [AGENTS.md](AGENTS.md), boundaries in [ARCHITECTURE.md](ARCHITECTURE.md), and test guidance in [VALIDATION.md](VALIDATION.md).

`ADMIN_PASSWORD` controls sign-in. Keep `APP_SECRET` unchanged when changing it: existing transfer passwords and site signatures depend on this stable secret. Older installations use their original admin password as the default application secret.
