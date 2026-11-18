import { copy } from "#common/copy.js";
import { UPLOAD_TRANSFER } from "#common/config.js";

export function createUploadTransport({
  api,
  control,
  onProgress,
  concurrency = UPLOAD_TRANSFER.concurrency,
  createXHR = () => new XMLHttpRequest(),
  sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay)),
}) {
  function abort() {
    for (const xhr of [...(control.current.requests || [])]) xhr.abort();
  }
  async function sendParts(u) {
    const state = control.current;
    state.requests = new Set();
    let done = 0,
      reported = 0,
      failure;
    const inFlight = new Map();
    const stopped = () =>
      failure || state.paused || state.cancel || control.current !== state;
    const check = () => {
      if (stopped()) throw failure || new Error(copy.pause);
    };
    const report = () => {
      const value = Math.max(
        reported,
        done + [...inFlight.values()].reduce((sum, value) => sum + value, 0),
      );
      if (value > reported) {
        reported = value;
        onProgress(reported);
      }
    };
    function stopRequests() {
      for (const xhr of [...state.requests]) xhr.abort();
    }
    function put(url, blob, part) {
      return new Promise((resolve, reject) => {
        check();
        const xhr = createXHR();
        let settled = false;
        const finish = (error) => {
          if (settled) return;
          settled = true;
          state.requests.delete(xhr);
          inFlight.delete(part);
          xhr.upload.onprogress = null;
          xhr.onload = xhr.onerror = xhr.onabort = xhr.ontimeout = null;
          if (error) reject(error);
          else resolve();
        };
        state.requests.add(xhr);
        xhr.ontimeout = () => finish(new Error(copy.partUploadTimedOut));
        xhr.upload.onprogress = (event) => {
          if (settled || stopped()) return;
          inFlight.set(part, Math.min(blob.size, event.loaded));
          report();
        };
        xhr.onload = () =>
          finish(
            xhr.status >= 200 && xhr.status < 300
              ? null
              : new Error(copy.s3CouldNotUploadThePart),
          );
        xhr.onerror = () => finish(new Error(copy.s3ConnectionInterrupted));
        xhr.onabort = () => finish(new Error(copy.pause));
        try {
          xhr.open("PUT", url);
          xhr.timeout = UPLOAD_TRANSFER.partTimeout;
          xhr.send(blob);
        } catch (error) {
          finish(error);
        }
      });
    }
    try {
      for (let i = 0; i < u.files.length; i++) {
        check();
        const file = u.files[i];
        const path = `/api/transfers/${u.id}/files/${i + (u.offset || 0)}`;
        const init = await api(path + "/init", {});
        check();
        if (init.done) {
          done += file.size;
          report();
          continue;
        }
        const saved = new Map(
          init.parts.map((part) => [part.PartNumber, part.Size]),
        );
        const pending = [];
        for (
          let part = 1;
          part <= Math.ceil(file.size / init.partSize);
          part++
        ) {
          const from = (part - 1) * init.partSize;
          const blob = file.slice(from, from + init.partSize);
          if (saved.get(part) === blob.size) done += blob.size;
          else pending.push({ part, blob });
        }
        if (done) report();
        let next = 0;
        async function worker() {
          try {
            while (next < pending.length) {
              check();
              const { part, blob } = pending[next++];
              for (let attempt = 0; ; attempt++) {
                check();
                try {
                  const { url } = await api(path + "/parts/" + part, {});
                  check();
                  await put(url, blob, part);
                  check();
                  done += blob.size;
                  report();
                  break;
                } catch (error) {
                  if (stopped() || attempt === UPLOAD_TRANSFER.retries)
                    throw error;
                  await sleep(UPLOAD_TRANSFER.retryDelay * 2 ** attempt);
                }
              }
            }
          } catch (error) {
            failure ||= error;
            stopRequests();
            throw error;
          }
        }
        await Promise.allSettled(
          Array.from({ length: Math.min(concurrency, pending.length) }, worker),
        );
        check();
        await api(path + "/complete", {});
      }
    } finally {
      stopRequests();
      inFlight.clear();
    }
  }
  return { sendParts, abort };
}
