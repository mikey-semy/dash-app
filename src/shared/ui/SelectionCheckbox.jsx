import { useLayoutEffect, useRef } from "react";

export function SelectionCheckbox({ indeterminate = false, ...props }) {
  const ref = useRef();
  useLayoutEffect(() => {
    ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return <input {...props} ref={ref} type="checkbox" />;
}
