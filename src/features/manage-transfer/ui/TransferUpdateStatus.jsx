import { copy } from "#common/copy.js";
import { IconButton } from "#src/shared/ui/IconButton.jsx";
import { Icon } from "#src/shared/ui/Icons.jsx";

export function TransferUpdateStatus({ value, onRetry, onDiscard }) {
  if (!value?.count) return null;
  return (
    <div className="transfer-updates">
      <span
        role="status"
        aria-label={copy.pendingChanges}
        title={value.error || copy.pendingChanges}
        aria-description={value.error || undefined}
      >
        <Icon name={value.error ? "warning" : "archive"} />
        <small>{value.count}</small>
      </span>
      {value.error && (
        <>
          <IconButton
            aria-label={copy.retryChanges}
            title={copy.retryChanges}
            onClick={onRetry}
          >
            <Icon name="reload" />
          </IconButton>
          <IconButton
            aria-label={copy.discardQueuedChanges}
            title={copy.discardQueuedChanges}
            onClick={onDiscard}
          >
            <Icon name="cancel" />
          </IconButton>
        </>
      )}
    </div>
  );
}
