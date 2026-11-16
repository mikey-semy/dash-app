# Architecture

## Boundaries

- `shared/config.js`: product limits, retention policy, locale, PIN policy and common interaction timing. It has no client/server dependencies.
- `shared/copy.js`: the single English product dictionary and small placeholder formatter. User content, filenames and titles are not localized.
- `src/app/`: startup, focus policy and route selection.
- `src/pages/upload/`: authenticated upload screen, workspace composition and page state.
- `src/pages/recipient/`: public transfer screen and its state.
- `src/widgets/history/` and `src/widgets/file-viewer/`: composed history and media/text/site viewing interfaces.
- `src/features/`: upload-files, compose-text, sign-in, share-transfer and manage-transfer actions.
- `src/entities/transfer/`: file list, expiry countdown and retention presentation.
- `src/shared/`: generic controls, errors, disclosure, editable names, code/Markdown rendering, client API and utilities.
- `server/auth.js`: owner authentication and the common session predicate.
- `server/owner-api.js`: authenticated transfer management routes.
- `server/app.js`: application composition and middleware order.
- `server/public-access.js`: transfer validity, password grants and one-time download claims, isolated per app.
- `server/public-api.js`: public metadata, unlock and website route coordination.
- `server/downloads.js`: original, member, Raw, media and selected ZIP responses. Private media explicitly requires owner authentication.
- `server/http-policy.js` and `server/pages.js`: response policy, CSP and app-page rendering.
- Other `server/` modules own storage, previews, website policy, domains and standalone status-page rendering.

`src/app/main.jsx` selects the upload or recipient page. The upload page owns workspace state, recovery and action coordination; multipart transport, upload recovery persistence and folder scanning belong to the upload-files feature. Storage state transitions remain in `server/service.js`. Keep future extractions focused on a single responsibility and preserve their existing authorization and concurrency rules.

## FSD imports

Dependencies point downward: **app → pages → widgets → features → entities → shared**. Pages, widgets, features and entities contain independent slices. Different slices on the same layer cannot import each other. Cross-slice imports use a root public entry point, usually `index.js`; implementation files remain private. Internal imports stay relative to their own slice. App and shared use responsibility segments rather than independent business slices.

The manage-transfer feature exposes separate `actions.js` and `publication.js` entry points so displaying existing actions does not eagerly load its settings dialog. The upload-files feature exposes `review.js` separately from its DOM-free model API. The file-viewer widget has separate `text.js`, `media.js` and `demo.js` entry points. Editor, detector, language modules and viewers retain lazy loading. The architecture check covers imports, re-exports, dynamic imports and worker URLs.

The root `shared/` is environment-independent policy used by both server and client; it is distinct from client-only `src/shared/`. Resource name parsing and language metadata live there, so server code does not depend on client JavaScript. `src/styles/` remains the documented shared design system location and is imported globally only from app startup.

## Identity

Transfer ID and share token identify the transfer. Its editable title identifies it to a person. Filenames identify members within the transfer. Renaming one never implicitly renames another. A verified custom domain is a sharing address; the canonical DU URL remains available for management.

## Design system

`src/styles/tokens.css` owns the palette, font families and scales, fixed dimensions, radii, motion values and media conditions. Custom media definitions are compiled by PostCSS. App/manifest metadata is generated from the shared English copy, language and theme tokens. CodeMirror and QR generation use the same palette. Standalone server pages embed the shared tokens and `status-page.css` with their CSP nonce.

`src/styles/index.css` documents the stylesheet order. That order preserves the established cascade while styles are grouped into foundations, motion, dialogs, upload, text, viewers and shared component layout. Modify the existing responsible rule instead of appending another override.

Use `IconButton` for icon controls; keep focus, disabled state and accessible names explicit. Keep component state and computed geometry local rather than adding them to global configuration.

## Verification

- `npm run lint`: copy, component, dependency and token guardrails.
- `npm run format:check`: repository formatting.
- `npm test`: server, storage, recovery, policy and utility checks.
- `npm run build`: client/worker build and CSS compilation.
- `npx playwright test`: browser behavior, accessibility labels and responsive geometry.

GitHub Actions runs these checks before the established `main` deployment. Existing transfer data and source file bytes must survive structural changes unchanged.
