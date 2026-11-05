"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import type { AshScene } from "./rising-ash-scene";

/**
 * WebGL rising-ash field (see rising-ash-scene.ts).
 *
 * three.js is imported only after the browser goes idle, so it never competes
 * with hydration or the hero's LCP text. The loop pauses whenever the hero is
 * scrolled away or the tab is hidden, and prefers-reduced-motion gets a single
 * still frame. Without WebGL the canvas simply stays empty.
 */
export function RisingAsh({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<AshScene | null>(null);
  const [ready, setReady] = useState(false);
  const { resolvedTheme } = useTheme();
  const light = resolvedTheme === "light";
  // The scene reads this once at creation; later changes go through setLight.
  const lightRef = useRef(light);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    let onScreen = true;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const sync = () =>
      sceneRef.current?.setRunning(onScreen && document.visibilityState === "visible");

    const intersection = new IntersectionObserver(([entry]) => {
      onScreen = entry?.isIntersecting ?? true;
      sync();
    });
    intersection.observe(canvas);
    document.addEventListener("visibilitychange", sync);

    const load = () =>
      import("./rising-ash-scene").then(({ createAshScene }) => {
        if (cancelled) return;
        sceneRef.current = createAshScene(canvas, {
          light: lightRef.current,
          still,
          onFirstFrame: () => setReady(true),
        });
        sync();
      });

    const idle = window.requestIdleCallback
      ? window.requestIdleCallback(load, { timeout: 1500 })
      : window.setTimeout(load, 300);

    return () => {
      cancelled = true;
      if (window.cancelIdleCallback) window.cancelIdleCallback(idle);
      else window.clearTimeout(idle);
      intersection.disconnect();
      document.removeEventListener("visibilitychange", sync);
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    lightRef.current = light;
    sceneRef.current?.setLight(light);
  }, [light]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 h-full w-full transition-opacity duration-1000 ease-out",
        ready ? "opacity-100" : "opacity-0",
        className
      )}
    />
  );
}
