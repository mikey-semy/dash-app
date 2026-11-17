# Deployment

## Prerequisites

- A Linux server with Docker and the Compose plugin, and an S3-compatible bucket.
- Traefik with a shared Docker network, file-provider directory and an HTTP-01 certificate resolver. Inbound ports 80 and 443 must be accessible for HTTPS issuance and renewal.
- DNS records for your application domain pointing at the server.

Copy `.env.example` to the server `.env` and replace all examples. Set a stable `APP_SECRET` separately from `ADMIN_PASSWORD`; do not change it during password rotation. Keep environment files, SQLite, exports and credentials outside Git and source archives.

## Docker Compose

The supplied configuration joins the existing network named by `TRAEFIK_NETWORK` and uses the certificate resolver named by `TRAEFIK_CERTRESOLVER`. Configure both before starting it.

```sh
docker compose -p holder up -d --build
```

SQLite lives in a persistent Docker volume. S3 object data, SQLite metadata and the application secret must be included in a consistent backup plan. Keep runtime mounts and caches separate from the checkout you publish.

## GitHub Actions

Checks run on pushes and pull requests. To enable deployment on pushes to `main`, set the repository variable `DEPLOY_ENABLED=true` and configure these repository secrets:

| Secret               | Purpose / example                                             |
| -------------------- | ------------------------------------------------------------- |
| `DEPLOY_TARGET`      | SSH destination, such as `deploy@server.example.com`          |
| `DEPLOY_HEALTH_URL`  | Public health-check URL, such as `https://files.example.com/` |
| `DEPLOY_SSH_KEY`     | Private SSH key for the deployment account                    |
| `DEPLOY_KNOWN_HOSTS` | Verified SSH host keys for the server                         |

Keep deployment addresses in secrets to avoid exposing infrastructure details in public workflow logs. The deployment account must have the privileges required by `deploy/release.sh`. Review that script before adopting it: the supplied Linux layout uses `/root/apps/s3-flash-drive` and `/root/infra/traefik/dynamic`. Prepare the application directory and its `.env` before the first release.

The workflow builds the tested image, transfers it over SSH, then invokes the release script. The script preserves the database volume, checks container health and can restore the previous configuration on failure. An optional server-side `.env.pending` is applied during the next release; do not place it in the repository.

`assets-cache/` retains complete hashed resource graphs for the ten latest local images so already-open tabs can load lazy modules after deployment. The app mounts this dedicated cache read-only. It contains no application configuration or user transfers.

## S3 templates

`cors.json`, `bucket-policy.json` and `lifecycle.json` are neutral templates. Replace the application origin, bucket, account identifier and object prefix with your own values. Align them with `.env`; do not blindly replace an existing bucket's configuration.

Restrict object access and incomplete multipart cleanup to the configured application prefix. Preserve any rules used by other applications sharing the bucket.

## Custom domains

Point each custom domain's A/AAAA records at the application server. `sync-sites.py` accepts validated domains, avoids routes owned by other applications and writes only its own routing file. The application exports domain data through a dedicated bind mount and receives no Docker socket.

DNS verification alone does not prove that a certificate was issued. Check the real HTTPS endpoint after issuance. Domain addresses remain independent of transfer titles and short share tokens.
