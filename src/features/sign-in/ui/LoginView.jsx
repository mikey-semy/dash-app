import React, { useState } from "react";
import { PIN_DIGITS } from "../../../../shared/config.js";
import { PasswordInput } from "../../../shared/ui/PasswordInput.jsx";

export function LoginView({ error, onChange, onSubmit }) {
  const [password, setPassword] = useState("");
  return (
    <main className="center">
      <div className="login">
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            await onSubmit(password);
            setPassword("");
          }}
        >
          <PasswordInput
            error={error}
            autoComplete="current-password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              onChange();
            }}
            required
            maxLength={PIN_DIGITS}
            minLength={PIN_DIGITS}
            pattern={`[0-9]{${PIN_DIGITS}}`}
            inputMode="numeric"
          />
        </form>
      </div>
    </main>
  );
}
