import {
  forwardRef,
  useId,
  useImperativeHandle,
  useState,
  useLayoutEffect,
  useRef,
} from "react";
export function Disclosure({ open, children, className = "", id }) {
  const container = useRef(),
    inner = useRef(),
    animation = useRef(),
    initialized = useRef(false);
  useLayoutEffect(() => {
    const element = container.current;
    const from = element.getBoundingClientRect().height;
    animation.current?.cancel();
    const to = open ? inner.current.getBoundingClientRect().height : 0;
    const finish = () => {
      element.style.height = open ? "auto" : "0px";
      element.style.visibility = open ? "visible" : "hidden";
      animation.current = null;
    };
    element.style.height = to + "px";
    element.style.visibility = open || from > 0 ? "visible" : "hidden";
    if (!initialized.current || Math.abs(to - from) < 0.5) {
      initialized.current = true;
      finish();
      return;
    }
    const current = element.animate(
      [{ height: from + "px" }, { height: to + "px" }],
      { duration: 240, easing: "cubic-bezier(.25,.1,.25,1)" },
    );
    animation.current = current;
    current.onfinish = finish;
  }, [open]);
  useLayoutEffect(() => () => animation.current?.cancel(), []);
  return (
    <div
      ref={container}
      id={id}
      className={"disclosure " + className}
      data-open={open}
      aria-hidden={!open}
      inert={!open}
    >
      <div className="disclosure-inner" ref={inner}>
        {children}
      </div>
    </div>
  );
}
export const AnimatedDetails = forwardRef(function AnimatedDetails(
  { className, label, title, summary, children, inline = false },
  ref,
) {
  const [open, setOpen] = useState(false),
    id = useId();
  useImperativeHandle(
    ref,
    () => ({
      get open() {
        return open;
      },
      set open(value) {
        setOpen(Boolean(value));
      },
    }),
    [open],
  );
  return (
    <div
      className={className + " animated-details"}
      data-open={open}
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false);
      }}
    >
      <button
        type="button"
        className="details-toggle"
        aria-label={label}
        title={title || label}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        {summary}
      </button>
      {inline ? (
        <div
          id={id}
          className="inline-details-body"
          data-open={open}
          aria-hidden={!open}
          inert={!open}
        >
          {children}
        </div>
      ) : (
        <Disclosure id={id} open={open} className="details-body">
          {children}
        </Disclosure>
      )}
    </div>
  );
});
