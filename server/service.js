import { copy } from "#common/copy.js";
import { ZipArchive } from "archiver";
import { Parse } from "unzipper";
import { Readable, PassThrough } from "node:stream";
import {
  PART,
  row,
  insertTransfer,
  archiveName,
  revision,
  safeNames,
} from "./core.js";
import { textCandidate, TEXT_LIMIT } from "./text.js";
import { assignSiteTitle } from "./site-names.js";
export class Service {
  constructor(db, store) {
    this.db = db;
    this.store = store;
    this.queue = Promise.resolve();
  }
  locked(fn) {
    const result = this.queue.then(fn);
    this.queue = result.catch(() => {});
    return result;
  }
  get(id) {
    return row(this.db, id);
  }
  saveFiles(t) {
    this.db
      .prepare("UPDATE transfers SET files=?,error=NULL WHERE id=?")
      .run(JSON.stringify(t.files), t.id);
  }
  create(files, ttl, password) {
    const id = insertTransfer(this.db, files, ttl, password);
    assignSiteTitle(this.db, this.get(id));
    return id;
  }
  append(id, files) {
    const parent = this.get(id);
    if (
      !parent ||
      !["ready", "empty"].includes(parent.state) ||
      (parent.expires !== null && parent.expires <= Date.now())
    )
      throw Object.assign(new Error(copy.transferUnavailableForAppending), {
        status: 409,
      });
    const pending = this.db
      .prepare(
        "SELECT id,state FROM transfers WHERE parent=? AND state NOT IN ('deleted','merged') LIMIT 1",
      )
      .get(id);
    if (pending) {
      if (pending.state === "failed") {
        this.delete(pending.id);
        throw Object.assign(new Error(copy.appendCleanupPending), {
          status: 409,
        });
      }
      throw Object.assign(new Error(copy.appendAlreadyInProgress), {
        status: 409,
      });
    }
    if (!Array.isArray(files) || !files.length)
      throw Object.assign(new Error(copy.selectFiles), { status: 400 });
    const next = insertTransfer(
      this.db,
      [
        ...parent.files.map(({ name, size, directory }) => ({
          name,
          size,
          directory,
        })),
        ...files,
      ],
      parent.ttl,
      "",
      parent,
    );
    return { id: next, offset: parent.files.length };
  }
  replaceText(id, file, expectedRevision) {
    const parent = this.get(id);
    if (
      !parent ||
      parent.state !== "ready" ||
      !textCandidate(parent) ||
      (parent.expires !== null && parent.expires <= Date.now())
    )
      throw Object.assign(new Error(copy.editingUnavailable), {
        status: 409,
      });
    if (expectedRevision !== revision(parent))
      throw Object.assign(new Error(copy.transferChangedReopenTheEditor), {
        status: 409,
      });
    if (
      !file ||
      !Number.isSafeInteger(file.size) ||
      file.size < 0 ||
      file.size > TEXT_LIMIT
    )
      throw Object.assign(new Error(copy.textIsLimitedTo5Mib), { status: 400 });
    const pending = this.db
      .prepare(
        "SELECT id,state FROM transfers WHERE parent=? AND state NOT IN ('deleted','merged')",
      )
      .get(id);
    if (pending) {
      if (pending.state === "failed") this.delete(pending.id);
      throw Object.assign(new Error(copy.waitForTheTransferUpdateToFinish), {
        status: 409,
      });
    }
    const next = insertTransfer(
      this.db,
      [{ name: parent.files[0].name, size: file.size }],
      parent.ttl,
      "",
      { ...parent, reuseFiles: [], baseFiles: parent.files },
    );
    return { id: next, offset: 0 };
  }
  rename(id, names, expectedRevision) {
    const parent = this.get(id);
    if (
      !parent ||
      parent.parent ||
      parent.state !== "ready" ||
      (parent.expires !== null && parent.expires <= Date.now())
    )
      throw Object.assign(new Error(copy.transferUnavailable), { status: 404 });
    if (expectedRevision !== revision(parent))
      throw Object.assign(new Error(copy.transferChangedReopenSettings), {
        status: 409,
      });
    if (
      !Array.isArray(names) ||
      names.length !== parent.files.length ||
      names.some(
        (name) => typeof name !== "string" || !name.trim() || name.length > 256,
      )
    )
      throw Object.assign(new Error(copy.invalidFilenames), { status: 400 });
    if (
      this.db
        .prepare(
          "SELECT 1 FROM transfers WHERE parent=? AND state NOT IN ('deleted','merged','deleting')",
        )
        .get(id)
    )
      throw Object.assign(new Error(copy.waitForTheTransferUpdateToFinish), {
        status: 409,
      });
    const next = safeNames(
      parent.files.map((file, i) => ({ ...file, name: names[i] })),
    );
    if (next.every((file, i) => file.name === parent.files[i].name)) return;
    if (next.length === 1) {
      this.db
        .prepare("UPDATE transfers SET files=?,output=? WHERE id=?")
        .run(
          JSON.stringify(next),
          JSON.stringify({ ...parent.output, name: next[0].name }),
          id,
        );
      return;
    }
    const child = insertTransfer(this.db, next, parent.ttl, "", {
      ...parent,
      reuseFiles: next,
      baseFiles: parent.files,
    });
    this.db
      .prepare("UPDATE transfers SET state='queued' WHERE id=?")
      .run(child);
    return child;
  }
  removeFiles(id, indices, expectedRevision) {
    const parent = this.get(id);
    if (
      !parent ||
      !["ready", "empty"].includes(parent.state) ||
      (parent.expires !== null && parent.expires <= Date.now())
    )
      throw Object.assign(new Error(copy.transferUnavailable), { status: 409 });
    if (expectedRevision !== undefined && expectedRevision !== revision(parent))
      throw Object.assign(new Error(copy.fileSelectionStale), { status: 409 });
    if (
      !Array.isArray(indices) ||
      !indices.length ||
      indices.some(
        (i) => !Number.isInteger(i) || i < 0 || i >= parent.files.length,
      ) ||
      new Set(indices).size !== indices.length
    )
      throw Object.assign(new Error(copy.invalidFileSelection), {
        status: 400,
      });
    if (
      this.db
        .prepare(
          "SELECT 1 FROM transfers WHERE parent=? AND state NOT IN ('deleted','merged','deleting')",
        )
        .get(id)
    )
      throw Object.assign(new Error(copy.waitForTheTransferUpdateToFinish), {
        status: 409,
      });
    const kept = parent.files.filter((f, i) => !indices.includes(i));
    if (!kept.length) {
      const output = {
        key: null,
        size: 0,
        name: null,
        etag: null,
        garbage: [
          ...new Set(
            [
              parent.output?.key,
              ...(parent.output?.garbage || []),
              ...parent.files.map((f) => f.key),
            ].filter(Boolean),
          ),
        ],
      };
      this.db
        .prepare(
          "UPDATE transfers SET state='empty',files='[]',output=?,error=NULL WHERE id=?",
        )
        .run(JSON.stringify(output), id);
      return { empty: true };
    }
    const child = insertTransfer(
      this.db,
      kept.map(({ name, size, directory }) => ({ name, size, directory })),
      parent.ttl,
      "",
      { ...parent, reuseFiles: kept, baseFiles: parent.files },
    );
    this.db
      .prepare("UPDATE transfers SET state='queued' WHERE id=?")
      .run(child);
    return { id: child };
  }
  async *sources(t, marker) {
    if (t.base?.files.length) {
      const source = await this.store.get(t.base.output.key);
      const stop = () => source.Body.destroy(new Error("Cancelled"));
      marker.once("close", stop);
      try {
        if (marker.destroyed) throw new Error("Cancelled");
        if (t.base.files.length === 1 && !t.base.files[0].directory) {
          const file = t.files.find(
            (f) => f.reused && f.key === t.base.files[0].key,
          );
          if (file) yield { body: source.Body, file };
        } else {
          const parser = source.Body.pipe(Parse({ forceStream: true }));
          source.Body.once("error", (e) => parser.destroy(e));
          try {
            let index = 0;
            for await (const entry of parser) {
              const original = t.base.files[index++];
              if (
                !original ||
                entry.type !== (original.directory ? "Directory" : "File") ||
                entry.path !== original.name
              ) {
                entry.autodrain();
                throw new Error("Stored ZIP composition mismatch");
              }
              const file = t.files.find(
                (f) => f.reused && f.key === original.key,
              );
              if (file) yield { body: entry, file };
              else await entry.autodrain().promise();
            }
            if (index !== t.base.files.length)
              throw new Error("Stored ZIP incomplete");
          } finally {
            parser.destroy();
          }
        }
      } finally {
        marker.off("close", stop);
        source.Body.destroy();
      }
    }
    for (const file of t.files.filter((f) => !f.reused)) {
      if (marker.destroyed) throw new Error("Cancelled");
      const object = await this.store.get(file.key);
      try {
        yield { body: object.Body, file };
      } finally {
        object.Body.destroy();
      }
    }
  }
  async single(t) {
    const marker = new PassThrough();
    marker.on("error", () => {});
    this.activeZip = marker;
    const file = t.files[0];
    if (!file.reused) {
      const h = await this.store.head(file.key);
      if (h.ContentLength !== file.size) throw new Error("Size mismatch");
      await this.ready(t, {
        key: file.key,
        name: file.name,
        size: file.size,
        etag: h.ETag,
      });
      return;
    }
    const key = t.id + "/content";
    await this.store.purge(t.id, [key]);
    let upload;
    try {
      if (file.size) upload = await this.store.create(key);
      let buffer = Buffer.alloc(0),
        parts = [],
        size = 0;
      for await (const { body } of this.sources(t, marker)) {
        const stop = () => body.destroy(new Error("Cancelled"));
        marker.once("close", stop);
        try {
          for await (const chunk of body) {
            if (marker.destroyed) throw new Error("Cancelled");
            size += chunk.length;
            if (size > file.size) throw new Error("Size exceeded");
            buffer = Buffer.concat([buffer, chunk]);
            while (buffer.length >= PART) {
              const data = buffer.subarray(0, PART),
                r = await this.store.send("UploadPart", {
                  Key: key,
                  UploadId: upload,
                  PartNumber: parts.length + 1,
                  Body: data,
                  ContentLength: data.length,
                });
              parts.push({ PartNumber: parts.length + 1, ETag: r.ETag });
              buffer = buffer.subarray(PART);
            }
          }
        } finally {
          marker.off("close", stop);
        }
        break;
      }
      if (size !== file.size || marker.destroyed)
        throw new Error("Incomplete content");
      if (!size) await this.store.empty(key);
      else {
        if (buffer.length) {
          const r = await this.store.send("UploadPart", {
            Key: key,
            UploadId: upload,
            PartNumber: parts.length + 1,
            Body: buffer,
            ContentLength: buffer.length,
          });
          parts.push({ PartNumber: parts.length + 1, ETag: r.ETag });
        }
        await this.store.complete(key, upload, parts);
      }
      const h = await this.store.head(key);
      if (h.ContentLength !== file.size) throw new Error("Size mismatch");
      await this.ready(t, {
        key,
        name: file.name,
        size: file.size,
        etag: h.ETag,
      });
    } catch (e) {
      if (upload) await this.store.abort(key, upload);
      throw e;
    }
  }
  async init(id, index) {
    const t = this.get(id);
    this.uploadable(t);
    const f = t.files[index];
    if (!f) throw Object.assign(new Error(copy.fileNotFound), { status: 404 });
    if (!f.upload && !f.done) {
      if (!f.size) {
        await this.store.empty(f.key);
        f.done = true;
      } else f.upload = await this.store.create(f.key);
      this.saveFiles(t);
    }
    return {
      partSize: PART,
      done: f.done,
      parts: f.done ? [] : await this.store.parts(f.key, f.upload),
    };
  }
  uploadable(t) {
    if (t?.parent) {
      const parent = this.get(t.parent);
      if (
        !parent ||
        !["ready", "empty"].includes(parent.state) ||
        (parent.expires !== null && parent.expires <= Date.now())
      )
        throw Object.assign(new Error(copy.originalTransferUnavailable), {
          status: 409,
        });
    }
    if (!t || t.state !== "uploading" || Date.now() - t.created >= 86400000)
      throw Object.assign(new Error(copy.uploadUnavailable), { status: 409 });
  }
  async sign(id, index, part) {
    const t = this.get(id);
    this.uploadable(t);
    const f = t.files[index];
    if (
      !f?.upload ||
      !Number.isInteger(part) ||
      part < 1 ||
      part > Math.ceil(f.size / PART)
    )
      throw Object.assign(new Error(copy.invalidPart), { status: 400 });
    return {
      url: await this.store.sign(
        f.key,
        f.upload,
        part,
        Math.min(PART, f.size - (part - 1) * PART),
      ),
    };
  }
  async finishFile(id, index) {
    const t = this.get(id);
    this.uploadable(t);
    const f = t.files[index];
    if (!f) throw Object.assign(new Error(copy.fileNotFound), { status: 404 });
    if (f.done) return;
    let head;
    try {
      head = await this.store.head(f.key);
    } catch (e) {
      if (e.name !== "NotFound" && e.$metadata?.httpStatusCode !== 404) throw e;
    }
    if (!head) {
      if (!f.upload)
        throw Object.assign(new Error(copy.initializeTheUploadFirst), {
          status: 409,
        });
      const parts = await this.store.parts(f.key, f.upload);
      const count = Math.ceil(f.size / PART);
      if (
        parts.length !== count ||
        parts.some(
          (p, i) =>
            p.PartNumber !== i + 1 ||
            p.Size !== Math.min(PART, f.size - i * PART),
        )
      )
        throw Object.assign(new Error(copy.missingPartsOrIncorrectUploadSize), {
          status: 409,
        });
      await this.store.complete(f.key, f.upload, parts);
      head = await this.store.head(f.key);
    }
    if (head.ContentLength !== f.size)
      throw Object.assign(new Error(copy.actualSizeDoesNotMatch), {
        status: 409,
      });
    f.done = true;
    this.saveFiles(t);
  }
  async finish(id) {
    const t = this.get(id);
    if (t && ["queued", "archiving", "ready"].includes(t.state)) return;
    this.uploadable(t);
    if (t.files.some((f) => !f.done))
      throw Object.assign(new Error(copy.someFilesAreNotReady), {
        status: 409,
      });
    if (t.parent) {
      this.db
        .prepare("UPDATE transfers SET state='queued' WHERE id=?")
        .run(t.id);
      return;
    }
    if (t.files.length === 1 && !t.files[0].directory) {
      const f = t.files[0],
        h = await this.store.head(f.key);
      if (h.ContentLength !== f.size) throw new Error(copy.sizeChanged);
      await this.ready(t, {
        key: f.key,
        name: f.name,
        size: f.size,
        etag: h.ETag,
      });
    } else
      this.db.prepare("UPDATE transfers SET state='queued' WHERE id=?").run(id);
  }
  async ready(t, out) {
    if (t.parent)
      return this.locked(() => {
        const parent = this.get(t.parent),
          child = this.get(t.id);
        if (
          !parent ||
          !["ready", "empty"].includes(parent.state) ||
          child.state !== "archiving" ||
          (parent.expires !== null && parent.expires <= Date.now()) ||
          (parent.output?.key || null) !== (t.base.output?.key || null)
        )
          throw new Error("Append cancelled or superseded");
        const output = {
          ...out,
          name:
            t.files.length === 1 && !t.files[0].directory
              ? out.name
              : archiveName(parent.created),
          garbage: [
            ...new Set(
              [
                parent.output?.key,
                ...(parent.output?.garbage || []),
                ...parent.files.map((f) => f.key),
              ].filter(Boolean),
            ),
          ],
        };
        const reserved =
          parent.reserved +
          out.size +
          t.files
            .filter((f) => !f.reused && f.key !== out.key)
            .reduce((n, f) => n + f.size, 0);
        this.db.exec("BEGIN IMMEDIATE");
        try {
          this.db
            .prepare(
              "UPDATE transfers SET state='ready',files=?,output=?,reserved=?,error=NULL WHERE id=?",
            )
            .run(
              JSON.stringify(
                t.files.length === 1 && !t.files[0].directory
                  ? t.files.map((f) => ({ ...f, key: out.key }))
                  : t.files,
              ),
              JSON.stringify(output),
              reserved,
              parent.id,
            );
          this.db
            .prepare(
              "UPDATE transfers SET state='merged',reserved=0,output=?,error=NULL WHERE id=?",
            )
            .run(JSON.stringify(out), t.id);
          assignSiteTitle(this.db, this.get(parent.id));
          this.db.exec("COMMIT");
        } catch (e) {
          this.db.exec("ROLLBACK");
          throw e;
        }
      });
    const now = Date.now();
    this.db
      .prepare(
        "UPDATE transfers SET state='ready',ready=?,expires=?,output=?,error=NULL WHERE id=? AND state IN ('uploading','archiving')",
      )
      .run(
        now,
        t.ttl === 0 ? null : now + t.ttl * 1000,
        JSON.stringify(out),
        t.id,
      );
  }
  async zip(t) {
    const key = t.id + "/bundle.zip";
    await this.store.purge(t.id, [key]); // sources have no live multipart once queued
    const upload = await this.store.create(key);
    const zip = new ZipArchive({ store: true, forceZip64: true });
    this.activeZip = zip;
    if (this.get(t.id).state !== "archiving") {
      await this.store.abort(key, upload);
      throw new Error("Cancelled");
    }
    let archiveError;
    zip.on("error", (e) => {
      archiveError = e;
      zip.destroy(e);
    });
    const consume = (async () => {
      let buffer = Buffer.alloc(0),
        parts = [],
        size = 0;
      for await (const chunk of zip) {
        buffer = Buffer.concat([buffer, chunk]);
        while (buffer.length >= PART) {
          const data = buffer.subarray(0, PART);
          const r = await this.store.send("UploadPart", {
            Key: key,
            UploadId: upload,
            PartNumber: parts.length + 1,
            Body: data,
            ContentLength: data.length,
          });
          parts.push({ PartNumber: parts.length + 1, ETag: r.ETag });
          size += data.length;
          buffer = buffer.subarray(PART);
        }
      }
      if (buffer.length) {
        const r = await this.store.send("UploadPart", {
          Key: key,
          UploadId: upload,
          PartNumber: parts.length + 1,
          Body: buffer,
          ContentLength: buffer.length,
        });
        parts.push({ PartNumber: parts.length + 1, ETag: r.ETag });
        size += buffer.length;
      }
      if (archiveError) throw archiveError;
      await this.store.complete(key, upload, parts);
      return size;
    })();
    consume.catch(() => zip.destroy());
    try {
      const appendStream = async (body, file) => {
        if (zip.destroyed) {
          body.destroy();
          throw new Error("Cancelled");
        }
        let count = 0;
        const checked = Readable.from(
          (async function* () {
            for await (const chunk of body) {
              count += chunk.length;
              if (count > file.size) throw new Error("Source size exceeded");
              yield chunk;
            }
            if (count !== file.size) throw new Error("Source size mismatch");
          })(),
        );
        await new Promise((resolve, reject) => {
          const fail = (e) => {
            body.destroy();
            checked.destroy();
            reject(e || new Error("ZIP closed"));
          };
          zip.once("error", fail);
          zip.once("close", fail);
          checked.once("error", reject);
          checked.once("end", () => {
            zip.off("error", fail);
            zip.off("close", fail);
            resolve();
          });
          zip.append(checked, {
            name: file.name,
            ...(file.directory ? { type: "directory" } : {}),
            date: new Date(t.base?.created || t.created),
          });
        });
      };
      for await (const { body, file } of this.sources(t, zip))
        await appendStream(body, file);
      await zip.finalize();
      const size = await consume;
      if (
        size >
        t.reserved -
          t.files.filter((f) => !f.reused).reduce((n, f) => n + f.size, 0)
      )
        throw new Error(copy.archiveExceededItsReservation);
      const h = await this.store.head(key);
      if (h.ContentLength !== size)
        throw new Error(copy.archiveHasNotBeenVerified);
      await this.ready(t, {
        key,
        name: archiveName(t.created),
        size,
        etag: h.ETag,
      });
    } catch (e) {
      zip.destroy();
      await consume.catch(() => {});
      await this.store.abort(key, upload);
      throw e;
    }
  }
  async tick() {
    const job = await this.locked(async () => {
      const now = Date.now();
      this.db
        .prepare(
          "UPDATE transfers SET state='deleting' WHERE (state IN ('ready','empty') AND expires<=?) OR (state='uploading' AND created<=?)",
        )
        .run(now, now - 86400000);
      this.db
        .prepare(
          "UPDATE transfers SET state='deleting' WHERE parent IN (SELECT id FROM transfers WHERE state IN ('deleting','deleted')) AND state!='deleted'",
        )
        .run();
      if (this.archiving) {
        const active = this.get(this.archiving);
        if (
          active?.parent &&
          !["ready", "empty"].includes(this.get(active.parent)?.state)
        )
          this.activeZip?.destroy(new Error("Parent unavailable"));
      }
      this.db.prepare("DELETE FROM sessions WHERE expires<=?").run(now);
      if (!this.archiving)
        this.db
          .prepare(
            "UPDATE transfers SET state='failed',error=? WHERE state='archiving' AND attempts>=3",
          )
          .run(copy.zipCreationRetriesExhausted);
      for (const r of this.db
        .prepare(
          "SELECT id FROM transfers WHERE state='deleting' OR (state IN ('ready','empty') AND (reserved>0 OR output LIKE '%garbage%'))",
        )
        .all()) {
        if (r.id === this.archiving) continue;
        const t = this.get(r.id);
        try {
          if (t.state === "deleting") {
            await this.store.purge(
              t.id,
              [
                ...t.files
                  .filter((f) => !t.parent || !f.reused)
                  .map((f) => f.key),
                t.id + "/bundle.zip",
                t.id + "/content",
                ...(t.output
                  ? [t.output.key, ...(t.output.garbage || [])]
                  : []),
              ].filter(Boolean),
            );
            this.db
              .prepare(
                "UPDATE transfers SET state='deleted',reserved=0,error=NULL,password=NULL WHERE id=?",
              )
              .run(t.id);
          } else if (
            t.output &&
            (t.reserved !== t.output.size || (t.output.garbage || []).length)
          ) {
            const keys = [
              ...new Set([
                ...t.files.map((f) => f.key),
                ...(t.output.garbage || []),
              ]),
            ].filter((k) => k && k !== t.output.key);
            for (const key of keys) await this.store.remove(key);
            const cleaned = { ...t.output };
            delete cleaned.garbage;
            this.db
              .prepare(
                "UPDATE transfers SET reserved=?,output=?,error=NULL WHERE id=?",
              )
              .run(t.output.size, JSON.stringify(cleaned), t.id);
          }
        } catch {
          this.db
            .prepare("UPDATE transfers SET error=? WHERE id=?")
            .run(copy.s3CleanupFailedRetryingInAMinute, t.id);
        }
      }
      if (this.archiving) return null;
      const r = this.db
        .prepare(
          "SELECT id FROM transfers WHERE state IN ('queued','archiving') AND attempts<3 ORDER BY created LIMIT 1",
        )
        .get();
      if (!r) return null;
      const t = this.get(r.id);
      this.db
        .prepare(
          "UPDATE transfers SET state='archiving',attempts=attempts+1 WHERE id=?",
        )
        .run(t.id);
      this.archiving = t.id;
      return t;
    });
    if (!job) return;
    try {
      if (job.parent && job.files.length === 1 && !job.files[0].directory)
        await this.single(job);
      else await this.zip(job);
    } catch {
      this.db
        .prepare(
          "UPDATE transfers SET state=CASE WHEN attempts>=3 THEN 'failed' ELSE 'queued' END,error=? WHERE id=? AND state='archiving'",
        )
        .run(copy.couldNotCreateZip, job.id);
    } finally {
      this.archiving = null;
      this.activeZip = null;
    }
  }
  delete(id) {
    this.db
      .prepare(
        "UPDATE transfers SET state='deleting' WHERE id=? AND state!='deleted'",
      )
      .run(id);
    this.db
      .prepare(
        "UPDATE transfers SET state='deleting' WHERE parent=? AND state!='deleted'",
      )
      .run(id);
    if (
      this.archiving === id ||
      (this.archiving && this.get(this.archiving)?.parent === id)
    )
      this.activeZip?.destroy(new Error("Cancelled"));
  }
}
