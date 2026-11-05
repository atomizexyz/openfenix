import { useState, useEffect } from "react";
import { SECONDS_PER_DAY } from "@/config/constants";

export interface CountdownParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  ready: boolean;
}

const nowSeconds = () => Math.floor(Date.now() / 1000);

/**
 * The current unix time in seconds, re-read every `intervalMs`. Reading the
 * clock through state keeps render pure: the value only changes on a tick.
 */
export function useNowSeconds(intervalMs = 1000): number {
  const [now, setNow] = useState(nowSeconds);

  useEffect(() => {
    const interval = setInterval(() => setNow(nowSeconds()), intervalMs);
    return () => clearInterval(interval);
  }, [intervalMs]);

  return now;
}

export function useCountdown(targetSeconds: number): CountdownParts {
  const now = useNowSeconds();

  const remaining = Math.max(targetSeconds - now, 0);

  if (remaining <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, ready: true };
  }

  return {
    days: Math.floor(remaining / SECONDS_PER_DAY),
    hours: Math.floor((remaining % SECONDS_PER_DAY) / 3600),
    minutes: Math.floor((remaining % 3600) / 60),
    seconds: remaining % 60,
    ready: false,
  };
}
