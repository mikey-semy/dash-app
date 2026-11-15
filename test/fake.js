import { Readable } from "node:stream";
import { randomUUID } from "node:crypto";
export class FakeStore {
  constructor() {
    this.objects = new Map();
    this.uploads = new Map();
    this.failDelete = false;
    this.failGet = false;
  }
  async create(key) {
    const id = randomUUID();
    this.uploads.set(id, { key, parts: new Map() });
    return id;
  }
  async sign(key, upload, part, size) {
    return `https://s3.test/${key}?part=${part}`;
  }
  async parts(key, upload) {
    const u = this.uploads.get(upload);
    if (!u) throw new Error("Missing upload");
    return [...u.parts.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([PartNumber, data]) => ({
        PartNumber,
        Size: data.length,
        ETag: '"' + PartNumber + '"',
      }));
  }
  async send(command, { Key, UploadId, PartNumber, Body }) {
    if (command !== "UploadPart") throw new Error(command);
    this.uploads.get(UploadId).parts.set(PartNumber, Buffer.from(Body));
    return { ETag: '"' + PartNumber + '"' };
  }
  async complete(key, upload, parts) {
    const u = this.uploads.get(upload);
    this.objects.set(
      key,
      Buffer.concat(parts.map((p) => u.parts.get(p.PartNumber))),
    );
    this.uploads.delete(upload);
  }
  async empty(key) {
    this.objects.set(key, Buffer.alloc(0));
  }
  async head(key) {
    const b = this.objects.get(key);
    if (!b) throw Object.assign(new Error("not found"), { name: "NotFound" });
    return { ContentLength: b.length, ETag: '"stable"' };
  }
  async get(key, { Range } = {}) {
    if (this.failGet) throw new Error("S3 unavailable");
    const b = this.objects.get(key);
    if (!b) throw new Error("missing object");
    const m = Range && /bytes=(\d+)-(\d+)/.exec(Range);
    return { Body: Readable.from([m ? b.subarray(+m[1], +m[2] + 1) : b]) };
  }
  async remove(key) {
    if (this.failDelete) throw new Error("S3 delete unavailable");
    this.objects.delete(key);
  }
  async abort(key, upload) {
    this.uploads.delete(upload);
  }
  async purge(id, keys) {
    for (const [u, v] of this.uploads)
      if (v.key.startsWith(id + "/")) this.uploads.delete(u);
    for (const key of keys) await this.remove(key);
  }
}
