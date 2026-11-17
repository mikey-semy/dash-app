import { IconButton } from "./IconButton.jsx";
import { copy } from "#common/copy.js";
import { Component, useEffect } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icons.jsx";
export const connectionError = (error) =>
  /could not connect|connection.*interrupted|temporarily unavailable|failed to fetch|network|load failed/i.test(
    error?.message || error || "",
  ) || error?.status >= 500;
export function ErrorNotice({ error, context = "interface" }) {
  useEffect(() => {
    if (error) console.error("[DU]", context, error);
  }, [error, context]);
  const content =
    error && connectionError(error) ? (
      <IconButton
        className="icon-button error-notice"
        aria-label={copy.reloadPage}
        onClick={() => location.reload()}
      >
        <Icon name="reload" />
      </IconButton>
    ) : error ? (
      <span className="error-notice" role="img" aria-label={copy.error}>
        <Icon name="cancel" />
      </span>
    ) : null;
  return content
    ? createPortal(
        content,
        Array.from(document.querySelectorAll("dialog[open]")).at(-1) ||
          document.body,
      )
    : null;
}
export function ErrorPage({ error, status }) {
  const retry = connectionError(error) || status >= 500;
  useEffect(() => {
    document.title = copy.error;
    console.error(
      "[DU]",
      status || "Error",
      location.pathname,
      error || copy.pageUnavailable,
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
        <IconButton
          className="icon-button unavailable"
          aria-label={copy.reloadPage}
          onClick={() => location.reload()}
        >
          <Icon name="reload" />
        </IconButton>
      ) : (
        <a className="unavailable" href="/" aria-label={copy.backToUpload}>
          <span role="img" aria-label={copy.transferUnavailable}>
            <Icon name="cancel" />
          </span>
        </a>
      )}
    </main>
  );
}
export class ErrorBoundary extends Component {
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
          new Error(event.message || copy.unhandledError),
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
