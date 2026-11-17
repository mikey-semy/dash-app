import { UploadMenu } from "./UploadMenu.jsx";
import {
  CurrentTransferActions,
  CurrentTransferDetails,
} from "./CurrentTransfer.jsx";
import { UploadProgress } from "./UploadProgress.jsx";
import { DropZones } from "./DropZones.jsx";
import { useFileIntake } from "../model/useFileIntake.js";
import { IconButton } from "#src/shared/ui/IconButton.jsx";
import { copy } from "#common/copy.js";
import { ErrorNotice, connectionError } from "#src/shared/ui/Errors.jsx";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { captureFiles } from "#src/features/upload-files/index.js";
const FolderUpload = lazy(() => import("#src/features/upload-files/review.js"));
import { Icon } from "#src/shared/ui/Icons.jsx";
import { Expiry } from "#src/entities/transfer/index.js";
const TextComposer = lazy(() => import("#src/features/compose-text/index.js"));
const MediaViewer = lazy(() => import("#src/widgets/file-viewer/media.js"));
const TransferSettings = lazy(
  () => import("#src/features/manage-transfer/index.js"),
);
const TextViewer = lazy(() => import("#src/widgets/file-viewer/text.js"));
import History from "#src/widgets/history/index.js";
export function OwnerView(p) {
  const [draft, setDraft] = useState(null),
    [folders, setFolders] = useState(null),
    [config, setConfig] = useState(null),
    [opening, setOpening] = useState(false),
    [editorError, setEditorError] = useState(""),
    [viewing, setViewing] = useState(null),
    [historyOpen, setHistoryOpen] = useState(false),
    input = useRef(),
    appendTarget = useRef(null),
    settings = useRef(),
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
  const receiveFiles = (data, parentId = null) => {
    const source = captureFiles(data);
    if (source.folders) setFolders({ ...source, parentId });
    else p.choose(source.files, parentId);
  };
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
  const { dropZone, dropHandlers } = useFileIntake({
    upload: p.upload,
    preparingUpload: p.preparingUpload,
    preparing,
    completed,
    latest,
    historyOpen,
    draft,
    folders,
    config,
    viewing,
    setViewing,
    setHistoryOpen,
    setSelected: p.setSelected,
    setDrag: p.setDrag,
    receiveFiles,
    onText: (text) => {
      settings.current.close();
      setDraft({ text });
    },
  });
  return (
    <main {...dropHandlers} className={p.drag ? "owner dragging" : "owner"}>
      <DropZones active={p.drag} zone={dropZone} canAppend={!!completed} />
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
      <UploadMenu
        ref={settings}
        ttl={p.ttl}
        setTtl={p.setTtl}
        secret={p.secret}
        setSecret={p.setSecret}
        upload={p.upload}
        completed={!!completed}
        onHistory={() => setHistoryOpen(true)}
        onNewText={() => setDraft({ text: "" })}
        onLogout={p.logout}
      />
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
              <UploadProgress
                upload={p.upload}
                elapsed={p.elapsed}
                progress={p.progress}
                paused={p.paused}
                running={p.running}
                onResume={p.run}
                onPause={p.pause}
                onCancel={p.cancel}
                onSelectFiles={() => input.current.click()}
              />
            </>
          ) : completed ? (
            <>
              <CurrentTransferActions
                transfer={latest}
                opening={opening}
                editFailed={editorError === latest.id}
                onAdd={() => {
                  appendTarget.current = latest.id;
                  input.current.click();
                }}
                onDelete={p.remove}
                onSettings={setConfig}
                onEdit={editText}
                settingsApi={p.settingsApi}
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
            <CurrentTransferDetails
              transfer={latest}
              renaming={p.renaming}
              onRename={p.rename}
              onRemoveFiles={p.removeFiles}
              onPreview={(record, index) => setViewing({ record, index })}
              settingsApi={p.settingsApi}
            />
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
