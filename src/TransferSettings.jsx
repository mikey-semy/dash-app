import React, { useEffect, useRef, useState } from "react";
import { Icon, Expiry } from "./Icons.jsx";
export const durations = [
  [3600, "1", "ч", "1 час"],
  [21600, "6", "ч", "6 часов"],
  [86400, "24", "ч", "Сутки"],
  [259200, "3", "д", "3 дня"],
  [604800, "7", "д", "7 дней"],
  [0, "∞", "", "Бессрочно"],
  [-1, "1", "", "Одноразовая"],
];
export default function TransferSettings({ transfer, api, onClose }) {
  const clickTimer = useRef();
  const ref = useRef(),
    [password, setPassword] = useState(null),
    [visible, setVisible] = useState(false),
    [busy, setBusy] = useState(false),
    [copied, setCopied] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    ref.current.showModal();
    let active = true;
    api("/api/transfers/" + transfer.id + "/password")
      .then((value) => {
        if (active) setPassword(value.password);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
      ref.current?.close();
    };
  }, [transfer.id]);
  useEffect(() => {
    if (copied) {
      const timer = setTimeout(() => setCopied(false), 1500);
      return () => clearTimeout(timer);
    }
  }, [copied]);
  const update = async (patch) => {
    setBusy(true);
    setError("");
    try {
      await api("/api/transfers/" + transfer.id + "/settings", patch, "PATCH");
      if (patch.password !== undefined) setPassword(patch.password);
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => () => clearTimeout(clickTimer.current), []);
  const generate = async () => {
    const bytes = new Uint32Array(1);
    do {
      crypto.getRandomValues(bytes);
    } while (bytes[0] >= 4294000000);
    const pin = String(bytes[0] % 1000000).padStart(6, "0");
    try {
      await navigator.clipboard.writeText(pin);
      if (await update({ password: pin })) setCopied(true);
    } catch {
      setError("Не удалось скопировать. Повторите.");
    }
  };
  const currentMode = transfer.oneTime ? -1 : transfer.ttl;
  const duration =
    durations.find((item) => item[0] === currentMode) || durations[2];
  return (
    <dialog
      ref={ref}
      className="history-dialog transfer-settings-dialog"
      aria-label="Параметры передачи"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header className="dialog-header">
        <Icon name="settings" />
        <button
          type="button"
          className="icon-button"
          aria-label="Закрыть параметры"
          onClick={onClose}
        >
          <Icon name="cancel" />
        </button>
      </header>
      <div className="dialog-body">
        <div className="transfer-settings-controls">
          <button
            type="button"
            className="icon-button duration-button"
            disabled={busy}
            aria-label={"Срок текущей передачи: " + duration[3]}
            title="Сменить срок от текущего момента"
            onClick={() =>
              (() => {
                const next =
                  durations[
                    (durations.indexOf(duration) + 1) % durations.length
                  ][0];
                return update({
                  ttl: next === -1 ? 0 : next,
                  oneTime: next === -1,
                });
              })()
            }
          >
            <span className="duration-value">
              <span>{duration[1]}</span>
              <small>{duration[2]}</small>
            </span>
          </button>
          {!transfer.oneTime && transfer.expires !== null && (
            <Expiry value={transfer.expires} className="expiry-inline" />
          )}
          <button
            type="button"
            className="icon-button"
            aria-label="Демонстрация без интерфейса"
            title="Показать медиа и текст без панелей DU"
            aria-pressed={!!transfer.demo}
            disabled={busy}
            onClick={() => update({ demo: !transfer.demo })}
          >
            <Icon name="presentation" />
          </button>
        </div>
        <div className="password-field transfer-password">
          <input
            aria-label="Пароль текущей передачи"
            type={visible ? "text" : "password"}
            readOnly
            value={password || ""}
            placeholder={transfer.hasPassword ? "••••••" : "—"}
          />
          <button
            className="icon-button"
            type="button"
            aria-label={visible ? "Скрыть пароль" : "Показать пароль"}
            onClick={() => setVisible(!visible)}
          >
            <Icon name={visible ? "hidden" : "eye"} />
          </button>
          <button
            className="icon-button"
            type="button"
            aria-label="Сгенерировать и скопировать пароль передачи"
            title={
              copied
                ? "Скопировано"
                : "Клик — создать и скопировать, двойной — убрать"
            }
            disabled={busy}
            onClick={(event) => {
              clearTimeout(clickTimer.current);
              if (event.detail === 0) generate();
              else if (event.detail === 1)
                clickTimer.current = setTimeout(generate, 350);
            }}
            onDoubleClick={() => {
              clearTimeout(clickTimer.current);
              setCopied(false);
              update({ password: "" });
            }}
            onKeyDown={(event) => {
              if (event.key === "Delete" || event.key === "Backspace") {
                event.preventDefault();
                clearTimeout(clickTimer.current);
                setCopied(false);
                update({ password: "" });
              }
            }}
          >
            <Icon
              name={copied ? "check" : transfer.hasPassword ? "lock" : "unlock"}
            />
          </button>
        </div>
        {transfer.hasPassword && password === null && (
          <p className="muted">
            Старый пароль не сохранён. Можно создать новый.
          </p>
        )}
        {error && <p role="alert">{error}</p>}
      </div>
    </dialog>
  );
}
