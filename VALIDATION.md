# Dash validation

Run `npm run lint`, `npm run format:check`, `npm test`, `npm run build`, then `npx playwright test` before publishing.

The regular tests use in-memory storage and SQLite fixtures. They cover authentication, quota, multipart interruption/recovery, archive bytes, append/removal, original and Raw ranges, password/expiry/deletion, site publication, custom-domain boundaries and readable names.

Browser tests cover desktop/mobile geometry, keyboard and pointer focus, folder review, editor and Markdown behavior, media, QR positioning, history selection, inline renaming, publication and domain controls. Product labels are English; international filenames and document contents remain unchanged in fixtures.

The optional real-S3 test uses its own temporary objects and cleans them up. It is skipped when its explicit test configuration is absent.

After GitHub Actions deploys, verify the deployed commit and container health. Production UI checks use mocked owner APIs; server smoke fixtures use an isolated in-memory database. Do not upload, rename or delete user data for a smoke check.

Real certificate issuance requires a domain whose DNS points at the server. A mock DNS/probe test is not evidence that a real certificate has been issued.
