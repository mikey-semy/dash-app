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
        <Icon name="upload" />
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
              {info.files.length ? (
                <>
                  {" "}
                  <a
                    className="primary-action"
                    aria-label="СКАЧАТЬ"
                    title="Скачать"
                    href={"/public/" + token + "/download"}
                  >
                    <Icon name="download" />
                  </a>
                </>
              ) : (
                <button
                  className="primary-action"
                  disabled
                  aria-label="СКАЧАТЬ"
                  title="В передаче пока нет файлов"
                >
                  <Icon name="download" />
                </button>
              )}
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
