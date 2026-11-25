import { useState } from "react";
import { copy } from "#common/copy.js";
import { ErrorNotice } from "#src/shared/ui/Errors.jsx";
import { IconButton } from "#src/shared/ui/IconButton.jsx";
import { Icon } from "#src/shared/ui/Icons.jsx";
import { ResponsiveActions } from "#src/shared/ui/ResponsiveActions.jsx";

export function MarkdownExportActions({ article, filename }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const run = async (action) => {
    setBusy(true);
    setFailed(false);
    try {
      if (action === "print") {
        await Promise.all(
          Array.from(article.querySelectorAll("img"), (image) =>
            image.decode().catch(() => {}),
          ),
        );
        if (article.isConnected) window.print();
      } else {
        const { downloadMarkdownHtml } =
          await import("#src/shared/ui/markdown/export.js");
        await downloadMarkdownHtml(article, filename);
      }
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <ResponsiveActions className="text-actions" label={copy.exportMarkdown}>
        <IconButton
          aria-label={copy.printMarkdown}
          title={copy.printMarkdown}
          disabled={!article || busy}
          onClick={() => run("print")}
        >
          <Icon name="print" />
        </IconButton>
        <IconButton
          aria-label={copy.downloadMarkdownHtml}
          title={copy.downloadMarkdownHtml}
          disabled={!article || busy}
          onClick={() => run("html")}
        >
          <Icon name="html" />
        </IconButton>
      </ResponsiveActions>
      {failed && <ErrorNotice error={copy.couldNotExportMarkdown} />}
    </>
  );
}
