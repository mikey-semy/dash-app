import { copy } from "../shared/copy.js";
import { fileTextCandidate, textCandidate } from "./text.js";
import { mediaType } from "./media.js";
import { siteEntry, sitePublished } from "./site-policy.js";
import { siteRoutes } from "./site.js";
import { createPublicAccess } from "./public-access.js";
import { registerDownloads } from "./downloads.js";

export function registerPublicApi(
  app,
  {
    service,
    env,
    hosting,
    isOwner,
    requireOwner,
    cookieOptions,
    limited,
    readText,
  },
) {
  const access = createPublicAccess({ service, isOwner, cookieOptions });
  const { transfer, allowed, rawCookie } = access;
  const site = siteRoutes(app, service, env, transfer);
  app.post("/public/:token/unlock", limited, access.unlock);
  app.get("/public/:token", (req, res) => {
    const t = transfer(req);
    if (t.password && allowed(req, t))
      rawCookie(req, res, t, req.cookies["grant_" + t.id]);
    res.json(
      allowed(req, t)
        ? {
            locked: false,
            title: t.title || "",
            shareUrl: hosting.shareURL(t),
            demo: !!t.demo,
            hasSite: !!siteEntry(t),
            published: sitePublished(t),
            site: sitePublished(t) ? site(t) : null,
            oneTime: !!t.one_time,
            preview: textCandidate(t),
            media:
              t.files.length === 1 ? mediaType(t.files[0])?.[0] || null : null,
            etag: t.output?.etag,
            files: t.files.map(({ name, size }) => ({
              name,
              size,
              preview: fileTextCandidate({ name, size }),
              media: mediaType({ name })?.[0] || null,
            })),
            expires: t.expires,
            size: t.output.size,
            name: t.output.name,
          }
        : { locked: true },
    );
  });
  registerDownloads(app, { service, ...access, readText, requireOwner });
  return site;
}
