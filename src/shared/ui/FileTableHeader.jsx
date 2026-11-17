import { copy } from "#common/copy.js";
export function FileTableHeader({
  className = "",
  actions,
  showActionsLabel = false,
}) {
  return (
    <div className={"file-table-header " + className}>
      <span>{copy.fileNameColumn}</span>
      <span className="file-size">{copy.fileSizeColumn}</span>
      <div className="file-actions">
        {showActionsLabel ? copy.fileActionsColumn : actions}
      </div>
    </div>
  );
}
