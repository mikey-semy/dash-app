import { PART, ARCHIVE_TRANSFER } from "#common/config.js";

// Keep at most concurrency upload buffers and one partially filled buffer.
// Drain requests before returning so callers can safely abort the multipart.
export async function uploadMultipartStream(
  stream,
  store,
  key,
  upload,
  { partSize = PART, concurrency = ARCHIVE_TRANSFER.concurrency } = {},
) {
  if (
    !Number.isInteger(partSize) ||
    partSize < 1 ||
    !Number.isInteger(concurrency) ||
    concurrency < 1
  )
    throw new RangeError("Invalid multipart stream limits");
  const active = new Set(),
    parts = [];
  let buffer,
    used = 0,
    size = 0,
    failure;
  const check = () => {
    if (failure) throw failure;
  };
  async function send() {
    while (active.size >= concurrency) {
      await Promise.race(active);
      check();
    }
    check();
    const body = buffer.subarray(0, used),
      number = parts.length + 1;
    parts.push(null);
    size += used;
    buffer = undefined;
    used = 0;
    const task = Promise.resolve()
      .then(() =>
        store.send("UploadPart", {
          Key: key,
          UploadId: upload,
          PartNumber: number,
          Body: body,
          ContentLength: body.length,
        }),
      )
      .then((result) => {
        parts[number - 1] = { PartNumber: number, ETag: result.ETag };
      })
      .catch((error) => {
        failure ||= error;
        stream.destroy(error);
      })
      .finally(() => active.delete(task));
    active.add(task);
  }
  try {
    for await (const chunk of stream) {
      check();
      let offset = 0;
      while (offset < chunk.length) {
        check();
        buffer ||= Buffer.allocUnsafe(partSize);
        const count = Math.min(partSize - used, chunk.length - offset);
        chunk.copy(buffer, used, offset, offset + count);
        used += count;
        offset += count;
        if (used === partSize) await send();
      }
    }
    check();
    if (used) await send();
    await Promise.all(active);
    check();
    return { parts, size };
  } catch (error) {
    stream.destroy();
    await Promise.all(active);
    throw failure || error;
  }
}
