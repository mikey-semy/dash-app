# Roadmap

This file tracks remaining work; unchecked items are planned, not implemented. The application already supports file sharing, text/code and media previews, static-site publication, custom domains, a standalone history page and responsive file lists.

## Refactoring checkpoint

Completed:

- FSD layers and import checks; public slice entry points and native project aliases.
- English product copy in `shared/copy.js`; common product policy in `shared/config.js`.
- Shared icon controls, selection state, transfer commands, modal lifecycle and page focus restoration.
- Separate transfer titles, file names and identities; independent current-transfer settings and upload defaults.
- Design tokens and grouped styles; a shared file-table header and a responsive `/history` page.
- Separate authentication, owner/public APIs, downloads and HTTP policy on the server.
- Retained hashed assets so open tabs can load lazy modules after deployment.
- A stable application secret independent of the owner sign-in password.

The structural refactor is not finished. The next work is to complete the table abstraction and reduce the remaining large stateful modules, without changing links or stored data.

## 1. Complete the shared table layout

- [ ] Extract reusable table framing, column sizing and scroll boundaries from recipient/history styles; `FileTableHeader` is shared, but full table composition is still separate.
- [ ] Reuse file/transfer identity, size and action-cell layout where behavior actually matches.
- [ ] Consolidate remaining history rules currently spread across older stylesheets into `history.css`; remove obsolete modal-only history rules without changing settings dialogs.
- [ ] Extend compact-height behavior and safe-area coverage for landscape phones and narrow desktop windows.
- [ ] Check fast opening/closing, focus and scroll preservation during live transfer updates.

## 2. Finish frontend state extraction

- [ ] Split `useOwnerWorkspace.js` into focused upload lifecycle, transfer data and management hooks; preserve existing recovery and append semantics.
- [ ] Separate history filtering/selection and row interaction from rendering in `History.jsx`.
- [ ] Extract recipient polling, unlock and viewer coordination from `RecipientPage.jsx`.
- [ ] Give `/history` a clearer page-level entry point as navigation grows; retain the current transfer while moving between owner views.
- [ ] Reuse request/error coordination where ownership is clear; do not build a global state framework for local component state.

## 3. Complete the design-system cleanup

- [ ] Remove duplicate legacy CSS rules and document the final cascade ownership.
- [ ] Audit remaining animation values and visual constants outside tokens; keep content-dependent measurements local.
- [ ] Consolidate small shared control variants and ensure consistent target sizes, disabled states and keyboard focus.
- [ ] Keep all new UI copy in the English dictionary. Additional languages and an i18n framework are not planned.

## 4. Reduce server responsibilities

- [ ] Extract focused upload/append/archive/retention services from `server/service.js`, which still owns most transfer state transitions.
- [ ] Centralize repeated owner API serialization and validation where it improves consistency.
- [ ] Preserve revision checks, authorization, transfer validity, quotas and storage-prefix boundaries in every extraction.
- [ ] Improve structured diagnostics without exposing credentials, raw storage URLs or file content.

## 5. Operational hardening

- [ ] Document backup and restore for SQLite, the application secret and object storage; verify a restore with isolated fixtures.
- [ ] Define a supported upgrade and rollback policy, including configuration and schema changes.
- [ ] Add a release secret scan and dependency/license review to CI.
- [ ] Document the trust model and hosting limits for user-supplied static sites.
- [ ] Add concise contribution and private vulnerability-reporting guidance before accepting external contributions.

## Product ideas requiring a separate decision

- [ ] A read-only integration/API for external assistants, with scoped, revocable access.
- [ ] Transfer restoration only after defining retention and storage semantics; deleted transfers currently cannot be restored.
- [ ] Additional text encodings or richer collaboration only if they justify more interface complexity.

## Completion criteria

For every refactor: existing links, passwords, expiry, publication settings, file bytes and custom domains remain valid. Run the relevant focused scenarios, lint, formatting, server tests, a production build and browser checks. Verify deployments using mocked owner APIs or isolated in-memory fixtures, never user transfers.
