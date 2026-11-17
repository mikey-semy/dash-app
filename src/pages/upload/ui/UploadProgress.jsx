import React from "react";
import { copy } from "../../../../shared/copy.js";
import { FileList } from "../../../entities/transfer/index.js";
import { IconButton } from "../../../shared/ui/IconButton.jsx";
import { Icon } from "../../../shared/ui/Icons.jsx";
import { bytes } from "../../../shared/lib/format.js";
export function UploadProgress({
  upload,
  elapsed,
  progress,
  paused,
  running,
  onResume,
  onPause,
  onCancel,
  onSelectFiles,
}) {
  const speed = elapsed ? progress / elapsed : 0,
    eta = speed ? Math.max(0, (upload.total - progress) / speed) : 0;
  return (
    <>
      <FileList files={upload.files} />
      <div className="upload-times">
        <time title={copy.elapsed}>
          {Math.round(elapsed)}
          {copy.sSuffix}
        </time>
        <time title={copy.remaining}>
          ≈ {Math.round(eta)}
          {copy.sSuffix}
        </time>
      </div>
      <progress
        aria-label={copy.uploadProgress}
        value={progress}
        max={upload.total || 1}
      />
      <div className="upload-metrics">
        <span title={copy.uploadedTotalSize}>
          {bytes(progress)} / {bytes(upload.total)}
        </span>
        <span title={copy.speed}>
          {bytes(speed)}
          {copy.perSecondUnit}
        </span>
      </div>
      <div className="upload-actions">
        <IconButton
          disabled={paused && running}
          aria-label={paused ? copy.resume : copy.pause}
          title={
            upload.missing
              ? copy.selectTheSameFilesToResume
              : paused
                ? copy.resume
                : copy.pause
          }
          onClick={() =>
            upload.missing
              ? onSelectFiles()
              : paused
                ? onResume(upload)
                : onPause()
          }
        >
          <Icon name={paused ? "play" : "pause"} />
        </IconButton>
        <IconButton
          aria-label={copy.cancel}
          title={copy.cancel}
          onClick={onCancel}
        >
          <Icon name="cancel" />
        </IconButton>
      </div>
    </>
  );
}
