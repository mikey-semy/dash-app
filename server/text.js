import { TextDecoder } from "node:util";
export const TEXT_LIMIT = 5 * 1024 * 1024;
const binary =
  /\.(?:png|jpe?g|gif|webp|avif|ico|pdf|zip|gz|7z|rar|exe|dll|dnl|mp[34]|wav|woff2?|ttf|sqlite|db)$/i;
export function textCandidate(t) {
  return (
    t.files.length === 1 &&
    !!t.output?.key &&
    t.output.size <= TEXT_LIMIT &&
    !binary.test(t.files[0].name)
  );
}
export function validText(buffer) {
  try {
    const text = new TextDecoder("utf-8", {
      fatal: true,
      ignoreBOM: true,
    }).decode(buffer);
    return !/[\x00-\x08\x0b\x0e-\x1f]/.test(text) && !text.startsWith("%PDF-");
  } catch {
    return false;
  }
}
export function textReader(store) {
  const cache = new Map(),
    pending = new Map(),
    waiters = [];
  let bytes = 0,
    active = 0;
  return async function read(t) {
    const key = JSON.stringify([t.output.key, t.output.etag]);
    if (cache.has(key)) {
      const value = cache.get(key);
      cache.delete(key);
      cache.set(key, value);
      return value;
    }
    if (pending.has(key)) return pending.get(key);
    const task = (async () => {
      if (active >= 4) await new Promise((resolve) => waiters.push(resolve));
      else active++;
      try {
        const object = await store.get(t.output.key),
          chunks = [];
        let size = 0;
        try {
          for await (const chunk of object.Body) {
            size += chunk.length;
            if (size > TEXT_LIMIT)
              throw Object.assign(new Error("Текст слишком большой"), {
                status: 415,
              });
            chunks.push(Buffer.from(chunk));
          }
        } finally {
          object.Body.destroy?.();
        }
        if (size !== t.output.size) throw new Error("Object size mismatch");
        const buffer = Buffer.concat(chunks);
        if (!validText(buffer))
          throw Object.assign(new Error("Неподдерживаемый текст"), {
            status: 415,
          });
        while (cache.size && bytes + size > 20 * 1024 * 1024) {
          const oldest = cache.keys().next().value;
          bytes -= cache.get(oldest).length;
          cache.delete(oldest);
        }
        cache.set(key, buffer);
        bytes += size;
        while (cache.size > 32) {
          const oldest = cache.keys().next().value;
          bytes -= cache.get(oldest).length;
          cache.delete(oldest);
        }
        return buffer;
      } finally {
        const next = waiters.shift();
        if (next) next();
        else active--;
      }
    })();
    pending.set(key, task);
    try {
      return await task;
    } finally {
      pending.delete(key);
    }
  };
}
