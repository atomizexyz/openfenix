import { useState, useCallback, useEffect, useRef } from "react";

export function useCopyToClipboard(resetDelay = 2000) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // A pending reset must not fire into an unmounted component.
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = useCallback(
    (text: string) => {
      navigator.clipboard.writeText(text).then(
        () => {
          // Restart rather than stack: a second click keeps the check visible
          // for the full delay instead of being cut short by the first timer.
          clearTimeout(timer.current);
          setCopied(true);
          timer.current = setTimeout(() => setCopied(false), resetDelay);
        },
        // Denied or unavailable: show nothing rather than a false "copied".
        () => setCopied(false)
      );
    },
    [resetDelay],
  );

  return { copied, copy };
}
