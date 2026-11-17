import { Modal } from "#src/shared/ui/Modal.jsx";
import { TIMING } from "#common/config.js";
import { IconButton } from "#src/shared/ui/IconButton.jsx";
import { copy } from "#common/copy.js";
import { ErrorNotice } from "#src/shared/ui/Errors.jsx";
import { useEffect, useRef, useState } from "react";
import { Icon } from "#src/shared/ui/Icons.jsx";
import { Expiry } from "#src/entities/transfer/index.js";
import PublicationButton from "./PublicationButton.jsx";
import { durations } from "#src/entities/transfer/index.js";
import { generatePin } from "#src/shared/lib/password.js";
export default function TransferSettings({ transfer, api, onClose }) {
  const clickTimer = useRef();
  const [password, setPassword] = useState(null),
    [visible, setVisible] = useState(false),
    [busy, setBusy] = useState(false),
    [copied, setCopied] = useState(false),
    [error, setError] = useState("");
  const [domain, setDomain] = useState(transfer.domain || "");
  const savingDomain = useRef(false);
  useEffect(() => setDomain(transfer.domain || ""), [transfer.domain]);
  useEffect(() => {
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
    };
  }, [transfer.id]);
  useEffect(() => {
    if (copied) {
      const timer = setTimeout(() => setCopied(false), TIMING.feedback);
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
    const pin = generatePin();
    try {
      await navigator.clipboard.writeText(pin);
      if (await update({ password: pin })) setCopied(true);
    } catch {
      setError(copy.couldNotCopyTryAgain);
    }
  };
  const currentMode = transfer.oneTime ? -1 : transfer.ttl;
  const verifiedDomain =
    domain.trim() === (transfer.domain || "") &&
    transfer.domainState?.state === "ready";
  const duration =
    durations.find((item) => item[0] === currentMode) || durations[2];
  return (
    <Modal
      className="history-dialog transfer-settings-dialog"
      aria-label={copy.transferSettings}
      onClose={onClose}
    >
      {({ close }) => (
        <>
          <header className="dialog-header">
            <Icon name="settings" />
            <IconButton aria-label={copy.closeSettings} onClick={close}>
              <Icon name="cancel" />
            </IconButton>
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
                  <IconButton
                    aria-label={copy.reactVueRoutes}
                    aria-pressed={!!transfer.spa}
                    title={copy.spaRoutingHint}
                    disabled={busy}
                    onClick={() => update({ spa: !transfer.spa })}
                  >
                    <Icon name="route" />
                  </IconButton>
                </>
              )}
              <IconButton
                className="icon-button duration-button"
                disabled={busy}
                aria-label={copy.currentRetentionPrefix + duration[3]}
                title={copy.changeRetentionFromNow}
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
              </IconButton>
              {!transfer.oneTime && transfer.expires !== null && (
                <Expiry value={transfer.expires} className="expiry-inline" />
              )}
              <IconButton
                aria-label={copy.presentationWithoutControls}
                title={copy.showMediaAndTextWithoutDuControls}
                aria-pressed={!!transfer.demo}
                disabled={busy}
                onClick={() => update({ demo: !transfer.demo })}
              >
                <Icon name="presentation" />
              </IconButton>
            </div>
            <div className="password-field transfer-password">
              <input
                aria-label={copy.currentTransferPassword}
                type={visible ? "text" : "password"}
                readOnly
                value={password || ""}
                placeholder={transfer.hasPassword ? "••••••" : "—"}
              />
              <IconButton
                aria-label={visible ? copy.hidePassword : copy.showPassword}
                onClick={() => setVisible(!visible)}
              >
                <Icon name={visible ? "hidden" : "eye"} />
              </IconButton>
              <IconButton
                aria-label={copy.generateAndCopyTransferPassword}
                title={copied ? copy.copied : copy.passwordActionHint}
                disabled={busy}
                onClick={(event) => {
                  clearTimeout(clickTimer.current);
                  if (event.detail === 0) generate();
                  else if (event.detail === 1)
                    clickTimer.current = setTimeout(
                      generate,
                      TIMING.multiClick,
                    );
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
                  name={
                    copied ? "check" : transfer.hasPassword ? "lock" : "unlock"
                  }
                />
              </IconButton>
            </div>
            {transfer.hasPassword && password === null && (
              <p className="muted">{copy.legacyPasswordUnavailable}</p>
            )}
            {transfer.hasSite && (
              <div className="password-field domain-field">
                <input
                  aria-label={copy.siteDomain}
                  placeholder={copy.domainExample}
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
                  <IconButton
                    aria-label={copy.removeDomain}
                    disabled={busy}
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={() => {
                      setDomain("");
                      update({ domain: "" });
                    }}
                  >
                    <Icon name="cancel" />
                  </IconButton>
                )}
                <IconButton
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
                      ? copy.connectDomain
                      : copy.checkDomain
                  }
                  title={
                    verifiedDomain
                      ? copy.successfullyVerified
                      : copy.checkDnsAndHttps
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
                </IconButton>
              </div>
            )}
            {error && <ErrorNotice error={error} />}
          </div>
        </>
      )}
    </Modal>
  );
}
