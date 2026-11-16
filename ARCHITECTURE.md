# Architecture

## Boundaries

- `shared/config.js`: product limits, retention policy, locale, PIN policy and common interaction timing. It has no client/server dependencies.
- `shared/copy.js`: the single English product dictionary and small placeholder formatter. User content, filenames and titles are not localized.
- `src/components/`: reusable file lists, transfer actions and icon buttons.
- `src/features/history/History.jsx`: history selection, filtering and accordion behavior.
- `src/features/upload/OwnerView.jsx`: owner upload workspace and its feature coordination.
- `src/lib/`: formatting, retention presentation and password generation. Components import these utilities directly.
- `server/auth.js`: owner authentication and the common session predicate.
- `server/owner-api.js`: authenticated transfer management routes.
- `server/app.js`: application composition, public transfer endpoints and response policy.
- Other `server/` modules own storage, previews, website policy, domains and standalone status-page rendering.

`src/main.jsx` coordinates authentication and upload requests. Owner routes and authentication have explicit modules; storage state transitions remain in `server/service.js`. Keep future extractions focused on a single responsibility and preserve their existing authorization and concurrency rules.

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
