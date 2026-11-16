import { randomInt } from "node:crypto";
import { siteEntry } from "./site-policy.js";

const adjectives =
  "amber bright calm cedar clear clever coral cosmic crisp crystal dawn deep distant eager emerald fair gentle golden grand green hidden hollow ivory jade kind late leafy light little lively lunar mellow mild misty modern mossy noble ocean open pale pearl quiet rapid rare red royal rustic sandy serene silver simple snowy solar steady still sunny swift tiny vivid warm wild wise".split(
    " ",
  );
const nouns =
  "anchor apple arch atlas bay beach birch bloom brook canyon cedar cherry cloud coast comet coral creek dawn delta dune elm fern field finch flame forest fox garden grove harbor hawk hill island lake lantern leaf maple meadow moon moss ocean olive orbit owl palm path peak pine planet pond quartz raven reef ridge river rock rose shore sky sparrow star stone stream summit valley wave willow wind wing wood".split(
    " ",
  );

export function generateSiteTitle(db, { avoid = [], random = randomInt } = {}) {
  const used = new Set(
    db
      .prepare(
        "SELECT COALESCE(NULLIF(title,''),json_extract(output,'$.name'),json_extract(files,'$[0].name')) AS name FROM transfers WHERE parent IS NULL AND state NOT IN ('deleted','deleting') AND (expires IS NULL OR expires>?)",
      )
      .all(Date.now())
      .map((row) => row.name?.toLowerCase())
      .filter(Boolean),
  );
  for (const name of avoid)
    if (typeof name === "string") used.add(name.toLowerCase());
  const count = adjectives.length * nouns.length,
    start = random(count);
  for (let offset = 0; offset < count; offset++) {
    const index = (start + offset) % count,
      name =
        adjectives[Math.floor(index / nouns.length)] +
        "-" +
        nouns[index % nouns.length];
    if (!used.has(name)) return name;
  }
  const base =
    adjectives[Math.floor(start / nouns.length)] +
    "-" +
    nouns[start % nouns.length];
  for (let suffix = 1; ; suffix++)
    if (!used.has(base + "-" + suffix)) return base + "-" + suffix;
}

export function assignSiteTitle(db, transfer) {
  if (!transfer || transfer.parent || transfer.title || !siteEntry(transfer))
    return;
  db.prepare(
    "UPDATE transfers SET title=? WHERE id=? AND (title IS NULL OR title='')",
  ).run(generateSiteTitle(db), transfer.id);
}
