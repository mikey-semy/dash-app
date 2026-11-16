export const siteEntry = (t) =>
  t?.files
    ?.filter((f) => !f.directory && /(?:^|\/)index\.html?$/i.test(f.name))
    .sort((a, b) => a.name.split("/").length - b.name.split("/").length)[0] ||
  null;
export const siteAlive = (t) =>
  !!t &&
  t.state === "ready" &&
  !(t.one_time && t.consumed) &&
  (t.expires === null || t.expires > Date.now());
export const sitePublished = (t) =>
  siteAlive(t) && !!t.site_published && !!siteEntry(t);
