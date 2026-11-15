import React, { useEffect, useState } from "react";
import { FileList, bytes, date } from "./View.jsx";
export function Recipient({ token, api }) {
  const [info, setInfo] = useState(null),
    [password, setPassword] = useState(""),
    [error, setError] = useState("");
  const load = () =>
    api("/public/" + token)
      .then(setInfo)
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);
  return (
    <main className="recipient center">
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
            <label>
              Пароль передачи
              <input
                autoFocus
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                maxLength="256"
                required
              />
            </label>
            <button>Открыть</button>
          </form>
        ) : (
          info && (
            <>
              <FileList files={info.files} />
              <p className="muted">
                {bytes(info.size)} · Удаление: {date(info.expires)}
              </p>
              <div className="actions">
                <a href={"/public/" + token + "/download"}>
                  Скачать {info.files.length > 1 ? "ZIP" : "файл"}
                </a>
              </div>
            </>
          )
        )}
      </div>
    </main>
  );
}
