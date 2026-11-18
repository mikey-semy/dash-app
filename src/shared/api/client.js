import { copy, formatCopy } from "#common/copy.js";
const unavailable = copy.couldNotConnectToTheServerTryAgain;
export function createApi({
  fetch: send = (...args) => globalThis.fetch(...args),
  sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay)),
} = {}) {
  return async function api(
    path,
    body,
    method = body === undefined ? "GET" : "POST",
    { signal } = {},
  ) {
    for (let attempt = 0; ; attempt++) {
      try {
        if (signal?.aborted)
          throw signal.reason || new DOMException(copy.pause, "AbortError");
        const response = await send(path, {
          ...(signal ? { signal } : {}),
          method,
          headers:
            body === undefined ? {} : { "Content-Type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        const text = await response.text();
        let value;
        try {
          value = JSON.parse(text);
        } catch (cause) {
          throw Object.assign(new Error(unavailable), {
            status: response.status,
            proxy: true,
            cause: new Error(
              formatCopy(copy.invalidJsonResponse, response.status),
            ),
          });
        }
        if (!response.ok)
          throw Object.assign(new Error(value.error || copy.requestFailed), {
            status: response.status,
            http: true,
          });
        return value;
      } catch (error) {
        if (signal?.aborted) throw error;
        const transient =
          !error.status ||
          error.status >= 500 ||
          (error.proxy && [200, 404].includes(error.status));
        // Reads may briefly fail while the container is being replaced. Mutations must never be replayed.
        if (method === "GET" && transient && attempt < 4) {
          await sleep(Math.min(250 * 2 ** attempt, 2000));
          continue;
        }
        console.error(
          "[DU] request",
          method,
          path,
          error.status || "network",
          error.cause || error,
        );
        if (error.http || error.proxy) throw error;
        throw Object.assign(new Error(unavailable), {
          status: error.status,
          cause: error,
        });
      }
    }
  };
}
export default createApi();
