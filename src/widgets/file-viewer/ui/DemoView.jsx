import { copy } from "../../../../shared/copy.js";
import { ErrorNotice, ErrorPage } from "../../../shared/ui/Errors.jsx";
import React, {
  lazy,
  Suspense,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Icon } from "../../../shared/ui/Icons.jsx";
const TextPreview = lazy(() => import("./TextPreview.jsx"));
const hashIndex = () => {
  const match = location.hash.match(/^#file=(\d+)$/);
  return match ? Number(match[1]) : null;
};
export default function DemoView({ token, info, onUnavailable }) {
  const [index, setIndex] = useState(hashIndex),
    [download, setDownload] = useState(false),
    [failed, setFailed] = useState(false),
    [badImages, setBadImages] = useState(new Set()),
    gallery = useRef(),
    activeSlide = useRef(0);
  useEffect(() => {
    const change = () => setIndex(hashIndex());
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  useEffect(() => {
    setDownload(false);
    setFailed(false);
    setBadImages(new Set());
  }, [index, info.etag]);
  const images =
    info.files.length > 0 && info.files.every((file) => file.media === "image");
  const requestedName = new URLSearchParams(location.search).get("file");
  const requestedIndex = info.files.findIndex(
    (file) => file.name === requestedName,
  );
  const chosen = index ?? (requestedIndex >= 0 ? requestedIndex : null);
  const siteMode = info.site && chosen === null;
  const selected =
    chosen === null
      ? info.files.length === 1 || images
        ? 0
        : null
      : chosen < info.files.length
        ? chosen
        : 0;
  const file = selected === null ? null : info.files[selected];
  const content = file && { ...info, ...file };
  const source = file
    ? "/preview/" +
      token +
      "/" +
      selected +
      "?v=" +
      encodeURIComponent(info.etag || "")
    : null;
  const downloadPath =
    "/public/" +
    token +
    (selected === null ? "" : "/files/" + selected) +
    "/download";
  const binary =
    !siteMode && !!file && ((!file.media && !file.preview) || download);
  useEffect(() => {
    if (binary) location.assign(downloadPath);
  }, [binary, downloadPath, info.etag]);
  const move = (delta) => {
    if (!gallery.current) return;
    const width = gallery.current.clientWidth,
      current = Math.round(gallery.current.scrollLeft / width);
    gallery.current.scrollTo({
      left: ((current + delta + info.files.length) % info.files.length) * width,
      behavior: "smooth",
    });
  };
  useLayoutEffect(() => {
    if (images && gallery.current)
      gallery.current.scrollTo({
        left: (selected || 0) * gallery.current.clientWidth,
      });
  }, [index, images]);
  useEffect(() => {
    if (!images || info.files.length < 2) return;
    const key = (event) => {
      if (event.key === "ArrowRight") {
        event.preventDefault();
        move(1);
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        move(-1);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [selected, images, info.files.length]);
  if (failed) return <ErrorPage error={failed} />;
  if (siteMode)
    return (
      <main className="demo-view">
        <iframe
          className="site-frame"
          src={info.site}
          sandbox="allow-scripts allow-forms allow-downloads"
          title={info.title || copy.staticSite}
        />
      </main>
    );
  if (!file)
    return (
      <main className="demo-view demo-collection">
        {info.files.map((file, i) => (
          <a href={"#file=" + i} key={i} className="demo-file">
            {file.media === "image" && (
              <img src={"/preview/" + token + "/" + i} alt="" />
            )}
            <span>{file.name}</span>
          </a>
        ))}
      </main>
    );
  if (images)
    return (
      <main className="demo-view">
        <div
          ref={gallery}
          className="demo-carousel"
          onScroll={() => {
            const element = gallery.current,
              i = Math.round(element.scrollLeft / element.clientWidth);
            if (i !== activeSlide.current) {
              activeSlide.current = i;
              history.replaceState(
                null,
                "",
                location.pathname + location.search + "#file=" + i,
              );
            }
          }}
        >
          {info.files.map((entry, i) => (
            <div className="demo-slide" key={i}>
              {badImages.has(i) ? (
                <ErrorNotice
                  error={copy.couldNotLoadTheImage}
                  context={"/preview/" + token + "/" + i}
                />
              ) : (
                <img
                  onError={() =>
                    setBadImages((previous) => new Set([...previous, i]))
                  }
                  className="demo-image"
                  src={
                    "/preview/" +
                    token +
                    "/" +
                    i +
                    "?v=" +
                    encodeURIComponent(info.etag || "")
                  }
                  alt={entry.name}
                  draggable={false}
                  loading={i === (selected || 0) ? "eager" : "lazy"}
                />
              )}
            </div>
          ))}
        </div>
        {info.files.length > 1 && (
          <>
            <button
              type="button"
              className="demo-previous"
              aria-label={copy.previousImage}
              onClick={() => move(-1)}
            >
              <Icon name="left" />
            </button>
            <button
              type="button"
              className="demo-next"
              aria-label={copy.nextImage}
              onClick={() => move(1)}
            >
              <Icon name="enter" />
            </button>
          </>
        )}
      </main>
    );
  return (
    <main className="demo-view">
      {file.media === "image" ? (
        <img
          className="demo-image"
          src={source}
          alt={file.name}
          onError={() => setFailed(copy.couldNotLoadTheImage)}
        />
      ) : file.media === "pdf" ? (
        <iframe className="demo-pdf" src={source} title={file.name} />
      ) : file.media === "video" ? (
        <video
          onError={(event) =>
            setFailed(
              event.currentTarget.error?.message || copy.couldNotOpenTheVideo,
            )
          }
          className="demo-video"
          src={source}
          controls
          preload="metadata"
          playsInline
        />
      ) : file.media === "audio" ? (
        <audio
          src={source}
          controls
          preload="metadata"
          onError={(event) =>
            setFailed(
              event.currentTarget.error?.message || copy.couldNotOpenTheAudio,
            )
          }
        />
      ) : binary ? null : (
        <Suspense fallback={null}>
          <TextPreview
            bare
            token={token}
            info={content}
            index={selected}
            onUnavailable={onUnavailable}
            onUnsupported={() => setDownload(true)}
          />
        </Suspense>
      )}
      {images && info.files.length > 1 && (
        <>
          <button
            type="button"
            className="demo-previous"
            aria-label={copy.previousImage}
            onClick={() => move(-1)}
          >
            <Icon name="left" />
          </button>
          <button
            type="button"
            className="demo-next"
            aria-label={copy.nextImage}
            onClick={() => move(1)}
          >
            <Icon name="enter" />
          </button>
        </>
      )}
    </main>
  );
}
