import React, { forwardRef } from "react";

export const IconButton = forwardRef(function IconButton(
  { className = "", type = "button", ...props },
  ref,
) {
  const classes = [
    "icon-button",
    ...className.split(/\s+/).filter((name) => name && name !== "icon-button"),
  ];
  return (
    <button ref={ref} type={type} className={classes.join(" ")} {...props} />
  );
});
