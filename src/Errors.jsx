import React, { useEffect } from "react";
import { Icon } from "./Icons.jsx";
export const connectionError = (error) =>
  /связаться с сервером|соединени.*прерван|временно недоступна|failed to fetch|network|load failed/i.test(
    error?.message || error || "",
  ) || error?.status >= 500;
export function ErrorNotice({ error, context = "interface" }) {
  useEffect(() => {
    if (error) console.error("[DU]", context, error);
  }, [error, context]);
  return error && connectionError(error) ? (
    <button
      type="button"
      className="icon-button error-notice"
      aria-label="Перезагрузить страницу"
      onClick={() => location.reload()}
    >
      <Icon name="reload" />
    </button>
  ) : error ? (
    <span className="error-notice" role="img" aria-label="Ошибка">
      <Icon name="cancel" />
    </span>
  ) : null;
}
export function ErrorPage({ error, status }) {
  const retry = connectionError(error) || status >= 500;
  useEffect(() => {
    document.title = "Ошибка";
    console.error(
      "[DU]",
      status || "Error",
      location.pathname,
      error || "Страница недоступна",
    );
    if (status)
      fetch(location.href, { headers: { Accept: "application/json" } })
        .then(async (response) =>
          console.error(
            "[DU] HTTP",
            response.status,
            location.pathname,
            await response.text(),
          ),
        )
        .catch((error) => console.error("[DU]", error));
  }, [error, status]);
  return (
    <main className="center">
      {retry ? (
        <button
          type="button"
          className="icon-button unavailable"
          aria-label="Перезагрузить страницу"
          onClick={() => location.reload()}
        >
          <Icon name="reload" />
        </button>
      ) : (
        <a className="unavailable" href="/" aria-label="Вернуться к загрузке">
          <span role="img" aria-label="Передача недоступна">
            <Icon name="cancel" />
          </span>
        </a>
      )}
    </main>
  );
}
export class ErrorBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error("[DU] render", error, info.componentStack);
  }
  componentDidMount() {
    this.failure = (event) =>
      this.setState({
        error:
          event.error ||
          event.reason ||
          new Error(event.message || "Необработанная ошибка"),
      });
    window.addEventListener("error", this.failure);
    window.addEventListener("unhandledrejection", this.failure);
  }
  componentWillUnmount() {
    window.removeEventListener("error", this.failure);
    window.removeEventListener("unhandledrejection", this.failure);
  }
  render() {
    return this.state.error ? (
      <ErrorPage error={this.state.error} />
    ) : (
      this.props.children
    );
  }
}
