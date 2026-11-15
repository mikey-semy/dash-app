import React, { forwardRef, useId, useImperativeHandle, useState } from "react";
export function Disclosure({ open, children, className = "", id }) {
  return (
    <div
      id={id}
      className={"disclosure " + className}
      data-open={open}
      aria-hidden={!open}
      inert={!open}
    >
      <div className="disclosure-inner">{children}</div>
    </div>
  );
}
export const AnimatedDetails = forwardRef(function AnimatedDetails(
  { className, label, title, summary, children },
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
      <Disclosure id={id} open={open} className="details-body">
        {children}
      </Disclosure>
    </div>
  );
});
