import { ErrorPage, connectionError } from "#src/shared/ui/Errors.jsx";
import { OwnerView } from "./OwnerWorkspace.jsx";
import { useOwnerWorkspace } from "../model/useOwnerWorkspace.js";
import { LoginView } from "#src/features/sign-in/index.js";
export function UploadPage() {
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
