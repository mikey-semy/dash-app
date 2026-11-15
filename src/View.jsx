import React, { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
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
export function Share({ url, expires }) {
  const [qr, setQr] = useState(""),
    [copied, setCopied] = useState(false);
  useEffect(() => {
    QRCode.toDataURL(url, {
      margin: 1,
      width: 144,
      color: { dark: "#000000", light: "#ffffff" },
    }).then(setQr);
  }, [url]);
  return (
    <div className="share">
      <a href={url}>{url}</a>
      <div className="share-controls">
        <button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
        >
          {copied ? "Скопировано" : "Копировать"}
        </button>
        {qr && <img src={qr} alt="QR-код ссылки" width="96" height="96" />}
      </div>
      <p className="muted">Удаление: {date(expires)}</p>
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
function History({ items, onClose, onDelete }) {
  const ref = useRef();
  useEffect(() => {
    ref.current.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-label="История"
    >
      <div className="dialog-content">
        <div className="row">
          <h2>История</h2>
          <button onClick={onClose} aria-label="Закрыть историю">
            ×
          </button>
        </div>
        {!items.length && <p className="muted">Нет передач</p>}
        {items.map((t) => (
          <article className="transfer" key={t.id}>
            <div className="row">
              <span>
                {t.state === "ready" && t.expires <= Date.now()
                  ? "Срок истёк"
                  : states[t.state]}
              </span>
              {!["deleted", "deleting"].includes(t.state) && (
                <button onClick={() => onDelete(t.id)}>Удалить</button>
              )}
            </div>
            <p className="muted">
              {date(t.created)} · {bytes(t.size)}
            </p>
            <FileList files={t.files} />
            {t.error && <p role="alert">{t.error}</p>}
            {t.url ? (
              <Share url={t.url} expires={t.expires} />
            ) : t.expires ? (
              <p className="muted">Удаление: {date(t.expires)}</p>
            ) : (
              <p className="muted">Срок: {t.ttl / 3600} ч после готовности</p>
            )}
          </article>
        ))}
      </div>
    </dialog>
  );
}
export function OwnerView(p) {
  const [historyOpen, setHistoryOpen] = useState(false),
    input = useRef(),
    settings = useRef();
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
      <details className="settings" ref={settings}>
        <summary aria-label="Настройки">
          <Gear />
        </summary>
        <div className="settings-panel">
          <label>
            Хранить
            <select
              value={p.ttl}
              disabled={!!p.upload}
              onChange={(e) => p.setTtl(Number(e.target.value))}
            >
              {[
                [3600, "1 час"],
                [21600, "6 часов"],
                [86400, "Сутки"],
                [259200, "3 дня"],
                [604800, "7 дней"],
              ].map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label>
            Пароль скачивания
            <input
              type="password"
              placeholder="Необязательно"
              maxLength="256"
              disabled={!!p.upload}
              value={p.secret}
              onChange={(e) => p.setSecret(e.target.value)}
              autoComplete="new-password"
            />
          </label>
          <button
            onClick={() => {
              settings.current.open = false;
              setHistoryOpen(true);
            }}
          >
            История
          </button>
          <button onClick={p.logout}>Выйти</button>
        </div>
      </details>
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
              <Share url={latest.url} expires={latest.expires} />
              <button
                className="new-upload"
                onClick={() => p.setSelected(null)}
              >
                Добавить файлы
              </button>
            </>
          ) : preparing ? (
            <p>Сборка ZIP…</p>
          ) : (
            <button className="drop-text" onClick={() => input.current.click()}>
              Перетащите файлы сюда или нажмите для выбора
            </button>
          )}
          {p.error && <p role="alert">{p.error}</p>}
        </div>
      </section>
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
