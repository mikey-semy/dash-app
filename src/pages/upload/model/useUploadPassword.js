import { useEffect, useRef, useState } from "react";
import { TIMING } from "#common/config.js";
import { generatePin } from "#src/shared/lib/password.js";
export function useUploadPassword({ upload, setSecret }) {
  const [passwordState, setPasswordState] = useState("idle"),
    passwordClick = useRef(),
    passwordVersion = useRef(0);
  useEffect(
    () => () => {
      clearTimeout(passwordClick.current);
      passwordVersion.current++;
    },
    [],
  );
  useEffect(() => {
    if (upload) {
      clearTimeout(passwordClick.current);
      passwordVersion.current++;
    }
  }, [upload]);
  const clearPassword = () => {
    clearTimeout(passwordClick.current);
    passwordVersion.current++;
    setSecret("");
    setPasswordState("removed");
  };
  const generatePassword = async () => {
    const version = ++passwordVersion.current;
    const pin = generatePin();
    try {
      await navigator.clipboard.writeText(pin);
      if (version !== passwordVersion.current) return;
      setSecret(pin);
      setPasswordState("copied");
    } catch (error) {
      console.error("[dash-app] password clipboard", error);
      if (version === passwordVersion.current) setPasswordState("failed");
    }
  };
  useEffect(() => {
    if (passwordState === "copied" || passwordState === "removed") {
      const timer = setTimeout(() => setPasswordState("idle"), TIMING.feedback);
      return () => clearTimeout(timer);
    }
  }, [passwordState]);
  return {
    passwordState,
    onClick(event) {
      clearTimeout(passwordClick.current);
      if (event.detail === 0) generatePassword();
      else if (event.detail === 1)
        passwordClick.current = setTimeout(generatePassword, TIMING.multiClick);
    },
    onDoubleClick: clearPassword,
    onKeyDown(event) {
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        clearPassword();
      }
    },
  };
}
