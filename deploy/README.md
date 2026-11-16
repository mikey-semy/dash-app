# Deployment

The established GitHub Actions workflow builds and deploys the `holder` Compose service after checks pass. Runtime configuration is kept in the server `.env`; use `.env.example` as the complete neutral template.

S3 configuration is shared infrastructure. Read existing CORS, lifecycle, policy and versioning settings before merging changes. Restrict this application's object access and multipart cleanup to its configured prefix; preserve other applications' rules and credentials. The JSON files in this directory are templates to review and merge, not replacement commands.

Custom domains use the existing Traefik file provider and certificate resolver. `sync-sites.py` accepts only validated domain names, refuses hostnames already used by other applications, and writes only its own routing file. The app exports domain data through a dedicated bind mount and receives no Docker socket.

Point domain A/AAAA records at the same server as DU. HTTP-01 certificate issuance requires correct DNS and accessible ports 80/443. Domains stay separate from transfer titles and share tokens.
