import { detect } from "./detect.js";
self.onmessage = ({ data }) => {
  try {
    self.postMessage(detect(data.text, data.filename));
  } catch {
    self.postMessage({ name: null, label: "?" });
  }
};
self.postMessage({ ready: true });
