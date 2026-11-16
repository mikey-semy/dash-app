import {
  rememberUpload,
  recoverUpload,
  forgetUpload,
  matchUpload,
} from "./upload-cache.js";
import { PasswordInput } from "./PasswordInput.jsx";
import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { OwnerView } from "./View.jsx";
import { Recipient } from "./Recipient.jsx";
import "./style.css";
document.addEventListener(
  "keydown",
  (event) => {
    if (event.key === "Tab")
      document.documentElement.classList.add("keyboard-navigation");
  },
  true,
);
document.addEventListener(
  "pointerdown",
  () => {
    document.documentElement.classList.remove("keyboard-navigation");
  },
  true,
);
async function api(path, body, method = body === undefined ? "GET" : "POST") {
  let r, v;
  try {
    r = await fetch(path, {
      method,
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    v = await r.json();
  } catch {
    throw Object.assign(
      new Error("Не удалось связаться с сервером. Повторите."),
      { status: r?.status },
    );
  }
  if (!r.ok)
    throw Object.assign(new Error(v.error || "Ошибка запроса"), {
      status: r.status,
    });
  return v;
}
function App() {
  const [logged, setLogged] = useState(false),
    [checking, setChecking] = useState(true),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [history, setHistory] = useState([]),
    [ttl, setTtl] = useState(() => {
      try {
        const stored = localStorage.getItem("du.ttl");
        const value = stored === null ? 86400 : Number(stored);
        return [0, 3600, 21600, 86400, 259200, 604800].includes(value)
          ? value
          : 86400;
      } catch {
        return 86400;
      }
    }),
    [secret, setSecret] = useState(""),
    [upload, setUpload] = useState(null),
    [progress, setProgress] = useState(0),
    [paused, setPaused] = useState(false),
    [running, setRunning] = useState(false),
    [elapsed, setElapsed] = useState(0),
    [drag, setDrag] = useState(false),
    [selected, setSelected] = useState(null),
    [preparingUpload, setPreparingUpload] = useState(false);
  const control = useRef({ paused: false, cancel: false, xhr: null }),
    start = useRef(0),
    active = useRef(false),
    choosing = useRef(false),
    recoveryChecked = useRef(false);
  useEffect(() => {
    document.title = logged ? "Загрузка" : "Вход";
  }, [logged]);
  useEffect(() => {
    try {
      localStorage.setItem("du.ttl", String(ttl));
    } catch {}
  }, [ttl]);
  const reload = () =>
    api("/api/transfers")
      .then(setHistory)
      .catch((e) => {
        if (e.status === 401) setLogged(false);
      });
  useEffect(() => {
    api("/api/session")
      .then(() => setLogged(true))
      .catch(() => {})
      .finally(() => setChecking(false));
  }, []);
  useEffect(() => {
    if (!logged) return;
    reload();
    const timer = setInterval(reload, 3000);
    return () => clearInterval(timer);
  }, [logged]);
  useEffect(() => {
    if (!logged || recoveryChecked.current) return;
    recoveryChecked.current = true;
    choosing.current = true;
    setPreparingUpload(true);
    recoverUpload()
      .then(async (value) => {
        if (!value) return;
        try {
          const state = await api("/api/uploads/" + value.id);
          if (
            state.files.length !== value.files.length ||
            state.files.some((file, i) => file.size !== value.files[i].size)
          )
            throw Object.assign(new Error("Состав загрузки изменился"), {
              status: 409,
            });
          setUpload(value);
          setSelected(value.parentId || value.id);
          setPaused(true);
          control.current = { paused: true, cancel: false, xhr: null };
          start.current = Date.now();
        } catch (error) {
          if ([404, 409].includes(error.status)) {
            await forgetUpload(value.id);
            return;
          }
          if ([401, 403].includes(error.status)) {
            recoveryChecked.current = false;
            setLogged(false);
            return;
          }
          setUpload(value);
          setSelected(value.parentId || value.id);
          setPaused(true);
          control.current = { paused: true, cancel: false, xhr: null };
          start.current = Date.now();
          setError(
            "Не удалось проверить загрузку. Можно повторить продолжение.",
          );
        }
      })
      .finally(() => {
        choosing.current = false;
        setPreparingUpload(false);
      });
  }, [logged]);
  useEffect(() => {
    if (
      upload &&
      !running &&
      history.some(
        (t) =>
          t.id === (upload.parentId || upload.id) &&
          (upload.parentId
            ? ["queued", "archiving"].includes(t.appendState) ||
              (!t.appendState && t.revision !== upload.baseRevision)
            : ["queued", "archiving", "ready"].includes(t.state)),
      )
    ) {
      forgetUpload(upload.id);
      setUpload(null);
      setError("");
    }
  }, [history, upload, running]);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(
      () => setElapsed((Date.now() - start.current) / 1000),
      500,
    );
    return () => clearInterval(timer);
  }, [running]);
  useEffect(() => {
    const fn = (e) => {
      if (active.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", fn);
    return () => window.removeEventListener("beforeunload", fn);
  }, []);
  async function choose(list, parentId = null, replacement = null) {
    if (active.current || choosing.current) return false;
    if (upload?.missing) {
      try {
        const restored = await matchUpload(upload, Array.from(list));
        setUpload(restored);
        await rememberUpload(restored);
        run(restored);
        return true;
      } catch (error) {
        setError(error.message);
        return false;
      }
    }
    if (upload) return false;
    const files = Array.from(list);
    if (!files.length) return false;
    if (files.length > 100 || files.reduce((n, f) => n + f.size, 0) > 2e9) {
      setError("Максимум 100 файлов и 2 ГБ суммарно");
      return false;
    }
    setError("");
    choosing.current = true;
    setPreparingUpload(true);
    try {
      const { id, offset = 0 } = await api(
        parentId
          ? "/api/transfers/" +
              parentId +
              (replacement === null ? "/append" : "/replace")
          : "/api/transfers",
        {
          files: files.map((f) => ({ name: f.name, size: f.size })),
          ttl,
          password: secret,
          ...(replacement === null ? {} : { revision: replacement }),
        },
      );
      const u = {
        id,
        parentId,
        created: Date.now(),
        baseRevision: parentId
          ? history.find((t) => t.id === parentId)?.revision
          : null,
        offset,
        files,
        total: files.reduce((n, f) => n + f.size, 0),
      };
      await rememberUpload(u).catch(() => false);
      setUpload(u);
      setSelected(parentId || id);
      setProgress(0);
      setElapsed(0);
      control.current = { paused: false, cancel: false, xhr: null };
      start.current = Date.now();
      run(u);
      return true;
    } catch (e) {
      setError(e.message);
      if (replacement !== null) {
        await reload();
        throw e;
      }
      return false;
    } finally {
      choosing.current = false;
      setPreparingUpload(false);
    }
  }
  function put(url, blob, offset) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      control.current.xhr = xhr;
      xhr.open("PUT", url);
      xhr.timeout = 120000;
      xhr.ontimeout = () => reject(new Error("Превышено время загрузки части"));
      xhr.upload.onprogress = (e) => setProgress(offset + e.loaded);
      xhr.onload = () =>
        xhr.status >= 200 && xhr.status < 300
          ? resolve()
          : reject(new Error("S3: не удалось загрузить часть"));
      xhr.onerror = () => reject(new Error("Соединение с S3 прервано"));
      xhr.onabort = () => reject(new Error("Пауза"));
      xhr.send(blob);
    });
  }
  async function run(u) {
    if (active.current) return;
    active.current = true;
    setRunning(true);
    setPaused(false);
    control.current.paused = false;
    let done = 0;
    try {
      for (let i = 0; i < u.files.length; i++) {
        if (control.current.paused || control.current.cancel) break;
        const f = u.files[i],
          path = `/api/transfers/${u.id}/files/${i + (u.offset || 0)}`,
          init = await api(path + "/init", {});
        if (init.done) {
          done += f.size;
          setProgress(done);
          continue;
        }
        const parts = new Map(init.parts.map((p) => [p.PartNumber, p.Size]));
        for (let part = 1; part <= Math.ceil(f.size / init.partSize); part++) {
          if (control.current.paused || control.current.cancel)
            throw new Error("Пауза");
          const from = (part - 1) * init.partSize,
            blob = f.slice(from, from + init.partSize);
          if (parts.get(part) === blob.size) {
            done += blob.size;
            setProgress(done);
            continue;
          }
          for (let attempt = 0; ; attempt++) {
            try {
              const { url } = await api(path + "/parts/" + part, {});
              if (control.current.paused || control.current.cancel)
                throw new Error("Пауза");
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
              await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
            }
          }
        }
        if (control.current.paused || control.current.cancel) break;
        await api(path + "/complete", {});
      }
      if (!control.current.paused && !control.current.cancel) {
        await api(`/api/transfers/${u.id}/complete`, {});
        await forgetUpload(u.id);
        setUpload(null);
        await reload();
      }
    } catch (e) {
      if (!control.current.paused && !control.current.cancel) {
        if ([404, 409].includes(e.status)) {
          await forgetUpload(u.id);
          setUpload(null);
          setError(e.message);
          return;
        }
        setError(e.message + " — можно продолжить");
        control.current.paused = true;
        setPaused(true);
      }
    } finally {
      active.current = false;
      setRunning(false);
    }
  }
  function pause() {
    control.current.paused = true;
    control.current.xhr?.abort();
    setPaused(true);
  }
  async function cancel() {
    control.current.cancel = true;
    control.current.xhr?.abort();
    try {
      await api("/api/transfers/" + upload.id, undefined, "DELETE");
      await forgetUpload(upload.id);
      setUpload(null);
      reload();
    } catch (e) {
      setError(e.message);
    }
  }
  if (checking) return <main />;
  if (!logged)
    return (
      <main className="center">
        <div className="login">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await api("/api/login", { password });
                setLogged(true);
                setPassword("");
                setError("");
              } catch (e) {
                setPassword("");
                setError(e.message);
              }
            }}
          >
            <PasswordInput
              error={error}
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError("");
              }}
              required
              maxLength={6}
              minLength={6}
              pattern="[0-9]{6}"
              inputMode="numeric"
            />
          </form>
        </div>
      </main>
    );
  return (
    <OwnerView
      {...{
        history,
        preparingUpload,
        ttl,
        setTtl,
        secret,
        setSecret,
        upload,
        progress,
        paused,
        running,
        elapsed,
        drag,
        setDrag,
        selected,
        setSelected,
        error,
        choose,
        run,
        pause,
        cancel,
      }}
      readText={async (transfer) => {
        const response = await fetch(
          "/api/transfers/" + transfer.id + "/text",
          { headers: { "If-Match": `"${transfer.revision}"` } },
        );
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Не удалось открыть текст");
        }
        return new TextDecoder("utf-8", {
          fatal: true,
          ignoreBOM: true,
        }).decode(await response.arrayBuffer());
      }}
      replaceText={(files, transfer) =>
        choose(files, transfer.id, transfer.revision)
      }
      settingsApi={async (path, body, method) => {
        const result = await api(path, body, method);
        if (method) await reload();
        return result;
      }}
      refresh={reload}
      logout={async () => {
        await api("/api/logout", {});
        setLogged(false);
      }}
      removeFiles={async (id, indices, revision) => {
        try {
          await api(
            "/api/transfers/" + id + "/files",
            { indices, revision },
            "DELETE",
          );
          await reload();
          return true;
        } catch (e) {
          setError(e.message);
          return false;
        }
      }}
      removeHistory={async (ids) => {
        try {
          for (let offset = 0; offset < ids.length; offset += 1000)
            await api(
              "/api/history",
              { ids: ids.slice(offset, offset + 1000) },
              "DELETE",
            );
          if (ids.includes(selected)) setSelected(null);
        } finally {
          await reload();
        }
      }}
      remove={async (id) => {
        setError("");
        try {
          await api("/api/transfers/" + id, undefined, "DELETE");
          if (selected === id) setSelected(null);
          await reload();
        } catch (e) {
          setError(e.message);
        }
      }}
    />
  );
}
const token =
  location.pathname.match(/^\/t\/([\w-]+)$/)?.[1] ||
  location.pathname.match(/^\/([A-Za-z0-9]{6})$/)?.[1];
createRoot(document.getElementById("root")).render(
  token ? <Recipient token={token} api={api} /> : <App />,
);
