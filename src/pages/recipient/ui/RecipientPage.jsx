import { FileTableHeader } from "#src/shared/ui/FileTableHeader.jsx";
import { useSelection } from "#src/shared/lib/useSelection.js";
import { useHistoryOverlay } from "#src/shared/lib/useHistoryOverlay.js";
import { IconButton } from "#src/shared/ui/IconButton.jsx";
import { copy } from "#common/copy.js";
import { ErrorNotice, ErrorPage } from "#src/shared/ui/Errors.jsx";
import { AnimatedDetails } from "#src/shared/ui/Disclosure.jsx";
import { Icon } from "#src/shared/ui/Icons.jsx";
import { PasswordInput } from "#src/shared/ui/PasswordInput.jsx";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Expiry, FileList } from "#src/entities/transfer/index.js";
import { RecipientShare } from "#src/features/share-transfer/index.js";
import { bytes, date } from "#src/shared/lib/format.js";
const DemoView = lazy(() => import("#src/widgets/file-viewer/demo.js"));
const MediaViewer = lazy(() => import("#src/widgets/file-viewer/media.js"));
const TextViewer = lazy(() => import("#src/widgets/file-viewer/text.js"));
export function Recipient({ token, api }) {
  const [info, setInfo] = useState(null),
    [password, setPassword] = useState(""),
    [error, setError] = useState("");
  const [viewer, setViewer] = useHistoryOverlay(),
    [blocked, setBlocked] = useState(new Set());
  const automatic = useRef(false);
  const composition = JSON.stringify([
    info?.etag,
    info?.files?.map((f) => [f.name, f.size]),
  ]);
  const { selection: fileSelection, toggle: toggleFile } = useSelection({
    resetKey: composition,
  });
  const requestVersion = useRef(0);
  const [textUnavailable, setTextUnavailable] = useState(false);
  useEffect(() => setTextUnavailable(false), [token, info?.etag, info?.name]);
  useEffect(() => {
    document.title =
      info?.demo && !info.locked
        ? info.title ||
          (info.files.length === 1 ? info.files[0].name : copy.presentation)
        : info?.locked
          ? copy.transferPassword
          : error
            ? copy.transferUnavailable
            : viewer && info
              ? viewer.index === undefined
                ? info.name
                : info.files[viewer.index]?.name || info.name
              : info?.preview && !textUnavailable
                ? info.name
                : copy.download;
  }, [info, error, textUnavailable, viewer]);
  const load = useCallback(
    async (background = false) => {
      const version = ++requestVersion.current;
      try {
        const result = await api("/public/" + token);
        if (version !== requestVersion.current) return;
        setInfo(result);
        setError("");
      } catch (e) {
        if (version !== requestVersion.current) return;
        if (e.status === 404) {
          setInfo(null);
          setError(e.message);
        } else if (!background) setError(e.message);
      }
    },
    [api, token],
  );
  useEffect(() => {
    load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") load(true);
    }, 5000);
    const refresh = () => {
      if (document.visibilityState === "visible") load(true);
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      requestVersion.current++;
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);
  useEffect(() => {
    setBlocked(new Set());
  }, [composition]);
  useEffect(() => {
    setViewer(null);
    automatic.current = false;
  }, [info?.demo]);
  useEffect(() => {
    if (!info || info.locked) {
      automatic.current = false;
      setViewer(null);
      return;
    }
    const requested = new URLSearchParams(location.search).get("file");
    const requestedIndex = requested
      ? info.files.findIndex((file) => file.name === requested)
      : -1;
    if (requested && !automatic.current) {
      automatic.current = true;
      if (
        requestedIndex >= 0 &&
        (info.files[requestedIndex].preview || info.files[requestedIndex].media)
      )
        setViewer({ index: requestedIndex, version: composition });
      else setError(copy.fileNotFound);
    }
    setViewer((previous) => {
      if (!previous) return previous;
      if (previous.index === undefined)
        return info.media || (info.preview && !textUnavailable)
          ? previous
          : null;
      return previous.version === composition &&
        (info.files[previous.index]?.preview ||
          info.files[previous.index]?.media)
        ? previous
        : null;
    });
  }, [info, composition, textUnavailable]);
  const openFile = (index) => setViewer({ index, version: composition });
  const selected =
    viewer?.index === undefined
      ? info
      : info && {
          ...info,
          name: info.files[viewer.index]?.name,
          size: info.files[viewer.index]?.size,
          media: info.files[viewer.index]?.media,
        };
  if (error && !info) return <ErrorPage error={error} />;
  if (info?.demo && !info.locked && (!info.hasSite || info.published))
    return (
      <Suspense fallback={null}>
        <DemoView token={token} info={info} onUnavailable={() => load(true)} />
      </Suspense>
    );
  return (
    <main className="recipient center">
      <a
        className="upload-link"
        href="/"
        aria-label={copy.closeTransfer}
        title={copy.closeTransfer}
      >
        <Icon name="cancel" />
      </a>
      <div className="content">
        {error &&
          !info?.locked &&
          (info && !info.locked ? (
            <ErrorNotice error={error} />
          ) : (
            <a
              href="/"
              className="unavailable"
              aria-label={copy.backToUpload}
              title={copy.backToUpload}
            >
              <span role="img" aria-label={copy.transferUnavailable}>
                <Icon name="cancel" />
              </span>
            </a>
          ))}
        {info?.locked ? (
          <form
            className="login"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await api("/public/" + token + "/unlock", { password });
                setError("");
                load();
              } catch (e) {
                setPassword("");
                setError(e.message);
              }
            }}
          >
            <PasswordInput
              error={error}
              label={copy.transferPassword}
              submitLabel={copy.open}
              autoFocus
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError("");
              }}
              maxLength={256}
              required
            />
          </form>
        ) : (
          info && (
            <>
              {info.media || (info.preview && !textUnavailable) ? (
                <button
                  type="button"
                  className="primary-action"
                  aria-label={copy.openPreview}
                  title={copy.preview}
                  onClick={() => openFile(undefined)}
                >
                  <Icon name="eye" />
                </button>
              ) : info.files.length ? (
                <>
                  {" "}
                  <a
                    className="primary-action"
                    aria-label={copy.downloadAction}
                    title={copy.download}
                    href={"/public/" + token + "/download"}
                  >
                    <Icon name="download" />
                  </a>
                </>
              ) : (
                <button
                  className="primary-action"
                  disabled
                  aria-label={copy.downloadAction}
                  title={copy.thisTransferHasNoFilesYet}
                >
                  <Icon name="download" />
                </button>
              )}
              <AnimatedDetails
                className="transfer-details"
                label={copy.transferDetails}
                summary={<Icon name="chevron" />}
                heading={
                  <div className="transfer-heading">
                    <span
                      className="transfer-name"
                      title={info.title || info.name}
                    >
                      {info.title || info.name}
                    </span>
                  </div>
                }
              >
                <FileTableHeader
                  className="recipient-file-header"
                  actions={
                    <>
                      {info.files.length > 1 && (
                        <div className="file-selection-actions recipient-selection-actions">
                          <form
                            method="get"
                            action={"/public/" + token + "/selection"}
                          >
                            <input
                              type="hidden"
                              name="indices"
                              value={JSON.stringify([...fileSelection])}
                            />
                            <IconButton
                              type="submit"

                              disabled={!fileSelection.size}
                              aria-label={copy.downloadSelectedFiles}
                              title={copy.downloadSelection}
                            >
                              <Icon name="download" />
                            </IconButton>
                          </form>
                        </div>
                      )}
                    </>
                  }
                />
                <div className="transfer-information">
                  <FileList
                    selection={
                      info.files.length > 1 ? fileSelection : undefined
                    }
                    onToggle={toggleFile}
                    downloadPath={(i) =>
                      "/public/" + token + "/files/" + i + "/download"
                    }
                    files={info.files.map((file, index) => ({
                      ...file,
                      preview: file.preview && !blocked.has(index),
                    }))}
                    onPreview={openFile}
                  />
                  <p className="muted">{bytes(info.size)}</p>
                  {info.oneTime ? (
                    <p className="muted">1</p>
                  ) : (
                    info.expires !== null && (
                      <p className="muted">
                        <time dateTime={new Date(info.expires).toISOString()}>
                          {date(info.expires)}
                        </time>
                      </p>
                    )
                  )}
                </div>
                <RecipientShare
                  url={
                    info.shareUrl ||
                    new URL(location.pathname, location.origin).href
                  }
                />
              </AnimatedDetails>
              <Expiry value={info.expires} oneTime={info.oneTime} />
            </>
          )
        )}
      </div>
      {viewer &&
        selected &&
        !info.locked &&
        (viewer.index === undefined
          ? info.media || (info.preview && !textUnavailable)
          : viewer.version === composition) && (
          <Suspense fallback={null}>
            {selected.media ? (
              <MediaViewer
                shareUrl={info.shareUrl}
                token={token}
                info={selected}
                index={viewer.index}
                onClose={() => setViewer(null)}
              />
            ) : (
              <TextViewer
                shareUrl={info.shareUrl}
                token={token}
                info={selected}
                index={viewer.index}
                onClose={() => setViewer(null)}
                onUnavailable={() => load(true)}
                onUnsupported={() => {
                  if (viewer.index === undefined) setTextUnavailable(true);
                  else
                    setBlocked(
                      (previous) => new Set([...previous, viewer.index]),
                    );
                  setViewer(null);
                }}
              />
            )}
          </Suspense>
        )}
    </main>
  );
}
