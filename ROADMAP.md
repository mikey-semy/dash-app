# Dash roadmap

This file tracks remaining work; unchecked items are planned, not implemented. The application already supports file sharing, text/code and media previews, static-site publication, custom domains, a standalone history page and responsive file lists.

## Performance track

Current phase: bounded parallel multipart uploads. The default is four requests per file, with the existing 8 MiB parts and sequential file finalization. No network speedup is claimed until representative measurements are available.

- [x] Send independent parts concurrently with a bounded request pool.
- [x] Aggregate byte progress without counting retries twice; reuse already accepted parts on resume.
- [x] Abort every active PUT on pause/cancel and stop pending work after an unrecoverable error. Ignore late signing responses and progress events.
- [x] Use progress-based idle timeouts so slow but advancing parallel requests are not cut off by a fixed total deadline.
- [x] Keep append indices, original file bytes, fresh signed URLs on retry and server-side completion validation.
- [ ] Measure end-to-end uploads at concurrency 1/2/4/6 with isolated fixtures. Record preparation, signing, transfer and archive time separately, plus memory usage and failures. Synthetic scheduling tests are not network throughput measurements.
- [ ] Add adaptive concurrency only after those measurements, with conservative behavior on slow or unreliable connections.
- [ ] Investigate startup latency from full-file fingerprinting and IndexedDB persistence. Overlap work only while preserving changed-file detection and closed-tab recovery.
- [x] Overlap IndexedDB source persistence with full-content fingerprinting; reuse fingerprints only for the same immutable File/Blob object. Keep recovery metadata unpublished until hashing finishes. Full-file preparation latency still needs measurement and further optimization.
- [ ] Benchmark larger part sizes; persist per-upload sizing before changing defaults so old uploads remain resumable.
- [x] Pipeline ZIP multipart writes with two concurrent requests, bounded part buffers and ordered completion. Drain active writes before aborting failed/cancelled multipart uploads; preserve uncompressed ZIP bytes. Real-storage throughput measurements remain pending.
- [ ] Benchmark bounded parallel S3 Range reads behind one browser download stream. Preserve the application domain, backpressure, ETags, passwords, expiry, cancellation and one-time download semantics.
- [ ] Consider a browser-side range downloader only with a compatible streaming-to-disk strategy and a normal-download fallback; avoid assembling large downloads in RAM.
- [ ] Profile server CPU and allocation hotspots before considering native/Rust code. A language rewrite is not a measured network optimization.
- [ ] Evaluate optional WebRTC transfers when both peers are online, retaining storage-backed permanent links as the fallback.

Performance work must not add controls to the minimal interface or change existing transfer links and file bytes. Production checks use mocked APIs or isolated in-memory fixtures; real-storage measurements need a separate temporary test scope and explicit cleanup.

## Delivery and storage architecture

These references identify useful designs, not evidence of higher throughput under comparable conditions. Keep recipient URLs on the application domain and preserve existing transfers.

- [ ] Establish reproducible small-file, many-file and large-file benchmarks, including mobile, high latency and interrupted connections. Measure time to first byte, preparation, transfer, finalization, peak memory and retries.
- [ ] Bound concurrency across the entire upload, not only parts within one file. Compare fixed settings before adaptive scheduling; overlap hashing and persistence only while preserving recovery guarantees.
- [ ] Evaluate an authenticated download/CDN path under the application domain. Ordinary S3 redirects reveal storage URLs. Define cache behavior for passwords, revocation, expiry and single-use transfers before enabling caching.
- [ ] Design content-addressed object reuse inspired by Gokapi. Physical objects, transfer identity, title, filename, password and retention remain independent.
- [ ] Add reference accounting and race-safe garbage collection before deduplication. Deleting one transfer must not remove another transfer's bytes. Test concurrent upload/delete and failed finalization.
- [ ] Separate storage deduplication from skipping uploads. A client-supplied hash must not grant access to another object's bytes; define verification, ownership, encryption and quota semantics first.
- [ ] Evaluate virtualized history/file lists and lazily generated media thumbnails, inspired by Zipline. Preserve original downloads, selection, keyboard navigation and scroll position.
- [ ] Model static-site versions as immutable file manifests with reusable objects, inspired by Netlify. Validate a complete version before atomically switching publication; failed updates retain the previous version.
- [ ] Define site rollback, version retention, cache invalidation and garbage collection. Keep assets needed by already-open pages available; atomic publication alone does not solve stale-page requests.
- [ ] Prototype optional WebRTC transfers inspired by PairDrop, with signaling, STUN/TURN, integrity checks, cancellation and reconnection. Both devices must be online; retain storage-backed links and account for relay costs.
- [ ] Consider native/QUIC tooling only after profiling demonstrates a need. A language rewrite alone is not a throughput guarantee.

## Installation and configuration speed

Deferred while delivery performance is the active priority. Goal: install Dash, connect storage and configure a domain through a short first-run flow. Routine administration should not require editing `.env`. Keep instance administration in owner settings and preserve the minimal upload/recipient interface.

### 1. Versioned installation

- [ ] Publish a single-command Linux installer at a stable HTTPS URL, inspired by Dokploy, with readable source, version-pinned downloads and checksum verification. Opening a link alone cannot install software on a remote server; execution requires server access.
- [ ] Define supported distributions, architectures, resources and ports. Detect Docker/Compose, existing reverse proxies and conflicts before making changes.
- [ ] Distribute versioned container images rather than building on the target host. Provide manual Compose instructions and, later, Dokploy-compatible deployment templates.
- [ ] Make installation repeatable, preserve existing data, create persistent volumes and generate a stable application secret. Do not overwrite other applications or require Docker socket access inside Dash.
- [ ] Provide progress, actionable failures, retry, upgrade and rollback. Define backup, restore and uninstall behavior; removal of persistent data must be explicit.

