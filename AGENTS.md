# Project conventions

## Product

- Keep the interface minimal: white surfaces, icon actions, restrained typography, no explanatory panels unless requested.
- Product UI is English only. Keep all interface copy, accessible names, tooltips and public error messages in `shared/copy.js`. User filenames, content, domains and transfer titles are data; never translate them.
- Transfer identity, transfer title and filenames are independent. Preserve existing links, passwords, expiry, publication and file bytes during refactoring.

## Structure

- `shared/`: environment-independent product limits, settings and English copy shared by client and server.
- `src/app/`: application startup and route selection.
- `src/pages/`: upload and recipient screen composition and page-owned state.
- `src/widgets/`: history and file viewers composed from lower layers.
- `src/features/`: user actions such as uploading, composing text, signing in, sharing and managing transfers.
- `src/entities/transfer/`: reusable transfer presentation and retention policy presentation.
- `src/shared/`: generic UI, client API and utilities; no dependency on product screens or actions.
- Follow FSD dependency direction: app → pages → widgets → features → entities → shared. Different slices on the same layer must not import each other. Import other slices through their root public entry points; use local implementation imports inside a slice. Keep lazy entry points separate when necessary.
- `src/styles/`: design tokens and styles grouped by responsibility. Preserve documented cascade order.
- `server/`: storage, HTTP and domain services. Keep authorization and transfer validity checks on the server.
- Keep component state and local variables next to their owner. Only shared configuration belongs in shared modules.

## Design and behavior

- Define fonts, type scales, colors, spacing, borders, radii, control sizes and motion values in `src/styles/tokens.css`; use those tokens elsewhere. Geometry calculated from user content remains local.
- Use the established Lucide icon set and shared controls. Keep input text at least 16 px on mobile.
- Preserve CSP nonces, keyboard navigation, reduced surprises during modal/accordion transitions, and visible scrollbars at the viewport edge.
- Do not introduce an i18n framework or additional languages without a product requirement. Extend the English dictionary instead.

## Verification and release

- Test changes to behavior with focused server/browser scenarios. Keep accessible selectors in English. Do not translate fixture content or filenames to make a UI test pass.
- Run the relevant checks and production build before pushing. Push to `main` uses the established GitHub Actions release; wait for its outcome and verify the deployed version.
- Production smoke checks must not modify user transfers or files. Use mocked owner APIs or isolated in-memory fixtures.
- Never commit `.env`, credentials, runtime exports, generated bundles, test artifacts or `work/` files. Keep `.env.example` complete with neutral examples.
