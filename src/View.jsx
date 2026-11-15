import { Disclosure, AnimatedDetails } from "./Disclosure.jsx";
import React, { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Icon, CopyButton, Expiry } from "./Icons.jsx";
export const bytes = (n) =>
  n < 1000
    ? Math.round(n) + " Б"
    : new Intl.NumberFormat("ru", { maximumFractionDigits: 1 }).format(
        n / (n >= 1e9 ? 1e9 : n >= 1e6 ? 1e6 : 1e3),
      ) +
      " " +
      (n >= 1e9 ? "ГБ" : n >= 1e6 ? "МБ" : "КБ");
export const date = (n) => new Date(n).toLocaleString("ru-RU");
export function FileList({ files }) {
  return (
    <ul className="files">
      {files.map((f, i) => (
        <li key={i}>
          <span>{f.name}</span>
          <small>{bytes(f.size)}</small>
        </li>
      ))}
    </ul>
  );
}
export function Share({ url, onAdd, onDelete }) {
  const [qr, setQr] = useState(""),
    [open, setOpen] = useState(false);
  useEffect(() => {
    if (open && url)
      QRCode.toDataURL(url, {
        margin: 1,
        width: 144,
        color: { dark: "#111111", light: "#ffffff" },
      }).then(setQr);
  }, [url, open]);
  return (
    <div className={onAdd ? "share share-ready" : "share"}>
      {onAdd && (
        <button
          className="primary-action"
          onClick={onAdd}
          aria-label="Добавить"
          title="Добавить"
        >
          <Icon name="add" />
        </button>
      )}
      <div className="share-controls">
        <button
          type="button"
          className="icon-button"
          aria-label="QR-код"
          title="QR-код"
          disabled={!url}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <Icon name="qr" />
        </button>
        <CopyButton value={url} />
        <button
          type="button"
          className="icon-button"
          aria-label="Удалить"
          title="Удалить"
          disabled={!onDelete}
          onClick={onDelete}
        >
          <Icon name="delete" />
        </button>
        {qr && (
          <div
            className={"qr-popover " + (open ? "is-open" : "")}
            aria-hidden={!open}
            inert={!open}
          >
            <img src={qr} alt="QR-код ссылки" width="128" height="128" />
          </div>
        )}
      </div>
    </div>
  );
}
const states = {
  uploading: "Загрузка",
  queued: "В очереди",
  archiving: "Сборка ZIP",
  ready: "Готово",
  failed: "Ошибка архивации",
  deleting: "Удаление",
  deleted: "Удалено",
};
function Gear() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      aria-hidden="true"
    >
      <path d="m9.5 3-.7 2.2-1.6.9L5 5.6 2.5 10l1.5 1.7v1.8L2.5 15 5 19.4l2.2-.5 1.6.9.7 2.2h5l.7-2.2 1.6-.9 2.2.5 2.5-4.4-1.5-1.5v-1.8l1.5-1.7L19 5.6l-2.2.5-1.6-.9L14.5 3z" />
      <circle cx="12" cy="12.5" r="3" />
    </svg>
  );
}
function HistoryItem({ transfer: t, onDelete }) {
  const [open, setOpen] = useState(false);
  return (
    <article className="history-item">
      <div className="history-row">
        <button
          className="history-toggle"
          aria-label={"Передача " + date(t.created)}
          aria-expanded={open}
          aria-controls={"history-" + t.id}
          onClick={() => setOpen(!open)}
        >
          <span>
            <time>{date(t.created)}</time>
            <small key={t.state}>
              {t.state === "ready" && t.expires <= Date.now()
                ? "Срок истёк"
                : states[t.state]}
            </small>
          </span>
          <span className={open ? "chevron expanded" : "chevron"}>
            <Icon name="chevron" />
          </span>
        </button>
        <Share
          url={t.url}
          onDelete={
            ["deleted", "deleting"].includes(t.state)
              ? undefined
              : () => onDelete(t.id)
          }
        />
      </div>
      <Disclosure open={open} id={"history-" + t.id}>
        <section className="history-information">
          <FileList files={t.files} />
          <p className="muted">{bytes(t.size)}</p>
          {t.error && <p role="alert">{t.error}</p>}
          <p className="muted">
            {t.expires
              ? date(t.expires)
              : "Срок: " + t.ttl / 3600 + " ч после готовности"}
          </p>
        </section>
      </Disclosure>
    </article>
  );
}
function History({ items, onClose, onDelete }) {
  const ref = useRef(),
    timer = useRef(),
    [closing, setClosing] = useState(false);
  const close = () => {
    if (closing) return;
    setClosing(true);
    timer.current = setTimeout(
      onClose,
      matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 180,
    );
  };
  useEffect(() => {
    ref.current.showModal();
    document.title = "История";
    return () => {
      clearTimeout(timer.current);
      ref.current?.close();
      document.title = "Загрузка";
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="history-dialog"
      data-closing={closing}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      aria-label="История"
    >
      <header className="dialog-header">
        <h2>История</h2>
        <button
          className="icon-button"
          onClick={close}
          aria-label="Закрыть историю"
          title="Закрыть историю"
        >
          ×
        </button>
      </header>
      <div className="dialog-body">
        {!items.length && <p className="muted">Нет передач</p>}
        {items.map((t) => (
          <HistoryItem key={t.id} transfer={t} onDelete={onDelete} />
        ))}
      </div>
    </dialog>
  );
}
export function OwnerView(p) {
  const [historyOpen, setHistoryOpen] = useState(false),
    [passwordState, setPasswordState] = useState("idle"),
    input = useRef(),
    settings = useRef();
  useEffect(() => {
    if (passwordState === "copied") {
      const timer = setTimeout(() => setPasswordState("idle"), 1600);
      return () => clearTimeout(timer);
    }
  }, [passwordState]);
  const durations = [
    [3600, "1", "ч", "1 час"],
    [21600, "6", "ч", "6 часов"],
    [86400, "24", "ч", "Сутки"],
    [259200, "3", "д", "3 дня"],
    [604800, "7", "д", "7 дней"],
  ];
  const durationIndex = durations.findIndex(([value]) => value === p.ttl),
    duration = durations[durationIndex];
  const latest = p.history.find((t) => t.id === p.selected);
  const completed = !p.upload && latest?.state === "ready" && latest.url;
  const preparing =
    !p.upload && ["queued", "archiving"].includes(latest?.state);
  const speed = p.elapsed ? p.progress / p.elapsed : 0,
    eta = speed ? Math.max(0, (p.upload?.total - p.progress) / speed) : 0;
  return (
    <main
      onDragOver={(e) => {
        e.preventDefault();
        if (!p.upload) p.setDrag(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) p.setDrag(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        p.setDrag(false);
        if (!p.upload) p.choose(e.dataTransfer.files);
      }}
      className={p.drag ? "dragging" : ""}
      onPaste={(e) => {
        if (e.clipboardData.files.length && !p.upload)
          p.choose(e.clipboardData.files);
      }}
    >
      <AnimatedDetails
        className="settings"
        ref={settings}
        label="Настройки"
        summary={<Gear />}
      >
        <div className="settings-panel settings-toolbar">
          <button
            className="icon-button"
            aria-label="История"
            title="История"
            onClick={() => {
              settings.current.open = false;
              setHistoryOpen(true);
            }}
          >
            <Icon name="history" />
          </button>
          <button
            type="button"
            className="icon-button duration-button"
            aria-label={"Срок хранения: " + duration[3]}
            title={duration[3] + ". Нажмите, чтобы сменить срок"}
            disabled={!!p.upload}
            onClick={() =>
              p.setTtl(durations[(durationIndex + 1) % durations.length][0])
            }
          >
            <span className="duration-value" key={p.ttl}>
              <span>{duration[1]}</span>
              <small>{duration[2]}</small>
            </span>
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Сгенерировать и скопировать пароль"
            title={
              passwordState === "copied"
                ? "Пароль скопирован"
                : passwordState === "failed"
                  ? "Не удалось скопировать. Повторить"
                  : p.secret
                    ? "Пароль установлен. Сгенерировать новый и скопировать"
                    : "Сгенерировать и скопировать пароль"
            }
            data-active={!!p.secret}
            disabled={!!p.upload}
            onClick={async () => {
              const a = new Uint32Array(1);
              do {
                crypto.getRandomValues(a);
              } while (a[0] >= 4294000000);
              const pin = String(a[0] % 1000000).padStart(6, "0");
              try {
                await navigator.clipboard.writeText(pin);
                p.setSecret(pin);
                setPasswordState("copied");
              } catch {
                setPasswordState("failed");
              }
            }}
          >
            <Icon
              name={
                passwordState === "copied"
                  ? "check"
                  : passwordState === "failed"
                    ? "warning"
                    : "generate"
              }
            />
            <span className="sr-only" role="status">
              {passwordState === "copied"
                ? "Пароль скопирован"
                : passwordState === "failed"
                  ? "Не удалось скопировать пароль"
                  : ""}
            </span>
          </button>
          <button
            className="icon-button"
            aria-label="Выйти"
            title="Выйти"
            onClick={p.logout}
          >
            <Icon name="logout" />
          </button>
        </div>
      </AnimatedDetails>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          p.choose(e.target.files);
          e.target.value = "";
        }}
      />
      <section className="center">
        <div className="content">
          {p.upload ? (
            <>
              <FileList files={p.upload.files} />
              <progress value={p.progress} max={p.upload.total || 1} />
              <p className="muted">
                {bytes(p.progress)} / {bytes(p.upload.total)} · {bytes(speed)}/с
              </p>
              <p className="muted">
                Прошло: {Math.round(p.elapsed)} с · осталось ≈ {Math.round(eta)}{" "}
                с
              </p>
              <div className="actions">
                <button
                  disabled={p.paused && p.running}
                  onClick={() => (p.paused ? p.run(p.upload) : p.pause())}
                >
                  {p.paused ? "Продолжить" : "Пауза"}
                </button>
                <button onClick={p.cancel}>Отменить</button>
              </div>
            </>
          ) : completed ? (
            <>
              <Share
                url={latest.url}
                onAdd={() => p.setSelected(null)}
                onDelete={() => p.remove(latest.id)}
              />
            </>
          ) : preparing ? (
            <p>Сборка ZIP…</p>
          ) : (
            <button
              className="primary-action"
              aria-label="ЗАГРУЗИТЬ"
              title="Загрузить"
              onClick={() => input.current.click()}
            >
              <Icon name="upload" />
            </button>
          )}
          {p.error && <p role="alert">{p.error}</p>}
        </div>
      </section>
      {completed && <Expiry value={latest.expires} />}
      {historyOpen && (
        <History
          items={p.history}
          onClose={() => setHistoryOpen(false)}
          onDelete={p.remove}
        />
      )}
    </main>
  );
}
