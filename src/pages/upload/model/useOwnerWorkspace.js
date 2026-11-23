import { useState, useEffect, useRef } from "react";
import {
  DEFAULT_RETENTION,
  RETENTION_SECONDS,
  MAX_FILES,
  LIMIT,
  UPLOAD_TRANSFER,
  UPLOAD_TUNING,
} from "#common/config.js";
import { copy } from "#common/copy.js";
import api from "#src/shared/api/client.js";
import {
  rememberUpload,
  recoverUpload,
  forgetUpload,
  matchUpload,
  createUploadTransport,
} from "#src/features/upload-files/index.js";

import {
  createTransferUpdateQueue,
  fileIdentity,
} from "./transferUpdateQueue.js";

function measureUpload(phase, start, end = performance.now()) {
  const name = "dash.upload." + phase;
  performance.clearMeasures(name);
  performance.measure(name, { start, end });
}

export function useOwnerWorkspace() {
  const [logged, setLogged] = useState(false),
    [checking, setChecking] = useState(true),
    [error, setError] = useState(""),
    [history, setHistory] = useState([]),
    [ttl, setTtl] = useState(() => {
      try {
        const stored = localStorage.getItem("du.ttl");
        const value = stored === null ? DEFAULT_RETENTION : Number(stored);
        return [-1, ...RETENTION_SECONDS].includes(value)
          ? value
          : DEFAULT_RETENTION;
      } catch {
        return DEFAULT_RETENTION;
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
    [preparingUpload, setPreparingUpload] = useState(false),
    [renaming, setRenaming] = useState(false);
  const [, redrawUpdates] = useState(0);
  const queueActions = useRef(),
    updates = useRef(),
    currentUpload = useRef(null),
    completion = useRef(null),
    historyRead = useRef(null),
    historyGeneration = useRef(0);
  if (!updates.current)
    updates.current = createTransferUpdateQueue({
      read: (...args) => queueActions.current.read(...args),
      apply: (...args) => queueActions.current.apply(...args),
      retryFailed: (...args) => queueActions.current.retryFailed(...args),
      changed: () => redrawUpdates((value) => value + 1),
    });
  function updateUpload(value) {
    currentUpload.current = value;
    setUpload(value);
  }
  const control = useRef({ paused: false, cancel: false, requests: new Set() }),
    start = useRef(0),
    uploadTiming = useRef(null),
    uploadConcurrency = useRef(UPLOAD_TRANSFER.concurrency),
    active = useRef(null),
    choosing = useRef(false),
    recoveryChecked = useRef(false);
  useEffect(() => {
    document.title = logged
      ? location.pathname === "/history"
        ? copy.history
        : copy.upload
      : copy.signIn;
  }, [logged]);
  useEffect(() => {
    try {
      localStorage.setItem("du.ttl", String(ttl));
    } catch {}
  }, [ttl]);
  function invalidateHistory() {
    historyGeneration.current++;
    historyRead.current = null;
  }
  function readHistory() {
    if (historyRead.current) return historyRead.current;
    const generation = historyGeneration.current;
    const request = api("/api/transfers")
      .then((list) => {
        if (generation === historyGeneration.current) setHistory(list);
        return list;
      })
      .finally(() => {
        if (historyRead.current === request) historyRead.current = null;
      });
    historyRead.current = request;
    return request;
  }
  const reload = () =>
    readHistory().catch((error) => {
      if (error.status === 401) setLogged(false);
    });
  function applyUploadConfig(session) {
    const value = session?.uploadConcurrency;
    if (
      Number.isInteger(value) &&
      value >= UPLOAD_TUNING.minConcurrency &&
      value <= UPLOAD_TUNING.maxConcurrency
    )
      uploadConcurrency.current = value;
  }
  useEffect(() => {
    api("/api/session")
      .then((session) => {
        applyUploadConfig(session);
        setLogged(true);
      })
      .catch((error) => {
        if (error.status !== 401) setError(error.message);
      })
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
            throw Object.assign(new Error(copy.uploadContentsChanged), {
              status: 409,
            });
          updateUpload(value);
          setSelected(value.parentId || value.id);
          setPaused(true);
          control.current = {
            paused: true,
            cancel: false,
            requests: new Set(),
          };
          if (!value.missing) rememberUpload(value).catch(() => false);
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
          updateUpload(value);
          setSelected(value.parentId || value.id);
          setPaused(true);
          control.current = {
            paused: true,
            cancel: false,
            requests: new Set(),
          };
          start.current = Date.now();
          setError(copy.uploadVerificationFailed);
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
      if (completion.current?.id === upload.id)
        completion.current.resolve(true);
      forgetUpload(upload.id);
      updateUpload(null);
      setError("");
    }
  }, [history, upload, running]);
  useEffect(() => {
    const timing = uploadTiming.current;
    if (!timing || timing.transferred === undefined) return;
    const record = history.find((item) => item.id === timing.id);
    if (
      !record ||
      record.state !== "ready" ||
      record.appendState ||
      (timing.parent && timing.baseRevision === record.revision)
    )
      return;
    measureUpload("finalize-and-observe-ready", timing.transferred);
    measureUpload("ready", timing.started);
    uploadTiming.current = null;
  }, [history]);
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
      if (active.current || updates.current.hasPending()) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", fn);
    return () => window.removeEventListener("beforeunload", fn);
  }, []);
  async function waitForChange(id, current) {
    for (let attempt = 0; current?.appendState && attempt < 240; attempt++) {
      if (current.appendState === "failed")
        throw new Error(current.appendError || copy.couldNotUpdateTheTransfer);
      await new Promise((resolve) => setTimeout(resolve, 500));
      const list = await readHistory();
      current = list.find((t) => t.id === id);
      if (!current) throw new Error(copy.transferDeleted);
    }
    if (current?.appendState) throw new Error(copy.updateIsStillInProgress);
    return current;
  }
  async function choose(
    list,
    parentId = null,
    replacement = null,
    index = undefined,
    expectedRevision = undefined,
  ) {
    const started = performance.now();
    if ((active.current && !active.current.cancel) || choosing.current)
      return false;
    const pendingUpload = currentUpload.current;
    if (pendingUpload?.missing) {
      try {
        const restored = await matchUpload(pendingUpload, Array.from(list));
        updateUpload(restored);
        await rememberUpload(restored);
        run(restored);
        return true;
      } catch (error) {
        setError(error.message);
        return false;
      }
    }
    if (pendingUpload) return false;
    const files = Array.from(list);
    if (!files.length) return false;
    if (
      files.length > MAX_FILES ||
      files.reduce((n, f) => n + f.size, 0) > LIMIT
    ) {
      setError(copy.upTo100FilesAnd2GbInTotal);
      return false;
    }
    setError("");
    choosing.current = true;
    setPreparingUpload(true);
    try {
      // Virtual files dragged out of a desktop archive may not be readable by the browser.
      for (const file of files)
        await file.slice(0, Math.min(file.size, 1)).arrayBuffer();
      const { id, offset = 0 } = await api(
        parentId
          ? "/api/transfers/" +
              parentId +
              (replacement === null ? "/append" : "/replace")
          : "/api/transfers",
        {
          files: files.map((f) => ({
            name: f.name,
            size: f.size,
            directory: f.type === "application/x-du-directory",
          })),
          ttl: ttl === -1 ? 0 : ttl,
          oneTime: ttl === -1,
          password: secret,
          ...(replacement === null
            ? { revision: expectedRevision }
            : { revision: replacement, index }),
        },
      );
      const u = {
        id,
        parentId,
        created: Date.now(),
        baseRevision: parentId
          ? (expectedRevision ??
            history.find((t) => t.id === parentId)?.revision)
          : null,
        offset,
        files,
        total: files.reduce((n, f) => n + f.size, 0),
      };
      const timing = {
        id: parentId || id,
        parent: !!parentId,
        baseRevision: u.baseRevision,
        started,
      };
      uploadTiming.current = timing;
      rememberUpload(u)
        .then((saved) => {
          if (saved && uploadTiming.current === timing)
            measureUpload("recovery-preparation", started);
        })
        .catch(() => {});
      let resolve;
      completion.current = {
        id,
        promise: new Promise((done) => {
          resolve = done;
        }),
        resolve: (value) => resolve(value),
      };
      updateUpload(u);
      setSelected(parentId || id);
      setProgress(0);
      setElapsed(0);
      control.current = { paused: false, cancel: false, requests: new Set() };
      start.current = Date.now();
      run(u);
      return true;
    } catch (e) {
      setError(e.message);
      if (parentId !== null) {
        await reload();
        throw e;
      }
      return false;
    } finally {
      choosing.current = false;
      setPreparingUpload(false);
    }
  }
  async function run(u) {
    if (active.current && !active.current.cancel) return;
    const state = control.current;
    active.current = state;
    setRunning(true);
    setPaused(false);
    state.paused = false;
    try {
      const timing = uploadTiming.current;
      await transport.sendParts(u, {
        onFirstSend() {
          if (timing && timing.firstSend === undefined) {
            timing.firstSend = performance.now();
            measureUpload("first-put", timing.started, timing.firstSend);
          }
        },
      });
      if (control.current !== state) return;
      if (!state.paused && !state.cancel) {
        if (timing) {
          timing.transferred = performance.now();
          if (timing.firstSend !== undefined)
            measureUpload("transfer", timing.firstSend, timing.transferred);
        }
        await api(`/api/transfers/${u.id}/complete`, {});
        if (control.current !== state || state.cancel) return;
        await forgetUpload(u.id);
        if (control.current !== state) return;
        updateUpload(null);
        invalidateHistory();
        await reload();
        state.completed = true;
      }
    } catch (e) {
      if (control.current !== state) return;
      if (!state.paused && !state.cancel) {
        if ([404, 409].includes(e.status)) {
          await forgetUpload(u.id);
          if (control.current !== state) return;
          updateUpload(null);
          setError(e.message);
          if (completion.current?.id === u.id)
            completion.current.resolve(false);
          return;
        }
        setError(e.message + copy.canBeResumedSuffix);
        state.paused = true;
        setPaused(true);
      }
    } finally {
      if (active.current === state) {
        active.current = null;
        setRunning(false);
      }
      if (state.completed && completion.current?.id === u.id)
        completion.current.resolve(true);
    }
  }
  function pause() {
    control.current.paused = true;
    transport.abort();
    setPaused(true);
  }
  async function cancel() {
    if (upload?.parentId) updates.current.discard(upload.parentId);
    completion.current?.resolve(false);
    uploadTiming.current = null;
    control.current.cancel = true;
    transport.abort();
    try {
      await api("/api/transfers/" + upload.id, undefined, "DELETE");
      await forgetUpload(upload.id);
      updateUpload(null);
      invalidateHistory();
      reload();
    } catch (e) {
      setError(e.message);
    }
  }

  const transport = createUploadTransport({
    api,
    control,
    onProgress: setProgress,
    concurrency: uploadConcurrency.current,
  });
  async function signIn(password) {
    try {
      applyUploadConfig(await api("/api/login", { password }));
      setLogged(true);
      setError("");
      return true;
    } catch (error) {
      setError(error.message);
      return false;
    }
  }
  queueActions.current = {
    retryFailed: async (record, signal) => {
      await api(
        "/api/transfers/" + record.id + "/retry-update",
        { revision: record.revision },
        "POST",
        { signal },
      );
      invalidateHistory();
    },
    read: async (id, signal) => {
      signal.throwIfAborted();
      const list = await readHistory();
      signal.throwIfAborted();
      return list.find((record) => record.id === id);
    },
    apply: async (record, job, signal) => {
      signal.throwIfAborted();
      if (job.type === "rename") {
        const known = new Set(record.files.map(fileIdentity));
        if (
          Object.keys(job.names).some(
            (id) => ![...known].some((value) => String(value) === id),
          )
        )
          throw new Error(copy.fileSelectionStale);
        await api(
          "/api/transfers/" + record.id + "/settings",
          {
            ...(Object.keys(job.names).length
              ? {
                  names: record.files.map(
                    (file, index) =>
                      job.names[fileIdentity(file, index)] ?? file.name,
                  ),
                }
              : {}),
            ...("title" in job ? { title: job.title } : {}),
            revision: record.revision,
          },
          "PATCH",
          { signal },
        );
        invalidateHistory();
      } else {
        while (
          currentUpload.current ||
          choosing.current ||
          (active.current && !active.current.cancel)
        ) {
          signal.throwIfAborted();
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        signal.throwIfAborted();
        const index =
          job.type === "replace"
            ? record.files.findIndex(
                (file, position) => fileIdentity(file, position) === job.fileId,
              )
            : undefined;
        if (index === -1) throw new Error(copy.fileSelectionStale);
        const accepted = await choose(
          job.files,
          record.id,
          job.type === "replace" ? record.revision : null,
          index,
          record.revision,
        );
        if (!accepted) throw new Error(copy.updateIsStillInProgress);
        if (!(await completion.current.promise))
          throw new Error(copy.couldNotUpdateTheTransfer);
        invalidateHistory();
      }
    },
  };
  function queueFiles(source, parentId, replacement = null, index = 0) {
    if (!parentId) return choose(source);
    try {
      const record = history.find((record) => record.id === parentId);
      if (!record) throw new Error(copy.transferUnavailable);
      if (replacement !== null && record.revision !== replacement)
        throw new Error(copy.transferChangedReopenTheEditor);
      const files = Array.from(source);
      if (!files.length) return false;
      return updates.current.enqueue(
        record,
        replacement === null
          ? { type: "append", files }
          : {
              type: "replace",
              files,
              fileId: fileIdentity(record.files[index], index),
            },
      );
    } catch (error) {
      setError(error.message);
      if (replacement !== null) throw error;
      return false;
    }
  }
  return {
    logged,
    checking,
    error,
    signIn,
    clearError: () => setError(""),
    ownerProps: {
      history: updates.current.project(history),
      retryUpdates: (id) => {
        setError("");
        updates.current.retry(id);
      },
      discardUpdates: (id) => {
        setError("");
        updates.current.discard(id);
      },
      preparingUpload,
      renaming,
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
      startNew: () => {
        setSelected(null);
        setError("");
      },
      error,
      choose: (files, parentId = null) => queueFiles(files, parentId),
      run,
      pause,
      cancel,
      readText: async (transfer, index = 0) => {
        const response = await fetch(
          "/api/transfers/" + transfer.id + "/text/" + index,
          { headers: { "If-Match": `"${transfer.revision}"` } },
        );
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || copy.couldNotOpenTheText);
        }
        return new TextDecoder("utf-8", {
          fatal: true,
          ignoreBOM: true,
        }).decode(await response.arrayBuffer());
      },
      replaceText: (files, transfer) =>
        queueFiles(files, transfer.id, transfer.revision, transfer.index),
      rename: (record, patch) => {
        setError("");
        const names = {};
        patch.names?.forEach((name, index) => {
          if (name !== record.files[index].name)
            names[fileIdentity(record.files[index], index)] = name;
        });
        if (!Object.keys(names).length && !("title" in patch)) return true;
        return updates.current.enqueue(record, {
          type: "rename",
          names,
          ...("title" in patch ? { title: patch.title } : {}),
        });
      },
      settingsApi: async (path, body, method) => {
        const result = await api(path, body, method);
        if (method) {
          invalidateHistory();
          await reload();
        }
        return result;
      },
      waitForUpdates: async (id) => {
        setRenaming(true);
        try {
          while (updates.current.hasPending(id)) {
            const list = await readHistory();
            const record = updates.current
              .project(list)
              .find((item) => item.id === id);
            if (record?.updates?.error) throw new Error(record.updates.error);
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
          const list = await readHistory();
          return list.find((record) => record.id === id);
        } finally {
          setRenaming(false);
        }
      },
      refresh: reload,
      logout: async () => {
        await api("/api/logout", {});
        setLogged(false);
      },
      removeFiles: async (id, indices, revision) => {
        if (
          updates.current.project(history).find((record) => record.id === id)
            ?.updates
        ) {
          setError(copy.waitForTheTransferUpdateToFinish);
          return false;
        }
        setRenaming(true);
        setError("");
        try {
          await api(
            "/api/transfers/" + id + "/files",
            { indices, revision },
            "DELETE",
          );
          invalidateHistory();
          const list = await readHistory();
          await waitForChange(
            id,
            list.find((t) => t.id === id),
          );
          return true;
        } catch (e) {
          setError(e.message);
          return false;
        } finally {
          setRenaming(false);
        }
      },
      removeHistory: async (ids) => {
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
      },
      remove: async (id) => {
        updates.current.discard(id);
        if (upload?.parentId === id) {
          completion.current?.resolve(false);
          control.current.cancel = true;
          transport.abort();
          updateUpload(null);
        }
        setError("");
        try {
          await api("/api/transfers/" + id, undefined, "DELETE");
          if (selected === id) setSelected(null);
          invalidateHistory();
          await reload();
        } catch (e) {
          setError(e.message);
        }
      },
    },
  };
}
