import { TIMING, UI } from "../../../../shared/config.js";
import { IconButton } from "../../../shared/ui/IconButton.jsx";
import { copy } from "../../../../shared/copy.js";
import { ErrorNotice, connectionError } from "../../../shared/ui/Errors.jsx";
import { AnimatedDetails } from "../../../shared/ui/Disclosure.jsx";
import React, { lazy, Suspense, useEffect, useRef, useState } from "react";
import EditableName from "../../../shared/ui/EditableName.jsx";
import { captureFiles } from "../../../features/upload-files/index.js";
const FolderUpload = lazy(
  () => import("../../../features/upload-files/review.js"),
);
import { Icon } from "../../../shared/ui/Icons.jsx";
import {
  Expiry,
  durations,
  FileList,
} from "../../../entities/transfer/index.js";
const TextComposer = lazy(
  () => import("../../../features/compose-text/index.js"),
);
const MediaViewer = lazy(() => import("../../../widgets/file-viewer/media.js"));
const TransferSettings = lazy(
  () => import("../../../features/manage-transfer/index.js"),
);
const TextViewer = lazy(() => import("../../../widgets/file-viewer/text.js"));
import { bytes, date } from "../../../shared/lib/format.js";
import { generatePin } from "../../../shared/lib/password.js";
import { TransferActions as Share } from "../../../features/manage-transfer/actions.js";
import History from "../../../widgets/history/index.js";
function Gear() {
  return <Icon name="settings" size={UI.settingsIconSize} />;
}
export function OwnerView(p) {
  const [draft, setDraft] = useState(null),
    [folders, setFolders] = useState(null),
    [dropZone, setDropZone] = useState("new"),
    [config, setConfig] = useState(null),
    [opening, setOpening] = useState(false),
    [editorError, setEditorError] = useState(""),
    [viewing, setViewing] = useState(null),
    [historyOpen, setHistoryOpen] = useState(false),
    [passwordState, setPasswordState] = useState("idle"),
    input = useRef(),
    appendTarget = useRef(null),
    settings = useRef(),
    passwordClick = useRef(),
    passwordVersion = useRef(0),
    editorTimer = useRef();
  useEffect(() => () => clearTimeout(editorTimer.current), []);
  useEffect(() => {
    const reset = () => window.scrollTo(0, 0);
    reset();
    window.addEventListener("pageshow", reset);
    window.addEventListener("focus", reset);
    window.visualViewport?.addEventListener("resize", reset);
    return () => {
      window.removeEventListener("pageshow", reset);
      window.removeEventListener("focus", reset);
      window.visualViewport?.removeEventListener("resize", reset);
    };
  }, []);
  useEffect(
    () => () => {
      clearTimeout(passwordClick.current);
      passwordVersion.current++;
    },
    [],
  );
  useEffect(() => {
    if (p.upload) {
      clearTimeout(passwordClick.current);
      passwordVersion.current++;
    }
  }, [p.upload]);
  const receiveFiles = (data, parentId = null) => {
    const source = captureFiles(data);
    if (source.folders) setFolders({ ...source, parentId });
    else p.choose(source.files, parentId);
  };
  useEffect(() => {
    const paste = (event) => {
      if (event.clipboardData?.files.length) {
        event.preventDefault();
        event.stopPropagation();
        if (
          p.upload ||
          p.preparingUpload ||
          draft !== null ||
          folders !== null ||
          config ||
          (historyOpen && !viewing)
        )
          return;
        const current = viewing?.record || latest;
        if (viewing) {
          setViewing(null);
          setHistoryOpen(false);
          p.setSelected(current.id);
        }
        receiveFiles(event.clipboardData, current?.url ? current.id : null);
        return;
      }
      if (
        event.defaultPrevented ||
        p.upload ||
        historyOpen ||
        viewing ||
        config ||
        draft !== null ||
        folders !== null ||
        (event.target instanceof Element &&
          event.target.closest("input,textarea,[contenteditable=true]"))
      )
        return;
      {
        const text = event.clipboardData.getData("text/plain");
        if (text) {
          event.preventDefault();
          settings.current.open = false;
          setDraft({ text });
        }
      }
    };
    document.addEventListener("paste", paste, true);
    return () => document.removeEventListener("paste", paste, true);
  }, [
    p.upload,
    p.preparingUpload,
    p.choose,
    historyOpen,
    draft,
    folders,
    config,
    viewing,
    p.selected,
    p.history,
  ]);
  useEffect(() => {
    if (config && !p.history.some((t) => t.id === config && t.url))
      setConfig(null);
  }, [config, p.history]);
  const editText = async (transfer) => {
    if (opening) return;
    setOpening(true);
    setEditorError("");
    clearTimeout(editorTimer.current);
    try {
      const text = await p.readText(transfer);
      setDraft({
        text,
        id: transfer.id,
        revision: transfer.revision,
        filename: transfer.files[0].name,
      });
    } catch (error) {
      console.error("[DU] text editor", error);
      setEditorError(transfer.id);
      editorTimer.current = setTimeout(() => setEditorError(""), 2400);
      p.refresh();
    } finally {
      setOpening(false);
    }
  };
  useEffect(() => {
    if (
      viewing &&
      !p.history.some(
        (t) =>
          t.id === viewing.record.id &&
          t.revision === viewing.record.revision &&
          t.url,
      )
    )
      setViewing(null);
  }, [p.history, viewing]);
  const clearPassword = () => {
    clearTimeout(passwordClick.current);
    passwordVersion.current++;
    p.setSecret("");
    setPasswordState("removed");
  };
  const generatePassword = async () => {
    const version = ++passwordVersion.current;
    const pin = generatePin();
    try {
      await navigator.clipboard.writeText(pin);
      if (version !== passwordVersion.current) return;
      p.setSecret(pin);
      setPasswordState("copied");
    } catch (error) {
      console.error("[DU] password clipboard", error);
      if (version === passwordVersion.current) setPasswordState("failed");
    }
  };
  useEffect(() => {
    if (passwordState === "copied" || passwordState === "removed") {
      const timer = setTimeout(() => setPasswordState("idle"), TIMING.feedback);
      return () => clearTimeout(timer);
    }
  }, [passwordState]);
  const durationIndex = durations.findIndex(([value]) => value === p.ttl),
    duration = durations[durationIndex];
  const latest = p.history.find((t) => t.id === p.selected);
  const busyAppend = latest?.appendState && latest.appendState !== "failed";
  const completed =
    !p.upload &&
    (!busyAppend || p.renaming) &&
    ["ready", "empty"].includes(latest?.state) &&
    latest.url;
  const preparing =
    !p.upload &&
    (["queued", "archiving"].includes(latest?.state) || busyAppend);
  const speed = p.elapsed ? p.progress / p.elapsed : 0,
    eta = speed ? Math.max(0, (p.upload?.total - p.progress) / speed) : 0;
  return (
    <main
      onDragOver={(e) => {
        if (!Array.from(e.dataTransfer.types).includes("Files")) return;
        e.preventDefault();
        if (
          !p.upload &&
          !p.preparingUpload &&
          !preparing &&
          !folders &&
          !historyOpen &&
          !viewing &&
          !config &&
          !draft
        ) {
          p.setDrag(true);
          setDropZone(
            completed && e.clientY >= innerHeight / 2 ? "append" : "new",
          );
        }
      }}
      onDragLeave={(e) => {
        if (
          !e.currentTarget.contains(e.relatedTarget) &&
          (e.clientX <= 0 ||
            e.clientY <= 0 ||
            e.clientX >= innerWidth ||
            e.clientY >= innerHeight)
        )
          p.setDrag(false);
      }}
      onDropCapture={(e) => {
        if (
          !e.dataTransfer.files.length &&
          !Array.from(e.dataTransfer.types || []).includes("Files")
        )
          return;
        if (
          draft ||
          folders ||
          config ||
          (historyOpen && !viewing) ||
          p.upload ||
          p.preparingUpload
        ) {
          e.preventDefault();
          e.stopPropagation();
          p.setDrag(false);
        } else if (viewing) {
          e.preventDefault();
          e.stopPropagation();
          p.setDrag(false);
          const current = viewing.record;
          setViewing(null);
          setHistoryOpen(false);
          p.setSelected(current.id);
          receiveFiles(e.dataTransfer, current.id);
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        p.setDrag(false);
        if (
          viewing &&
          !p.upload &&
          !p.preparingUpload &&
          !draft &&
          !folders &&
          !config
        ) {
          const current = viewing.record;
          setViewing(null);
          setHistoryOpen(false);
          p.setSelected(current.id);
          receiveFiles(e.dataTransfer, current.id);
          return;
        }
        if (
          e.target instanceof Element &&
          e.target.closest("[contenteditable=true]")
        )
          return;
        if (
          !p.upload &&
          !p.preparingUpload &&
          !preparing &&
          !folders &&
          !historyOpen &&
          !config &&
          !draft
        )
          receiveFiles(
            e.dataTransfer,
            completed && e.clientY >= innerHeight / 2 ? latest.id : null,
          );
      }}
      className={p.drag ? "owner dragging" : "owner"}
    >
      {p.drag && (
        <div className="drop-zones" aria-label={copy.whereToUploadFiles}>
          <div
            className={dropZone === "new" ? "drop-zone active" : "drop-zone"}
            aria-label={copy.newTransfer}
          >
            <Icon name="upload" size={UI.dropIconSize} />
          </div>
          {completed && (
            <div
              className={
                dropZone === "append" ? "drop-zone active" : "drop-zone"
              }
              aria-label={copy.addToCurrentTransfer}
            >
              <Icon name="add" size={UI.dropIconSize} />
            </div>
          )}
        </div>
      )}
      {completed && (
        <IconButton
          className="icon-button current-close"
          aria-label={copy.closeCurrentTransfer}
          title={copy.newTransfer}
          onClick={p.startNew}
        >
          <Icon name="cancel" />
        </IconButton>
      )}
      <AnimatedDetails
        className="settings"
        inline
        ref={settings}
        label={copy.settings}
        summary={<Gear />}
      >
        <div className="settings-panel settings-toolbar">
          <IconButton
            aria-label={copy.history}
            title={copy.history}
            onClick={() => {
              settings.current.open = false;
              setHistoryOpen(true);
            }}
          >
            <Icon name="history" />
          </IconButton>
          <IconButton
            hidden={completed}
            className="icon-button duration-button"
            aria-label={copy.retentionPrefix + duration[3]}
            title={duration[3] + copy.clickToChangeRetention}
            disabled={!!p.upload}
            onClick={() =>
              p.setTtl(durations[(durationIndex + 1) % durations.length][0])
            }
          >
            <span className="duration-value" key={p.ttl}>
              <span>{duration[1]}</span>
              <small>{duration[2]}</small>
            </span>
          </IconButton>
          <IconButton
            className={
              passwordState === "failed"
                ? "icon-button edit-error"
                : "icon-button"
            }
            hidden={completed}
            aria-label={copy.generateAndCopyPassword}
            title={
              passwordState === "removed"
                ? copy.passwordRemoved
                : passwordState === "copied"
                  ? copy.passwordCopied
                  : passwordState === "failed"
                    ? undefined
                    : p.secret
                      ? copy.passwordSetHint
                      : copy.passwordGenerateHint
            }
            data-active={!!p.secret}
            aria-pressed={!!p.secret}
            disabled={!!p.upload}
            onClick={(e) => {
              clearTimeout(passwordClick.current);
              if (e.detail === 0) generatePassword();
              else if (e.detail === 1)
                passwordClick.current = setTimeout(
                  generatePassword,
                  TIMING.multiClick,
                );
            }}
            onDoubleClick={clearPassword}
            onKeyDown={(e) => {
              if (e.key === "Delete" || e.key === "Backspace") {
                e.preventDefault();
                clearPassword();
              }
            }}
          >
            <Icon
              name={
                passwordState === "failed"
                  ? "cancel"
                  : passwordState === "copied"
                    ? "check"
                    : p.secret
                      ? "lock"
                      : "unlock"
              }
            />
            <span className="sr-only" role="status">
              {passwordState === "removed"
                ? copy.passwordRemoved
                : passwordState === "copied"
                  ? copy.passwordCopied
                  : passwordState === "failed"
                    ? copy.couldNotCopyThePassword
                    : ""}
            </span>
          </IconButton>
          <IconButton
            aria-label={copy.newTextTransfer}
            title={copy.newTextTransfer}
            disabled={!!p.upload}
            onClick={() => {
              settings.current.open = false;
              setDraft({ text: "" });
            }}
          >
            <Icon name="code" />
          </IconButton>
          <IconButton
            aria-label={copy.signOut}
            title={copy.signOut}
            onClick={p.logout}
          >
            <Icon name="logout" />
          </IconButton>
        </div>
      </AnimatedDetails>
      {config && p.history.find((t) => t.id === config)?.url && (
        <Suspense fallback={null}>
          <TransferSettings
            transfer={p.history.find((t) => t.id === config)}
            api={p.settingsApi}
            renaming={p.renaming}
            onRename={(record, patch) => p.rename(record, patch)}
            onClose={() => setConfig(null)}
            onEdit={editText}
          />
        </Suspense>
      )}
      {folders && (
        <Suspense fallback={null}>
          <FolderUpload
            source={folders}
            onClose={() => setFolders(null)}
            onSend={(files) => p.choose(files, folders.parentId)}
          />
        </Suspense>
      )}
      {draft !== null && (
        <Suspense fallback={null}>
          <TextComposer
            initial={draft.text}
            filename={draft.filename}
            editing={!!draft.id}
            onClose={() => setDraft(null)}
            onSend={(files) =>
              draft.id ? p.replaceText(files, draft) : p.choose(files)
            }
          />
        </Suspense>
      )}
      <input
        ref={input}
        type="file"
        multiple
        hidden
        onCancel={() => (appendTarget.current = null)}
        onChange={(e) => {
          p.choose(e.target.files, appendTarget.current);
          appendTarget.current = null;
          e.target.value = "";
        }}
      />
      <section className="center">
        <div className="content">
          {connectionError(p.error) && !p.upload ? (
            <ErrorNotice error={p.error} />
          ) : p.preparingUpload ? (
            <div
              className="archive-status"
              role="status"
              aria-label={copy.preparingUpload}
            >
              <Icon name="archive" />
            </div>
          ) : p.upload ? (
            <>
              <FileList files={p.upload.files} />
              <div className="upload-times">
                <time title={copy.elapsed}>
                  {Math.round(p.elapsed)}
                  {copy.sSuffix}
                </time>
                <time title={copy.remaining}>
                  ≈ {Math.round(eta)}
                  {copy.sSuffix}
                </time>
              </div>
              <progress
                aria-label={copy.uploadProgress}
                value={p.progress}
                max={p.upload.total || 1}
              />
              <div className="upload-metrics">
                <span title={copy.uploadedTotalSize}>
                  {bytes(p.progress)} / {bytes(p.upload.total)}
                </span>
                <span title={copy.speed}>
                  {bytes(speed)}
                  {copy.perSecondUnit}
                </span>
              </div>
              <div className="upload-actions">
                <IconButton
                  disabled={p.paused && p.running}
                  aria-label={p.paused ? copy.resume : copy.pause}
                  title={
                    p.upload.missing
                      ? copy.selectTheSameFilesToResume
                      : p.paused
                        ? copy.resume
                        : copy.pause
                  }
                  onClick={() =>
                    p.upload.missing
                      ? input.current.click()
                      : p.paused
                        ? p.run(p.upload)
                        : p.pause()
                  }
                >
                  <Icon name={p.paused ? "play" : "pause"} />
                </IconButton>
                <IconButton
                  aria-label={copy.cancel}
                  title={copy.cancel}
                  onClick={p.cancel}
                >
                  <Icon name="cancel" />
                </IconButton>
              </div>
            </>
          ) : completed ? (
            <>
              <Share
                url={latest.shareUrl || latest.url}
                publication={
                  latest.hasSite
                    ? {
                        published: latest.published,
                        onToggle: (published) =>
                          p.settingsApi(
                            "/api/transfers/" + latest.id + "/settings",
                            { published },
                            "PATCH",
                          ),
                      }
                    : undefined
                }
                onAdd={() => {
                  appendTarget.current = latest.id;
                  input.current.click();
                }}
                onDelete={() => p.remove(latest.id)}
                onSettings={() => setConfig(latest.id)}
                editFailed={editorError === latest.id}
                editBusy={opening}
                onEdit={latest.preview ? () => editText(latest) : undefined}
              />
            </>
          ) : preparing ? (
            <div
              className="archive-status"
              role="status"
              aria-label={copy.buildingZip}
            >
              <Icon name="archive" />
            </div>
          ) : (
            <button
              className="primary-action"
              aria-label={copy.uploadAction}
              title={copy.upload}
              onClick={() => {
                appendTarget.current = null;
                input.current.click();
              }}
            >
              <Icon name="upload" />
            </button>
          )}
          {completed && !connectionError(p.error) && (
            <AnimatedDetails
              className="transfer-details owner-details"
              label={copy.transferDetails}
              summary={<Icon name="chevron" />}
            >
              <div className="transfer-information">
                <p>
                  <EditableName
                    value={latest.title || latest.name || date(latest.created)}
                    label={copy.transferName}
                    disabled={p.renaming}
                    onSave={(value) => p.rename(latest, { title: value })}
                    onGenerate={
                      latest.hasSite
                        ? (current) =>
                            p
                              .settingsApi(
                                "/api/transfers/" +
                                  latest.id +
                                  "/title-suggestion?current=" +
                                  encodeURIComponent(current),
                              )
                              .then((result) => result.title)
                        : undefined
                    }
                  />
                </p>
                <FileList
                  files={latest.files}
                  onRemove={(index) =>
                    p.removeFiles(latest.id, [index], latest.revision)
                  }
                  confirmationKey={latest.revision}
                  onRename={(index, value) =>
                    p.rename(latest, {
                      names: latest.files.map((file, i) =>
                        i === index ? value : file.name,
                      ),
                    })
                  }
                  disabled={p.renaming}
                  onPreview={(index) => setViewing({ record: latest, index })}
                />
                <p className="muted">{bytes(latest.size)}</p>
                <p className="muted">
                  {latest.oneTime
                    ? "1"
                    : latest.expires === null
                      ? "∞"
                      : date(latest.expires)}
                </p>
              </div>
            </AnimatedDetails>
          )}
          {(p.error || latest?.appendError) &&
            !(connectionError(p.error) && !p.upload) && (
              <ErrorNotice error={p.error || latest?.appendError} />
            )}
        </div>
      </section>
      {completed && <Expiry value={latest.expires} oneTime={latest.oneTime} />}
      {viewing && (
        <Suspense fallback={null}>
          {viewing.record.files[viewing.index].media ? (
            <MediaViewer
              token=""
              info={{
                ...viewing.record,
                ...viewing.record.files[viewing.index],
              }}
              source={
                "/api/transfers/" +
                viewing.record.id +
                "/media/" +
                viewing.index
              }
              download={
                "/api/transfers/" +
                viewing.record.id +
                "/media/" +
                viewing.index +
                "?download=1"
              }
              shareUrl={viewing.record.shareUrl || viewing.record.url}
              onClose={() => setViewing(null)}
            />
          ) : (
            <TextViewer
              token={new URL(viewing.record.url).pathname.split("/").pop()}
              shareUrl={viewing.record.shareUrl || viewing.record.url}
              index={viewing.index}
              info={{
                ...viewing.record,
                name: viewing.record.files[viewing.index].name,
                etag: `"${viewing.record.revision}"`,
              }}
              rawPath={
                "/api/transfers/" + viewing.record.id + "/text/" + viewing.index
              }
              downloadPath={
                "/api/transfers/" +
                viewing.record.id +
                "/text/" +
                viewing.index +
                "?download=1"
              }
              onClose={() => setViewing(null)}
              onUnavailable={() => {
                setViewing(null);
                p.refresh();
              }}
              onUnsupported={() => setViewing(null)}
              onEdit={
                viewing.record.preview
                  ? () => {
                      const record = viewing.record;
                      setViewing(null);
                      editText(record);
                    }
                  : undefined
              }
            />
          )}
        </Suspense>
      )}

      {historyOpen && (
        <History
          items={p.history}
          suspended={!!config}
          onClose={() => setHistoryOpen(false)}
          onDelete={p.remove}
          onRemoveFiles={p.removeFiles}
          onRemoveHistory={p.removeHistory}
          onEdit={editText}
          renaming={p.renaming}
          onRenameFile={(record, index, value) =>
            p.rename(record, {
              names: record.files.map((file, i) =>
                i === index ? value : file.name,
              ),
            })
          }
          onRenameTitle={(record, value) => p.rename(record, { title: value })}
          onGenerateTitle={(record, current) =>
            p
              .settingsApi(
                "/api/transfers/" +
                  record.id +
                  "/title-suggestion?current=" +
                  encodeURIComponent(current),
              )
              .then((result) => result.title)
          }
          onView={(record, index) => setViewing({ record, index })}
          uploading={!!p.upload || p.preparingUpload}
          onOpen={(item) => p.setSelected(item.id)}
          onSettings={(item) => setConfig(item.id)}
          onPublish={(item, published) =>
            p.settingsApi(
              "/api/transfers/" + item.id + "/settings",
              { published },
              "PATCH",
            )
          }
          onAdd={(id) => {
            appendTarget.current = id;
            input.current.click();
          }}
        />
      )}
    </main>
  );
}
