import { ZipArchive } from "archiver";
import { PART, row, insertTransfer } from "./core.js";
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
    return insertTransfer(this.db, files, ttl, password);
  }
  async init(id, index) {
    const t = this.get(id);
    this.uploadable(t);
    const f = t.files[index];
    if (!f) throw Object.assign(new Error("Файл не найден"), { status: 404 });
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
    if (!t || t.state !== "uploading" || Date.now() - t.created >= 86400000)
      throw Object.assign(new Error("Загрузка недоступна"), { status: 409 });
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
      throw Object.assign(new Error("Неверная часть"), { status: 400 });
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
    if (!f) throw Object.assign(new Error("Файл не найден"), { status: 404 });
    if (f.done) return;
    let head;
    try {
      head = await this.store.head(f.key);
    } catch (e) {
      if (e.name !== "NotFound" && e.$metadata?.httpStatusCode !== 404) throw e;
    }
    if (!head) {
      if (!f.upload)
        throw Object.assign(new Error("Сначала начните загрузку"), {
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
        throw Object.assign(
          new Error("Загружены не все части или размер неверен"),
          { status: 409 },
        );
      await this.store.complete(f.key, f.upload, parts);
      head = await this.store.head(f.key);
    }
    if (head.ContentLength !== f.size)
      throw Object.assign(new Error("Фактический размер не совпадает"), {
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
      throw Object.assign(new Error("Не все файлы готовы"), { status: 409 });
    if (t.files.length === 1) {
      const f = t.files[0],
        h = await this.store.head(f.key);
      if (h.ContentLength !== f.size) throw new Error("Размер изменён");
      this.ready(t, { key: f.key, name: f.name, size: f.size, etag: h.ETag });
    } else
      this.db.prepare("UPDATE transfers SET state='queued' WHERE id=?").run(id);
  }
  ready(t, out) {
    const now = Date.now();
    this.db
      .prepare(
        "UPDATE transfers SET state='ready',ready=?,expires=?,output=?,error=NULL WHERE id=? AND state IN ('uploading','archiving')",
      )
      .run(now, now + t.ttl * 1000, JSON.stringify(out), t.id);
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
      for (const f of t.files) {
        if (zip.destroyed) throw new Error("Cancelled");
        const obj = await this.store.get(f.key);
        if (zip.destroyed) {
          obj.Body.destroy();
          throw new Error("Cancelled");
        }
        await new Promise((resolve, reject) => {
          const fail = (e) => {
            obj.Body.destroy();
            reject(e || new Error("ZIP closed"));
          };
          zip.once("error", fail);
          zip.once("close", fail);
          obj.Body.once("error", reject);
          obj.Body.once("end", () => {
            zip.off("error", fail);
            zip.off("close", fail);
            resolve();
          });
          zip.append(obj.Body, { name: f.name, date: new Date(t.created) });
        });
      }
      await zip.finalize();
      const size = await consume;
      if (size > t.reserved - t.files.reduce((n, f) => n + f.size, 0))
        throw new Error("Архив превысил резерв");
      const h = await this.store.head(key);
      if (h.ContentLength !== size) throw new Error("Архив не подтверждён");
      this.ready(t, { key, name: "Файлы.zip", size, etag: h.ETag });
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
          "UPDATE transfers SET state='deleting' WHERE (state='ready' AND expires<=?) OR (state='uploading' AND created<=?)",
        )
        .run(now, now - 86400000);
      this.db.prepare("DELETE FROM sessions WHERE expires<=?").run(now);
      if (!this.archiving)
        this.db
          .prepare(
            "UPDATE transfers SET state='failed',error='Исчерпаны попытки сборки ZIP' WHERE state='archiving' AND attempts>=3",
          )
          .run();
      for (const r of this.db
        .prepare(
          "SELECT id FROM transfers WHERE state='deleting' OR (state='ready' AND reserved>0)",
        )
        .all()) {
        if (r.id === this.archiving) continue;
        const t = this.get(r.id);
        try {
          if (t.state === "deleting") {
            await this.store.purge(t.id, [
              ...t.files.map((f) => f.key),
              t.id + "/bundle.zip",
            ]);
            this.db
              .prepare(
                "UPDATE transfers SET state='deleted',reserved=0,error=NULL,password=NULL WHERE id=?",
              )
              .run(t.id);
          } else if (t.files.length > 1 && t.reserved !== t.output.size) {
            for (const f of t.files) await this.store.remove(f.key);
            this.db
              .prepare("UPDATE transfers SET reserved=?,error=NULL WHERE id=?")
              .run(t.output.size, t.id);
          }
        } catch {
          this.db
            .prepare("UPDATE transfers SET error=? WHERE id=?")
            .run("Ошибка очистки S3; повтор через минуту", t.id);
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
      await this.zip(job);
    } catch {
      this.db
        .prepare(
          "UPDATE transfers SET state=CASE WHEN attempts>=3 THEN 'failed' ELSE 'queued' END,error='Не удалось собрать ZIP' WHERE id=? AND state='archiving'",
        )
        .run(job.id);
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
    if (this.archiving === id) this.activeZip?.destroy(new Error("Cancelled"));
  }
}
