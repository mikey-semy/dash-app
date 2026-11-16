import React, { useEffect } from "react";
import { Icon } from "./Icons.jsx";
export function ErrorNotice({ error, context = "interface" }) {
  useEffect(() => {
    if (error) console.error("[DU]", context, error);
  }, [error, context]);
  return error ? (
    <span className="error-notice" role="img" aria-label="Ошибка">
      <Icon name="cancel" />
    </span>
  ) : null;
}
export function ErrorPage({ error, status }) {
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
      <a className="unavailable" href="/" aria-label="Вернуться к загрузке">
        <span role="img" aria-label="Передача недоступна">
          <Icon name="cancel" />
        </span>
      </a>
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
