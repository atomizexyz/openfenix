/**
 * Frees the dev port before `next dev` binds it.
 *
 * Next does not fail on a busy port -- it silently picks the next free one, so
 * you end up on 7778 while the stale server still answers on 7777. Worse, two
 * Next servers sharing this repo's .next directory corrupt each other's build
 * output, which surfaces as MODULE_NOT_FOUND on chunks that plainly exist.
 *
 * Only listeners are killed, and only on this port: an `lsof -t` with no match
 * exits non-zero and prints nothing, in which case there is nothing to do.
 */
import { spawnSync } from "node:child_process";

const PORT = 7777;

const lsof = spawnSync("lsof", ["-ti", `tcp:${PORT}`, "-sTCP:LISTEN"], {
  encoding: "utf8",
});

const pids = (lsof.stdout ?? "")
  .split("\n")
  .map((line) => line.trim())
  .filter(Boolean);

if (pids.length === 0) {
  console.log(`port ${PORT} is free`);
} else {
  for (const pid of pids) {
    // SIGTERM, not SIGKILL: Next cleans up its .next lockfiles on the way out.
    process.kill(Number(pid), "SIGTERM");
    console.log(`freed port ${PORT} (killed pid ${pid})`);
  }
  // Give the socket a moment to actually release before next dev binds it.
  // `sleep` rather than a Bun-specific API: Next typechecks this directory.
  spawnSync("sleep", ["0.3"]);
}
