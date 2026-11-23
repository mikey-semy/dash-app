import { copy } from "#common/copy.js";
import { LIMIT, MAX_FILES, TIMING } from "#common/config.js";

const version = (record) =>
  JSON.stringify([
    record.revision,
    record.title,
    record.files.map(({ id, name, size }) => [id, name, size]),
  ]);
export const fileIdentity = (file, index) => file.id ?? index;

function batchJobs(jobs) {
  const type = jobs[0].type;
  if (!["append", "rename"].includes(type)) return jobs.shift();
  const batch = [];
  while (jobs[0]?.type === type) batch.push(jobs.shift());
  if (type === "append")
    return {
      type,
      files: batch.flatMap((job) => job.files),
      fileIds: batch.flatMap((job) => job.fileIds),
    };
  if (type === "rename")
    return {
      type,
      names: Object.assign({}, ...batch.map((job) => job.names)),
      ...Object.assign(
        {},
        ...batch.map((job) => ("title" in job ? { title: job.title } : {})),
      ),
    };
  return batch[0];
}

// Each transfer has an ordered worker. Only uploads share a transport lock;
// metadata changes in other transfers can proceed during an upload or archive.
export function createTransferUpdateQueue({
  read,
  apply,
  retryFailed,
  changed = () => {},
  delay = TIMING.transferUpdateBatch,
  poll = 500,
}) {
  const entries = new Map();
  let uploadTail = Promise.resolve();
  const notify = () => changed();
  const pending = (entry) => [entry.active, ...entry.jobs].filter(Boolean);
  const resolveId = (entry, id) => {
    const seen = new Set();
    while (entry.aliases.has(String(id)) && !seen.has(String(id))) {
      seen.add(String(id));
      id = entry.aliases.get(String(id));
    }
    return id;
  };
  function linkAppend(entry, record) {
    if (
      !["append", "replace"].includes(entry.active?.type) ||
      !entry.submitted ||
      !entry.activeRevision ||
      entry.activeRevision === record.revision
    )
      return;
    if (entry.active.type === "replace") {
      const file = record.files[entry.activeFileIndex];
      if (file)
        entry.aliases.set(
          String(entry.activeFileId),
          fileIdentity(file, entry.activeFileIndex),
        );
      return;
    }
    entry.active.fileIds.forEach((id, index) => {
      const file = record.files[entry.activeFileCount + index];
      if (file)
        entry.aliases.set(
          String(id),
          fileIdentity(file, entry.activeFileCount + index),
        );
    });
  }
  function resolvedJob(entry) {
    const job = entry.active;
    if (job.type === "rename")
      return {
        ...job,
        names: Object.fromEntries(
          Object.entries(job.names).map(([id, name]) => [
            resolveId(entry, id),
            name,
          ]),
        ),
      };
    if (job.type === "replace")
      return { ...job, fileId: resolveId(entry, job.fileId) };
    return job;
  }
  function schedule(entry) {
    if (entry.worker || entry.error || entry.timer) return;
    entry.timer = setTimeout(() => {
      entry.timer = null;
      drain(entry);
    }, delay);
  }
  async function ready(entry) {
    for (;;) {
      entry.controller.signal.throwIfAborted();
      const record = await read(entry.id, entry.controller.signal);
      if (!record) throw new Error(copy.transferDeleted);
      if (record.appendState === "failed") {
        if (entry.retryFailed && retryFailed) {
          entry.retryFailed = false;
          await retryFailed(record, entry.controller.signal);
          continue;
        }
        throw new Error(record.appendError || copy.couldNotUpdateTheTransfer);
      }
      if (!record.appendState && ["ready", "empty"].includes(record.state))
        return record;
      if (!["ready", "empty", "queued", "archiving"].includes(record.state))
        throw new Error(copy.transferUnavailable);
      await new Promise((resolve, reject) => {
        const signal = entry.controller.signal;
        const abort = () => {
          clearTimeout(timer);
          reject(signal.reason);
        };
        const timer = setTimeout(() => {
          signal.removeEventListener("abort", abort);
          resolve();
        }, poll);
        signal.addEventListener("abort", abort, { once: true });
        if (signal.aborted) abort();
      });
    }
  }
  async function execute(entry, record) {
    const signal = entry.controller.signal;
    if (["append", "replace"].includes(entry.active.type)) {
      const previous = uploadTail;
      let release;
      uploadTail = new Promise((resolve) => {
        release = resolve;
      });
      try {
        await previous;
        signal.throwIfAborted();
        await apply(record, resolvedJob(entry), signal);
      } finally {
        release();
      }
    } else await apply(record, resolvedJob(entry), signal);
    entry.submitted = true;
  }
  async function drain(entry) {
    if (entry.worker || entry.error) return;
    entry.worker = true;
    try {
      while (entry.active || entry.jobs.length) {
        if (!entry.active) {
          entry.active = batchJobs(entry.jobs);
          entry.submitted = false;
        }
        notify();
        const current = await ready(entry);
        if (!entry.submitted) {
          if (entry.expected && version(current) !== entry.expected)
            throw new Error(copy.transferChangedReopenSettings);
          entry.activeRevision = current.revision;
          entry.activeFileCount = current.files.length;
          if (entry.active.type === "replace") {
            entry.activeFileId = resolveId(entry, entry.active.fileId);
            entry.activeFileIndex = current.files.findIndex(
              (file, index) => fileIdentity(file, index) === entry.activeFileId,
            );
          }
          await execute(entry, current);
        }
        const confirmed = await ready(entry);
        linkAppend(entry, confirmed);
        entry.expected = version(confirmed);
        entry.active = null;
        notify();
      }
      if (entries.get(entry.id) === entry) entries.delete(entry.id);
    } catch (error) {
      if (!entry.controller.signal.aborted)
        entry.error = error.message || copy.couldNotUpdateTheTransfer;
    } finally {
      entry.worker = false;
      notify();
    }
  }
  return {
    enqueue(record, job) {
      if (
        job.type === "rename" &&
        !Object.keys(job.names).length &&
        !("title" in job)
      )
        return true;
      let entry = entries.get(record.id);
      if (entry?.controller.signal.aborted)
        throw new Error(copy.transferUnavailable);
      if (job.type === "append") {
        const files = [
          ...record.files,
          ...(entry
            ? pending(entry)
                .filter(
                  (job) =>
                    job.type === "append" &&
                    (job !== entry.active ||
                      !entry.activeRevision ||
                      entry.activeRevision === record.revision),
                )
                .flatMap((job) => job.files)
            : []),
          ...job.files,
        ];
        if (
          files.length > MAX_FILES ||
          files.reduce((sum, file) => sum + file.size, 0) > LIMIT
        )
          throw new Error(copy.upTo100FilesAnd2GbInTotal);
      }
      if (!entry) {
        entry = {
          id: record.id,
          jobs: [],
          active: null,
          expected:
            record.appendState && record.appendState !== "failed"
              ? null
              : version(record),
          aliases: new Map(),
          controller: new AbortController(),
        };
        entries.set(record.id, entry);
      }
      if (job.type === "append")
        job = {
          ...job,
          fileIds: job.files.map(() => "queued/" + crypto.randomUUID()),
        };
      if (job.type === "rename") {
        const names = { ...job.names };
        for (const waiting of entry.jobs.filter(
          (job) => job.type === "append",
        )) {
          waiting.files = waiting.files.map((file, index) => {
            const id = waiting.fileIds[index];
            if (!(id in names)) return file;
            const name = names[id];
            delete names[id];
            return file instanceof Blob
              ? new File([file], name, {
                  type: file.type,
                  lastModified: file.lastModified,
                })
              : { ...file, name };
          });
        }
        job = { ...job, names };
        if (!Object.keys(names).length && !("title" in job)) {
          notify();
          return true;
        }
      }
      entry.jobs.push(job);
      notify();
      schedule(entry);
      return true;
    },
    project(records) {
      return records.map((record) => {
        const entry = entries.get(record.id);
        if (!entry)
          return record.appendState && record.appendState !== "failed"
            ? { ...record, updates: { count: 1, error: "" } }
            : record;
        linkAppend(entry, record);
        const jobs = pending(entry);
        const names = Object.fromEntries(
          jobs
            .filter((job) => job.type === "rename")
            .flatMap((job) => Object.entries(job.names))
            .map(([id, name]) => [resolveId(entry, id), name]),
        );
        const added = jobs
          .filter(
            (job) =>
              job.type === "append" &&
              (job !== entry.active ||
                !entry.activeRevision ||
                record.revision === entry.activeRevision),
          )
          .flatMap((job) =>
            job.files.map((file, index) => ({
              id: job.fileIds[index],
              name: file.name,
              size: file.size,
              preview: false,
              pending: true,
            })),
          );
        const titles = jobs.filter((job) => "title" in job);
        return {
          ...record,
          preview: record.preview && !added.length,
          size:
            (record.size ??
              record.files.reduce((sum, file) => sum + file.size, 0)) +
            added.reduce((sum, file) => sum + file.size, 0),
          ...(titles.length ? { title: titles.at(-1).title } : {}),
          files: [...record.files, ...added].map((file, index) => ({
            ...file,
            name: names[fileIdentity(file, index)] ?? file.name,
            contentPending: jobs.some(
              (job) =>
                job.type === "replace" &&
                resolveId(entry, job.fileId) === fileIdentity(file, index),
            ),
          })),
          updates: {
            count: jobs.reduce(
              (sum, job) =>
                sum +
                (job.files?.length || Object.keys(job.names || {}).length || 1),
              0,
            ),
            error: entry.error || "",
          },
        };
      });
    },
    hasPending: (id) => (id === undefined ? entries.size > 0 : entries.has(id)),
    retry(id) {
      const entry = entries.get(id);
      if (!entry || entry.worker) return;
      entry.error = null;
      if (
        !entry.submitted &&
        entry.active &&
        ["append", "rename"].includes(entry.active.type)
      ) {
        entry.jobs.unshift(entry.active);
        entry.active = null;
      }
      // Retrying explicitly accepts the latest server revision. Already accepted
      // mutations are only observed, never sent again after a polling failure.
      entry.expected = null;
      entry.retryFailed = true;
      schedule(entry);
      notify();
    },
    discard(id) {
      const entry = entries.get(id);
      if (!entry) return;
      clearTimeout(entry.timer);
      entry.controller.abort();
      entries.delete(id);
      notify();
    },
  };
}