### 2. First-run flow and persistent settings

- [ ] Add resumable setup: claim instance, create owner credentials, connect storage, configure domain and verify readiness. Protect unclaimed instances with a one-time bootstrap credential.
- [ ] Store validated settings server-side with schema versions and migrations. Encrypt provider credentials using the stable application secret; mask secrets in responses, logs and exports. Backups require the database and application secret.
- [ ] Define precedence between persistent settings and environment overrides; indicate externally managed fields. Retain `.env` for automated deployments and compatibility.
- [ ] Separate provider connection, active storage location and upload defaults. Each existing transfer retains its original storage location when defaults change.
- [ ] Test proposed connections before activation. Support reconnection, credential rotation and revocation; prevent removal of a location referenced by existing transfers until an explicit migration is complete.

### 3. Yandex Cloud first

- [ ] Introduce a provider adapter for discovery, authorization, configuration inspection and health. Start with Yandex Cloud while preserving the generic S3 data-plane contract.
- [ ] Use the official `@yandex-cloud/nodejs-sdk` for supported cloud-management APIs and the existing AWS S3 SDK for object/multipart operations. Verify SDK coverage before selecting REST/gRPC fallbacks.
- [ ] Validate supported browser authorization, application registration and scopes in an isolated proof of concept. Aim for sign-in and resource selection; provide a guided credentials alternative if the provider does not support the required delegated flow.
- [ ] List accessible clouds, folders and buckets with pagination. Allow selecting an existing bucket and optionally creating a dedicated one.
- [ ] Separate interactive setup authorization from unattended runtime access. Select or provision a dedicated service account with limited permissions where authorized; support rotation/renewal instead of relying on a short-lived user IAM token.
- [ ] Inspect selected bucket/prefix, endpoint, region, permissions, anonymous access, CORS, storage class, versioning, lifecycle and size limits. Show current values alongside recommended changes before applying them.
- [ ] Recommend private access, standard storage for active sharing, origin-specific CORS and cleanup of abandoned multipart uploads with timing compatible with upload recovery.
- [ ] Preserve unrelated policies, CORS entries, lifecycle rules and website hosting in shared buckets. Scope changes to the application prefix where supported; explicitly identify bucket-wide changes and never silently replace their complete configuration.
- [ ] Apply reviewed recommendations through an explicit action. Dash static-site serving must not require making the entire bucket public.
- [ ] Check management permissions separately from object permissions. Validate write/read/range/multipart/delete in an isolated setup-test prefix; clean up fixtures and report cleanup failures.
- [ ] Show connection health, credential expiry and missing permissions. Expose quota/usage information where supported, without implying all cloud billing data is available through S3.

### 4. Domain, DNS and HTTPS

- [ ] Show expected public IPv4 and optional IPv6 with copy actions and concise A/AAAA/CNAME instructions appropriate to the hostname. Allow correcting address detection behind NAT or a reverse proxy.
- [ ] Separate the instance domain from domains bound to published sites. Reuse DNS/certificate status presentation while preserving different routing and ownership rules.
- [ ] Check DNS resolution, stale AAAA records, proxy mode, HTTP reachability and certificate-challenge ports. Distinguish propagation delays from configuration errors.
- [ ] Automate ACME certificate issuance and renewal through the supported reverse proxy. Support existing TLS termination; evaluate DNS-01 later for installations without inbound challenge ports.
- [ ] Show issuance/renewal status and rate-limit-aware retry. Update public URLs and CORS origins safely when changing the instance domain, preserving working access until verification succeeds.
- [ ] Keep setup possible before DNS/TLS is ready through a secure bootstrap path or local tunnel; do not transmit reusable cloud credentials over public unprotected HTTP.

### 5. Delivery order and acceptance

- [ ] First implement persistent settings and guided existing-S3 connection, preserving environment-configured installations and all existing transfers.
- [ ] Next validate Yandex Cloud authentication/discovery, then resource selection, reviewed recommendations and isolated connection tests.
- [ ] Package the tested setup flow into the installer/templates; add domain/DNS/HTTPS assistance using the same settings model.
- [ ] Verify clean installation, interrupted setup, expired credentials, denied permissions, shared buckets, proxy conflicts, certificate failures, upgrade and restore with isolated fixtures.
- [ ] Measure clean-host-to-first-share time, manual steps and recovery from failures alongside transfer throughput. Setup speed is a product performance metric.

## Technical references

- [Gokapi upload/resource settings](https://github.com/Forceu/Gokapi/blob/master/docs/advanced.rst) and [deduplication](https://github.com/Forceu/Gokapi/blob/master/docs/usage.rst).
- [Pingvin Share X direct S3 transfers](https://github.com/smp46/pingvin-share-x/releases/tag/v2.0.0), [Zipline dependencies](https://github.com/diced/zipline/blob/trunk/package.json), [PairDrop connection model](https://github.com/schlagmichdoch/PairDrop/blob/master/docs/faq.md) and [Netlify atomic deployment](https://docs.netlify.com/deploy/deploy-overview/).
- [Dokploy installation](https://docs.dokploy.com/docs/core/installation).
- [Yandex Cloud Node.js SDK](https://yandex.cloud/en/docs/functions/lang/nodejs/sdk), [Object Storage authentication](https://yandex.cloud/en/docs/storage/api-ref/authentication), [access management](https://yandex.cloud/en/docs/storage/security/overview), [CORS](https://yandex.cloud/en/docs/storage/operations/buckets/cors) and [multipart cleanup](https://yandex.cloud/en/docs/storage/concepts/multipart).

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
