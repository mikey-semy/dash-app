import { copy } from "#common/copy.js";
import { UPLOAD_TRANSFER } from "#common/config.js";

export function createUploadTransport({
  api,
  control,
  onProgress,
  concurrency = UPLOAD_TRANSFER.concurrency,
  createXHR = () => new XMLHttpRequest(),
  setTimer = (callback, delay) => setTimeout(callback, delay),
  clearTimer = (timer) => clearTimeout(timer),
  sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay)),
}) {
  function abort() {
    control.current.abortController?.abort();
    for (const xhr of [...(control.current.requests || [])]) xhr.abort();
  }
  async function sendParts(u, { onFirstSend = () => {} } = {}) {
    const state = control.current;
    state.requests = new Set();
    state.abortController = new AbortController();
    const request = (path, body) =>
      api(path, body, "POST", { signal: state.abortController.signal });
    let done = 0,
      reported = 0,
      failure,
      started = false;
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
      state.abortController.abort();
      for (const xhr of [...state.requests]) xhr.abort();
    }
    function put(url, blob, partKey) {
      return new Promise((resolve, reject) => {
        check();
        const xhr = createXHR();
        let settled = false,
          timer,
          loaded = 0;
        const finish = (error) => {
          if (settled) return;
          settled = true;
          clearTimer(timer);
          state.requests.delete(xhr);
          inFlight.delete(partKey);
          xhr.upload.onprogress = null;
          xhr.onload = xhr.onerror = xhr.onabort = xhr.ontimeout = null;
          if (error) reject(error);
          else resolve();
        };
        const watch = () => {
          clearTimer(timer);
          timer = setTimer(() => {
            finish(new Error(copy.partUploadTimedOut));
            xhr.abort();
          }, UPLOAD_TRANSFER.idleTimeout);
        };
        state.requests.add(xhr);
        xhr.ontimeout = () => finish(new Error(copy.partUploadTimedOut));
        xhr.upload.onprogress = (event) => {
          if (settled || stopped()) return;
          if (event.loaded > loaded) {
            loaded = event.loaded;
            watch();
          }
          inFlight.set(partKey, Math.min(blob.size, event.loaded));
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
          xhr.timeout = 0;
          watch();
          xhr.send(blob);
          if (!started) {
            started = true;
            onFirstSend();
          }
        } catch (error) {
          finish(error);
        }
      });
    }
    const waiting = [];
    let available = concurrency;
    async function withSlot(task) {
      if (available) available--;
      else await new Promise((resolve) => waiting.push(resolve));
      try {
        check();
        return await task();
      } finally {
        if (waiting.length) waiting.shift()();
        else available++;
      }
    }
    const limitedRequest = (path) => withSlot(() => request(path, {}));
    const fail = (error) => {
      failure ||= error;
      stopRequests();
    };
    async function sendFile(i) {
      check();
      const file = u.files[i];
      const path = `/api/transfers/${u.id}/files/${i + (u.offset || 0)}`;
      const init = await limitedRequest(path + "/init");
      check();
      if (init.done) {
        done += file.size;
        report();
        return;
      }
      const saved = new Map(
        init.parts.map((part) => [part.PartNumber, part.Size]),
      );
      const pending = [];
      for (let part = 1; part <= Math.ceil(file.size / init.partSize); part++) {
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
                await withSlot(async () => {
                  const { url } = await request(path + "/parts/" + part, {});
                  check();
                  await put(url, blob, path + "/" + part);
                });
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
          fail(error);
        }
      }
      await Promise.allSettled(
        Array.from({ length: Math.min(concurrency, pending.length) }, worker),
      );
      check();
      await limitedRequest(path + "/complete");
    }
    let nextFile = 0;
    async function sendFiles() {
      try {
        while (nextFile < u.files.length) {
          check();
          await sendFile(nextFile++);
        }
      } catch (error) {
        fail(error);
      }
    }
    try {
      await Promise.all(
        Array.from(
          { length: Math.min(concurrency, u.files.length) },
          sendFiles,
        ),
      );
      check();
    } finally {
      stopRequests();
      inFlight.clear();
    }
  }
  return { sendParts, abort };
}
