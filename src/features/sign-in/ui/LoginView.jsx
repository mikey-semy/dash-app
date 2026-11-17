import { useState } from "react";
import { PasswordInput } from "#src/shared/ui/PasswordInput.jsx";

export function LoginView({ error, onChange, onSubmit }) {
  const [password, setPassword] = useState("");
  return (
    <main className="center">
      <div className="login">
        <form
          noValidate
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
            maxLength={256}
            inputMode="numeric"
          />
        </form>
      </div>
    </main>
  );
}
