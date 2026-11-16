import React, { useState } from "react";
import { Icon } from "./Icons.jsx";
export function PasswordInput({
  label = "Пароль",
  submitLabel = "Войти",
  error,
  ...props
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="password-field login-field">
      <input
        {...props}
        aria-label={label}
        placeholder={label}
        type={visible ? "text" : "password"}
      />
      <button
        type="button"
        className="icon-button"
        aria-label={visible ? "Скрыть пароль" : "Показать пароль"}
        title={visible ? "Скрыть пароль" : "Показать пароль"}
        aria-pressed={visible}
        onClick={() => setVisible(!visible)}
      >
        <Icon name={visible ? "hidden" : "eye"} />
      </button>
      {error && (
        <span
          className="password-error"
          role="img"
          aria-label="Неверный пароль"
        >
          <Icon name="cancel" />
        </span>
      )}
      <button
        type="submit"
        className="icon-button"
        aria-label={submitLabel}
        title={submitLabel}
      >
        <Icon name="enter" />
      </button>
    </div>
  );
}
