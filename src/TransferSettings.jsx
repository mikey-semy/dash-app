import { ErrorNotice } from "./Errors.jsx";
import React, { useEffect, useRef, useState } from "react";
import { Icon, Expiry } from "./Icons.jsx";
import PublicationButton from "./PublicationButton.jsx";
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
  const [domain, setDomain] = useState(transfer.domain || "");
  const savingDomain = useRef(false);
  useEffect(() => setDomain(transfer.domain || ""), [transfer.domain]);
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
  const saveDomain = async (value = domain) => {
    if (savingDomain.current || busy) return;
    savingDomain.current = true;
    try {
      if (value.trim() !== (transfer.domain || ""))
        await update({ domain: value.trim() });
      else {
        setBusy(true);
        await api(
          "/api/transfers/" + transfer.id + "/domain-check",
          {},
          "POST",
        );
      }
    } catch (error) {
      setError(error.message);
    } finally {
      savingDomain.current = false;
      setBusy(false);
    }
  };
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
  const verifiedDomain =
    domain.trim() === (transfer.domain || "") &&
    transfer.domainState?.state === "ready";
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
          {transfer.hasSite && (
            <>
              <PublicationButton
                published={transfer.published}
                disabled={busy}
                onToggle={async (published) => {
                  await update({ published });
                }}
              />
              <button
                type="button"
                className="icon-button"
                aria-label="Маршруты React/Vue"
                aria-pressed={!!transfer.spa}
                title="Маршруты React/Vue: адреса вроде /profile открывает приложение из index.html"
                disabled={busy}
                onClick={() => update({ spa: !transfer.spa })}
              >
                <Icon name="route" />
              </button>
            </>
          )}
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
        {transfer.hasSite && (
          <div className="password-field domain-field">
            <input
              aria-label="Домен сайта"
              placeholder="example.com"
              value={domain}
              autoCapitalize="none"
              autoComplete="off"
              spellCheck={false}
              inputMode="url"
              disabled={busy}
              onChange={(event) => {
                setDomain(event.target.value);
                setError("");
              }}
              onBlur={(event) => {
                if (
                  !event.relatedTarget?.closest(".domain-field") &&
                  domain.trim() !== (transfer.domain || "")
                )
                  saveDomain();
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  saveDomain();
                } else if (event.key === "Escape") {
                  event.stopPropagation();
                  setDomain(transfer.domain || "");
                }
              }}
            />
            {domain && (
              <button
                type="button"
                className="icon-button"
                aria-label="Убрать домен"
                disabled={busy}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => {
                  setDomain("");
                  update({ domain: "" });
                }}
              >
                <Icon name="cancel" />
              </button>
            )}
            <button
              type="button"
              className={
                "icon-button " +
                (verifiedDomain
                  ? "domain-verified"
                  : transfer.domainState?.state === "error"
                    ? "edit-error"
                    : "")
              }
              disabled={busy}
              aria-label={
                domain.trim() !== (transfer.domain || "")
                  ? "Подключить домен"
                  : "Проверить домен"
              }
              title={
                verifiedDomain ? "Успешно проверено" : "Проверить DNS и HTTPS"
              }
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => saveDomain()}
            >
              <Icon
                name={
                  domain.trim() !== (transfer.domain || "")
                    ? "enter"
                    : transfer.domainState?.state === "ready"
                      ? "check"
                      : transfer.domainState?.state === "error"
                        ? "cancel"
                        : transfer.domain
                          ? "clock"
                          : "enter"
                }
              />
            </button>
          </div>
        )}
        {error && <ErrorNotice error={error} />}
      </div>
    </dialog>
  );
}
