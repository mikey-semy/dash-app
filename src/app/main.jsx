import React from "react";
import { createRoot } from "react-dom/client";
import api from "../shared/api/client.js";
import { ErrorPage, ErrorBoundary } from "../shared/ui/Errors.jsx";
import { Recipient } from "../pages/recipient/index.js";
import { installFocusIndicators } from "../shared/lib/focus.js";
import { UploadPage } from "../pages/upload/index.js";
import "../styles/index.css";

installFocusIndicators(document);

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
      <UploadPage />
    )}
  </ErrorBoundary>,
);
