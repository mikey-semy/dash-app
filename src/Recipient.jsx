import { AnimatedDetails } from "./Disclosure.jsx";
import { Icon } from "./Icons.jsx";
import { PasswordInput } from "./PasswordInput.jsx";
import React, {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Expiry } from "./Icons.jsx";
import { RecipientShare } from "./RecipientShare.jsx";
import { FileList, bytes, date } from "./View.jsx";
const TextViewer = lazy(() => import("./TextViewer.jsx"));
export function Recipient({ token, api }) {
  const [info, setInfo] = useState(null),
    [password, setPassword] = useState(""),
    [error, setError] = useState("");
  const [viewer, setViewer] = useState(null),
    [blocked, setBlocked] = useState(new Set());
  const automatic = useRef(false);
  const composition = JSON.stringify([
    info?.etag,
    info?.files?.map((f) => [f.name, f.size]),
  ]);
  const requestVersion = useRef(0);
  const [textUnavailable, setTextUnavailable] = useState(false);
  useEffect(() => setTextUnavailable(false), [token, info?.etag, info?.name]);
  useEffect(() => {
    document.title = info?.locked
      ? "Пароль передачи"
      : error
        ? "Передача недоступна"
        : viewer && info
          ? viewer.index === undefined
            ? info.name
            : info.files[viewer.index]?.name || info.name
          : info?.preview && !textUnavailable
            ? info.name
            : "Скачивание";
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
    if (!info || info.locked) {
      automatic.current = false;
      setViewer(null);
      return;
    }
    if (info.preview && !textUnavailable && !automatic.current) {
      automatic.current = true;
      setViewer({ index: undefined, version: composition });
    }
    setViewer((previous) => {
      if (!previous) return previous;
      if (previous.index === undefined)
        return info.preview && !textUnavailable ? previous : null;
      return previous.version === composition &&
        info.files[previous.index]?.preview
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
        };
  return (
    <main className="recipient center">
      <a
        className="upload-link"
        href="/"
        aria-label="Закрыть передачу"
        title="Закрыть передачу"
      >
        <Icon name="cancel" />
      </a>
      <div className="content">
        {error &&
          (info ? (
            <p role="alert">{error}</p>
          ) : (
            <div
              className="unavailable"
              role="img"
              aria-label="Передача недоступна"
            >
              <Icon name="cancel" />
            </div>
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
                setError(e.message);
              }
            }}
          >
            <PasswordInput
              label="Пароль передачи"
              submitLabel="Открыть"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              maxLength={256}
              required
            />
          </form>
        ) : (
          info && (
            <>
              {info.preview && !textUnavailable ? (
                <button
                  type="button"
                  className="primary-action"
                  aria-label="Открыть просмотр"
                  title="Просмотреть"
                  onClick={() => openFile(undefined)}
                >
                  <Icon name="eye" />
                </button>
              ) : info.files.length ? (
                <>
                  {" "}
                  <a
                    className="primary-action"
                    aria-label="СКАЧАТЬ"
                    title="Скачать"
                    href={"/public/" + token + "/download"}
                  >
                    <Icon name="download" />
                  </a>
                </>
              ) : (
                <button
                  className="primary-action"
                  disabled
                  aria-label="СКАЧАТЬ"
                  title="В передаче пока нет файлов"
                >
                  <Icon name="download" />
                </button>
              )}
              <AnimatedDetails
                className="transfer-details"
                label="Подробности передачи"
                summary={<Icon name="chevron" />}
              >
                <div className="transfer-information">
                  <FileList
                    files={info.files.map((file, index) => ({
                      ...file,
                      preview: file.preview && !blocked.has(index),
                    }))}
                    onPreview={openFile}
                  />
                  <p className="muted">{bytes(info.size)}</p>
                  {info.expires !== null && (
                    <p className="muted">
                      <time dateTime={new Date(info.expires).toISOString()}>
                        {date(info.expires)}
                      </time>
                    </p>
                  )}
                  <RecipientShare
                    url={new URL(location.pathname, location.origin).href}
                  />
                </div>
              </AnimatedDetails>
              <Expiry value={info.expires} />
            </>
          )
        )}
      </div>
      {viewer &&
        selected &&
        !info.locked &&
        (viewer.index === undefined
          ? info.preview && !textUnavailable
          : viewer.version === composition) && (
          <Suspense fallback={null}>
            <TextViewer
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
          </Suspense>
        )}
    </main>
  );
}
