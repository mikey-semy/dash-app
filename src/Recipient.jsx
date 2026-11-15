import { AnimatedDetails } from "./Disclosure.jsx";
import { Icon } from "./Icons.jsx";
import { PasswordInput } from "./PasswordInput.jsx";
import React, { useEffect, useState } from "react";
import { Expiry } from "./Icons.jsx";
import { FileList, bytes, date } from "./View.jsx";
export function Recipient({ token, api }) {
  const [info, setInfo] = useState(null),
    [password, setPassword] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    document.title = info?.locked
      ? "Пароль передачи"
      : error
        ? "Передача недоступна"
        : "Скачивание";
  }, [info, error]);
  const load = () =>
    api("/public/" + token)
      .then(setInfo)
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);
  return (
    <main className="recipient center">
      <a
        className="upload-link"
        href="/"
        aria-label="Перейти к загрузке"
        title="Перейти к загрузке"
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          aria-hidden="true"
        >
          <path d="M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6" />
        </svg>
      </a>
      <div className="content">
        {error && <p role="alert">{error}</p>}
        {info?.locked ? (
          <form
            className="login"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await api("/public/" + token + "/unlock", { password });
                setError("");
                load();
              } catch (e) {
                setError(e.message);
              }
            }}
          >
            <PasswordInput
              label="Пароль передачи"
              submitLabel="Открыть"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              maxLength={256}
              required
            />
          </form>
        ) : (
          info && (
            <>
              <a
                className="primary-action"
                aria-label="СКАЧАТЬ"
                title="Скачать"
                href={"/public/" + token + "/download"}
              >
                <Icon name="download" />
              </a>
              <AnimatedDetails
                className="transfer-details"
                label="Подробности передачи"
                summary={<Icon name="chevron" />}
              >
                <div className="transfer-information">
                  <FileList files={info.files} />
                  <p className="muted">{bytes(info.size)}</p>
                </div>
              </AnimatedDetails>
              <Expiry value={info.expires} />
            </>
          )
        )}
      </div>
    </main>
  );
}
