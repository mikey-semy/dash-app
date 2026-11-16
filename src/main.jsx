import React from "react";
import { createRoot } from "react-dom/client";
import api from "./api.js";
import { ErrorPage, ErrorBoundary, connectionError } from "./Errors.jsx";
import { OwnerView } from "./features/upload/OwnerView.jsx";
import { useOwnerWorkspace } from "./features/upload/useOwnerWorkspace.js";
import { LoginView } from "./features/auth/LoginView.jsx";
import { Recipient } from "./Recipient.jsx";
import { installFocusIndicators } from "./lib/focus.js";
import "./styles/index.css";

installFocusIndicators(document);
function App() {
  const workspace = useOwnerWorkspace();
  if (workspace.checking) return <main />;
  if (!workspace.logged && connectionError(workspace.error))
    return <ErrorPage error={workspace.error} />;
  if (!workspace.logged)
    return (
      <LoginView
        error={workspace.error}
        onChange={workspace.clearError}
        onSubmit={workspace.signIn}
      />
    );
  return <OwnerView {...workspace.ownerProps} />;
}
const token =
  location.pathname.match(/^\/t\/([\w-]+)$/)?.[1] ||
  location.pathname.match(/^\/([A-Za-z0-9]{6})$/)?.[1];
const errorStatus =
  Number(document.querySelector('meta[name="du-error-status"]')?.content) ||
  null;
const knownPath = token || ["/", "/index.html"].includes(location.pathname);
createRoot(document.getElementById("root")).render(
  <ErrorBoundary>
    {errorStatus || !knownPath ? (
      <ErrorPage status={errorStatus || 404} />
    ) : token ? (
      <Recipient token={token} api={api} />
    ) : (
      <App />
    )}
  </ErrorBoundary>,
);
