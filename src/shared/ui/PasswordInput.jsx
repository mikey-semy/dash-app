import { IconButton } from "./IconButton.jsx";
import { copy } from "#common/copy.js";
import { useState } from "react";
import { Icon } from "./Icons.jsx";
export function PasswordInput({
  label = copy.password,
  submitLabel = copy.signIn,
  error,
  ...props
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="password-field login-field">
      {error && (
        <span
          className="password-error"
          role="img"
          aria-label={copy.incorrectPassword}
        >
          <Icon name="cancel" />
        </span>
      )}
      <input
        {...props}
        aria-label={label}
        placeholder={label}
        type={visible ? "text" : "password"}
      />
      <IconButton
        aria-label={visible ? copy.hidePassword : copy.showPassword}
        title={visible ? copy.hidePassword : copy.showPassword}
        aria-pressed={visible}
        onClick={() => setVisible(!visible)}
      >
        <Icon name={visible ? "hidden" : "eye"} />
      </IconButton>
      <IconButton
        type="submit"

        aria-label={submitLabel}
        title={submitLabel}
      >
        <Icon name="enter" />
      </IconButton>
    </div>
  );
}
