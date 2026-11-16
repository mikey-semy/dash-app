import { copy } from "../../../../shared/copy.js";

export function createUploadTransport({
  api,
  control,
  onProgress,
  createXHR = () => new XMLHttpRequest(),
  sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay)),
}) {
  function put(url, blob, offset) {
    return new Promise((resolve, reject) => {
      const xhr = createXHR();
      control.current.xhr = xhr;
      xhr.open("PUT", url);
      xhr.timeout = 120000;
      xhr.ontimeout = () => reject(new Error(copy.partUploadTimedOut));
      xhr.upload.onprogress = (e) => onProgress(offset + e.loaded);
      xhr.onload = () =>
        xhr.status >= 200 && xhr.status < 300
          ? resolve()
          : reject(new Error(copy.s3CouldNotUploadThePart));
      xhr.onerror = () => reject(new Error(copy.s3ConnectionInterrupted));
      xhr.onabort = () => reject(new Error(copy.pause));
      xhr.send(blob);
    });
  }
  async function sendParts(u) {
    let done = 0;
    for (let i = 0; i < u.files.length; i++) {
      if (control.current.paused || control.current.cancel) break;
      const f = u.files[i],
        path = `/api/transfers/${u.id}/files/${i + (u.offset || 0)}`,
        init = await api(path + "/init", {});
      if (init.done) {
        done += f.size;
        onProgress(done);
        continue;
      }
      const parts = new Map(init.parts.map((p) => [p.PartNumber, p.Size]));
      for (let part = 1; part <= Math.ceil(f.size / init.partSize); part++) {
        if (control.current.paused || control.current.cancel)
          throw new Error(copy.pause);
        const from = (part - 1) * init.partSize,
          blob = f.slice(from, from + init.partSize);
        if (parts.get(part) === blob.size) {
          done += blob.size;
          onProgress(done);
          continue;
        }
        for (let attempt = 0; ; attempt++) {
          try {
            const { url } = await api(path + "/parts/" + part, {});
            if (control.current.paused || control.current.cancel)
              throw new Error(copy.pause);
            await put(url, blob, done);
            done += blob.size;
            break;
          } catch (e) {
            if (
              control.current.paused ||
              control.current.cancel ||
              attempt === 2
            )
              throw e;
            await sleep(500 * 2 ** attempt);
          }
        }
      }
      if (control.current.paused || control.current.cancel) break;
      await api(path + "/complete", {});
    }
  }
  return { sendParts };
}
