import React, { forwardRef, useImperativeHandle, useRef } from "react";
import { UI } from "../../../../shared/config.js";
import { copy } from "../../../../shared/copy.js";
import { AnimatedDetails } from "../../../shared/ui/Disclosure.jsx";
import { IconButton } from "../../../shared/ui/IconButton.jsx";
import { Icon } from "../../../shared/ui/Icons.jsx";
import { durations } from "../../../entities/transfer/index.js";
import { useUploadPassword } from "../model/useUploadPassword.js";
function Gear() {
  return <Icon name="settings" size={UI.settingsIconSize} />;
}
export const UploadMenu = forwardRef(function UploadMenu(
  {
    ttl,
    setTtl,
    secret,
    setSecret,
    upload,
    completed,
    onHistory,
    onNewText,
    onLogout,
  },
  ref,
) {
  const settings = useRef();
  useImperativeHandle(
    ref,
    () => ({
      close() {
        settings.current.open = false;
      },
    }),
    [],
  );
  const password = useUploadPassword({ upload, setSecret }),
    { passwordState } = password;
  const durationIndex = durations.findIndex(([value]) => value === ttl),
    duration = durations[durationIndex];
  return (
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
            onHistory();
          }}
        >
          <Icon name="history" />
        </IconButton>
        <IconButton
          hidden={completed}
          className="icon-button duration-button"
          aria-label={copy.retentionPrefix + duration[3]}
          title={duration[3] + copy.clickToChangeRetention}
          disabled={!!upload}
          onClick={() =>
            setTtl(durations[(durationIndex + 1) % durations.length][0])
          }
        >
          <span className="duration-value" key={ttl}>
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
                  : secret
                    ? copy.passwordSetHint
                    : copy.passwordGenerateHint
          }
          data-active={!!secret}
          aria-pressed={!!secret}
          disabled={!!upload}
          onClick={password.onClick}
          onDoubleClick={password.onDoubleClick}
          onKeyDown={password.onKeyDown}
        >
          <Icon
            name={
              passwordState === "failed"
                ? "cancel"
                : passwordState === "copied"
                  ? "check"
                  : secret
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
          disabled={!!upload}
          onClick={() => {
            settings.current.open = false;
            onNewText();
          }}
        >
          <Icon name="code" />
        </IconButton>
        <IconButton
          aria-label={copy.signOut}
          title={copy.signOut}
          onClick={onLogout}
        >
          <Icon name="logout" />
        </IconButton>
      </div>
    </AnimatedDetails>
  );
});
