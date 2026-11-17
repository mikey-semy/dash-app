# S3 Flash Drive

A self-hosted file-sharing and static-site publishing application backed by S3-compatible storage. Minimal white interface, short links and icon actions.

## Features

- File and folder uploads, drag-and-drop, clipboard paste and resumable multipart uploads. Folder paths are preserved; dependency folders, caches and sensitive files can be excluded before upload.
- Original downloads, ZIP archives and selected-file downloads. Passwords, expiry, one-time downloads and reusable permanent links.
- Full-screen text/code editor, automatic language detection, syntax highlighting, Markdown preview and protected Raw responses. UTF-8 preview limit: 5 MiB.
- Image, audio, video and PDF previews, with an optional presentation mode that hides application controls.
- A searchable `/history` page with selection, inline renaming, file management and transfer settings. Transfer titles and filenames are independent.
- Static sites from `index.html` or `index.htm`, optional SPA fallback, custom error pages, publication controls and custom domains with automatic HTTPS through Traefik.

Defaults: **100 files / 2 GB per transfer**, **20 GB total quota**, including temporary archives. Retention ranges from one hour to permanent storage or one completed download. Product limits are defined in `shared/config.js`.

## Run locally

Requires Node.js 24 and an S3-compatible bucket.

```sh
npm ci
cp .env.example .env
# Fill in the storage credentials, application URL and passwords.
npm run build
node --env-file=.env server/main.js
```

For local use, set `PUBLIC_URL=http://localhost:3000`. Configure the bucket CORS rules for the actual application origin. `.env.example` contains neutral examples; never commit your `.env` or credentials.

`ADMIN_PASSWORD` controls owner sign-in and has no fixed digit count. `APP_SECRET` is a separate, stable secret used for stored transfer passwords and website signatures. Keep it unchanged when rotating the sign-in password. Existing installations that omit it use their original admin password as the fallback; set `APP_SECRET` to that original value before changing `ADMIN_PASSWORD`.

## Deploy

Docker Compose and GitHub Actions deployment are provided for a Linux server with Traefik. Deployment is optional: configure repository variables and SSH secrets to enable it. See [deployment instructions](deploy/README.md) for prerequisites, storage templates and HTTPS setup.

## Development

```sh
npm run lint
npm run format:check
npm test
npm run build
npx playwright install chromium
npx playwright test
```

See [architecture](ARCHITECTURE.md), [project conventions](AGENTS.md), [validation](VALIDATION.md) and the [roadmap](ROADMAP.md).

## License

[MIT](LICENSE). Bundled fonts retain their own [license](public/Manrope-LICENSE.txt).
