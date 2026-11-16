import test from "node:test";
import assert from "node:assert/strict";
import { importViolation } from "../tooling/fsd.mjs";

test("FSD enforces downward dependencies and public slice entry points", () => {
  assert.match(
    importViolation("src/shared/api/client.js", "../../../server/core.js"),
    /server implementations/,
  );
  assert.match(
    importViolation("server/text.js", "../src/shared/lib/code/detect.js"),
    /root shared policy/,
  );
  assert.equal(
    importViolation(
      "src/pages/upload/ui/Page.jsx",
      "../../../features/upload-files/index.js",
    ),
    null,
  );
  assert.match(
    importViolation(
      "src/pages/upload/ui/Page.jsx",
      "../../../features/upload-files/model/transport.js",
    ),
    /public entry point/,
  );
  assert.match(
    importViolation("src/shared/ui/Button.jsx", "../../pages/upload/index.js"),
    /lower layer/,
  );
  assert.match(
    importViolation(
      "src/widgets/history/ui/History.jsx",
      "../../file-viewer/index.js",
    ),
    /same layer/,
  );
  assert.equal(
    importViolation(
      "src/features/upload-files/ui/Review.jsx",
      "../model/folders.js",
    ),
    null,
  );
  assert.equal(
    importViolation(
      "src/shared/ui/code-editor/Editor.jsx",
      "../../lib/code/detect.worker.js",
    ),
    null,
  );
  assert.equal(
    importViolation(
      "src/pages/upload/ui/Page.jsx",
      "../../../../shared/copy.js",
    ),
    null,
  );
});
