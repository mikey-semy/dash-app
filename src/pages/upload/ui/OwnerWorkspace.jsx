import { createTransferCommands } from "#src/features/manage-transfer/commands.js";
import { UploadMenu } from "./UploadMenu.jsx";
import {
  CurrentTransferActions,
  CurrentTransferDetails,
} from "./CurrentTransfer.jsx";
import { UploadProgress } from "./UploadProgress.jsx";
import { DropZones, PasteDestinations } from "./DropZones.jsx";
import { useHistoryPage } from "../model/useHistoryPage.js";
import { useHistoryOverlay } from "#src/shared/lib/useHistoryOverlay.js";
import { useFileIntake } from "../model/useFileIntake.js";
import { IconButton } from "#src/shared/ui/IconButton.jsx";
import { copy } from "#common/copy.js";
import { ErrorNotice, connectionError } from "#src/shared/ui/Errors.jsx";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
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
  const commands = createTransferCommands({
    rename: p.rename,
    removeFiles: p.removeFiles,
    api: p.settingsApi,
  });
  const [draft, setDraft] = useState(null),
    [folders, setFolders] = useState(null),
    [config, setConfig] = useState(null),
    [opening, setOpening] = useState(false),
    [editorError, setEditorError] = useState(""),
    [viewing, setViewing] = useHistoryOverlay(),
    [historyOpen, setHistoryOpen] = useHistoryPage(),
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
  const receiveFiles = (source, parentId = null) => {
    if (source.folders) setFolders({ ...source, parentId });
    else p.choose(source.files, parentId);
  };
  const openText = (text = "", parentId = null) => {
    settings.current.close();
    setDraft({ text, parentId });
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
  const {
    dropZone,
    dropHandlers,
    pendingPaste,
    canAppendPaste,
    choosePaste,
    cancelPaste,
  } = useFileIntake({
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
    onText: openText,
  });
  return (
    <main {...dropHandlers} className={p.drag ? "owner dragging" : "owner"}>
      <DropZones active={p.drag} zone={dropZone} canAppend={!!completed} />
      {pendingPaste && (
        <PasteDestinations
          canAppend={canAppendPaste}
          onChoose={choosePaste}
          onClose={cancelPaste}
        />
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
      <UploadMenu
        ref={settings}
        ttl={p.ttl}
        setTtl={p.setTtl}
        secret={p.secret}
        setSecret={p.setSecret}
        upload={p.upload}
        completed={!!completed}
        onHistory={() => setHistoryOpen(true)}
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
              draft.id
                ? p.replaceText(files, draft)
                : p.choose(files, draft.parentId)
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
                onAddText={() => openText("", latest.id)}
                onDelete={p.remove}
                onSettings={setConfig}
                onEdit={editText}
                onPublish={commands.setPublished}
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
            <div className="new-transfer-actions">
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
              <button
                className="primary-action"
                aria-label={copy.newTextTransfer}
                title={copy.newTextTransfer}
                onClick={() => openText()}
              >
                <Icon name="code" />
              </button>
            </div>
          )}
          {completed && !connectionError(p.error) && (
            <CurrentTransferDetails
              transfer={latest}
              renaming={p.renaming}
              onRenameTitle={commands.renameTitle}
              onRenameFile={commands.renameFile}
              onGenerateTitle={commands.suggestTitle}
              onRemoveFiles={commands.removeFiles}
              onPreview={(record, index) => setViewing({ record, index })}
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
          suspended={!!config || !!viewing || !!draft || !!folders}
          onClose={() => setHistoryOpen(false)}
          onDelete={p.remove}
          onRemoveFiles={commands.removeFiles}
          onRemoveHistory={p.removeHistory}
          onEdit={editText}
          renaming={p.renaming}
          onRenameFile={commands.renameFile}
          onRenameTitle={commands.renameTitle}
          onGenerateTitle={commands.suggestTitle}
          onView={(record, index) => setViewing({ record, index })}
          uploading={!!p.upload || p.preparingUpload}
          onOpen={(item) => p.setSelected(item.id)}
          onSettings={(item) => setConfig(item.id)}
          onPublish={commands.setPublished}
          onAdd={(id) => {
            appendTarget.current = id;
            input.current.click();
          }}
        />
      )}
    </main>
  );
}
