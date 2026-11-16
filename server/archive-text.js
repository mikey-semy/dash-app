import { Open } from "unzipper";
import { PassThrough, Readable } from "node:stream";
export async function archiveTextObject(store, t, index, range) {
  const streams = new Set();
  let failure;
  const source = {
    size: async () => t.output.size,
    stream(offset, length) {
      const output = new PassThrough();
      streams.add(output);
      const end = length
        ? Math.min(t.output.size - 1, offset + length - 1)
        : t.output.size - 1;
      let body;
      output.on("close", () => {
        streams.delete(output);
        body?.destroy();
      });
      store
        .get(t.output.key, {
          Range: `bytes=${offset}-${end}`,
          IfMatch: t.output.etag,
        })
        .then((object) => {
          body = object.Body;
          if (output.destroyed) {
            body.destroy();
            return;
          }
          body.once("error", (error) => {
            failure = error;
            output.end();
          });
          body.pipe(output);
        })
        .catch((error) => {
          failure = error;
          output.end();
        });
      return output;
    },
  };
  let entry;
  try {
    const directory = await Open.custom(source);
    if (directory.files.length !== t.files.length)
      throw new Error("Archive composition mismatch");
    for (let i = 0; i < directory.files.length; i++) {
      const item = directory.files[i],
        file = t.files[i];
      if (
        item.path !== file.name ||
        item.type !== (file.directory ? "Directory" : "File") ||
        item.uncompressedSize !== file.size
      )
        throw new Error("Archive composition mismatch");
    }
    entry = directory.files[index];
    if (
      entry.compressionMethod !== 0 ||
      entry.compressedSize !== entry.uncompressedSize ||
      entry.flags & 1
    )
      throw Object.assign(new Error("Архив не поддерживается"), {
        status: 415,
      });
  } catch (error) {
    throw failure || error;
  } finally {
    for (const stream of streams) stream.destroy();
  }
  const headerObject = await store.get(t.output.key, {
    Range: `bytes=${entry.offsetToLocalFileHeader}-${entry.offsetToLocalFileHeader + 29}`,
    IfMatch: t.output.etag,
  });
  const chunks = [];
  let size = 0;
  try {
    for await (const chunk of headerObject.Body) {
      size += chunk.length;
      if (size > 30) throw new Error("Invalid local ZIP header");
      chunks.push(chunk);
    }
  } finally {
    headerObject.Body.destroy();
  }
  const header = Buffer.concat(chunks);
  if (
    header.length !== 30 ||
    header.readUInt32LE(0) !== 0x04034b50 ||
    header.readUInt16LE(8) !== 0
  )
    throw new Error("Invalid local ZIP header");
  const offset =
    entry.offsetToLocalFileHeader +
    30 +
    header.readUInt16LE(26) +
    header.readUInt16LE(28);
  if (offset + entry.uncompressedSize > t.output.size)
    throw new Error("Invalid archive offsets");
  return entry.uncompressedSize
    ? store.get(t.output.key, {
        Range: `bytes=${offset + (range?.start || 0)}-${offset + (range?.end ?? entry.uncompressedSize - 1)}`,
        IfMatch: t.output.etag,
      })
    : { Body: Readable.from([]) };
}
