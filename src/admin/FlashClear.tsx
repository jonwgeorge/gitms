"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * Keeps a flash message honest: drops its `?done=…` from the address bar (so a
 * reload doesn't repeat it) and hides it once the next form is submitted.
 */
export function FlashClear({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState(true);
  useEffect(() => {
    const url = new URL(window.location.href);
    for (const key of ["done", "commit", "error"]) url.searchParams.delete(key);
    window.history.replaceState(window.history.state, "", url);
    const hide = () => setShown(false);
    document.addEventListener("submit", hide, true);
    return () => document.removeEventListener("submit", hide, true);
  }, []);
  return shown ? children : null;
}
