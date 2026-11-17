import { createRoot } from "react-dom/client";
import api from "#src/shared/api/client.js";
import { ErrorPage, ErrorBoundary } from "#src/shared/ui/Errors.jsx";
import { Recipient } from "#src/pages/recipient/index.js";
import { installFocusIndicators } from "#src/shared/lib/focus.js";
import { UploadPage } from "#src/pages/upload/index.js";
import "#src/styles/index.css";

installFocusIndicators(document);

const token =
  location.pathname.match(/^\/t\/([\w-]+)$/)?.[1] ||
  location.pathname.match(/^\/([A-Za-z0-9]{6})$/)?.[1];
const errorStatus =
  Number(document.querySelector('meta[name="du-error-status"]')?.content) ||
  null;
const knownPath =
  token || ["/", "/index.html", "/history"].includes(location.pathname);
createRoot(document.getElementById("root")).render(
  <ErrorBoundary>
    {errorStatus || !knownPath ? (
      <ErrorPage status={errorStatus || 404} />
    ) : token ? (
      <Recipient token={token} api={api} />
    ) : (
      <UploadPage />
    )}
  </ErrorBoundary>,
);
