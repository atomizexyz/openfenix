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

// setTimeout overflows past 2^31-1 ms (~24.8 days); longer waits re-arm.
const MAX_TIMEOUT_MS = 2_147_483_647;

/**
 * Whether unix time `targetSeconds` has passed. Unlike useNowSeconds this does
 * not tick: it re-renders once, when the moment arrives, so a component that
 * only needs a before/after answer is not re-rendered every second.
 */
export function useHasPassed(targetSeconds: number): boolean {
  const [now, setNow] = useState(nowSeconds);

  useEffect(() => {
    const ms = (targetSeconds - nowSeconds()) * 1000;
    if (ms <= 0) return;
    const timer = setTimeout(
      () => setNow(nowSeconds()),
      Math.min(ms + 250, MAX_TIMEOUT_MS)
    );
    return () => clearTimeout(timer);
  }, [targetSeconds, now]);

  return targetSeconds <= now;
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
