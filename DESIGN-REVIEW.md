# Design Review — Fenix Protocol (second pass)

Reviewed against the zandesign check catalog (45 checks). Stack: Next.js 16 static
export · Tailwind v4 · shadcn/ui + Radix · next-themes · framer-motion · three.js (hero).
Surfaces: home, burn, stake, rewards, dashboard.

**Method.** Phase 1 (static) ran across all of `src/`. Phase 2 (visual) ran in Chrome
on every route at desktop (1200px) and 390px, in light and dark mode. Phase 3 (flow) was
partial: no wallet was connected, so the burn/stake/flush transactions themselves were
not driven. Their success, refresh and network-guard paths were fixed from code and are
covered by the existing flow tests (198/198 pass). A separate read-only agent ran a
performance and code-health audit; its findings are under *Outside catalog*.

## Verdict

The first pass fixed the structure. This pass found that what was left was mostly
**invisible cost and quiet duplication**, not missing design. Examples: a hero animating
56 DOM nodes with blurred box-shadows; a skeleton shimmer that runs but never shows;
twenty status dots pinging forever; every page saying its title twice. The biggest lever
now is the semantic-token sweep: 90 raw `ash-*` primitives and 66 `dark:` overrides are
still maintained by hand in component files.

## Findings

| Sev | Check | Where | Finding | Status |
|---|---|---|---|---|
| P0 | TYPE-3 | 14 files, 26 sites | `text-ash-400` (and `ash-400`/`ash-500` pairs) for stat labels, units, captions, footer: **2.5:1 on white**, 3.9:1 on the dark card | **Fixed** → `text-muted-foreground` (4.74:1 / 7.9:1) |
| P1 | HIER-2 | burn, stake, rewards | The card repeats the page's `h1` and description verbatim, directly under it | **Fixed** (burn, stake); rewards keeps its card title, see below |
| P1 | TYPE-1 | `chain-table`, `liquidity-pairs`, `equity-pool-chart` | Home section headers centre a heading + subtitle over left-aligned tables; the utility pages were already left-aligned | **Fixed**: left-aligned; the hero stays centred (sanctioned exception) |
| P1 | MOT-5 | `ui/skeleton.tsx` | The shimmer animated `background-position` on a gradient the size of its box: 150 infinite animations, nothing visible | **Fixed**: `translateX` sweep, `motion-reduce` aware |
| P2 | MOT-3 | `chain-table.tsx` StatusDot | Every healthy chain pinged forever, so ten equal motions competed with the one that matters (loading) | **Fixed**: healthy = steady dot; only loading pings |
| P2 | COL-1 | 90 `ash-*` refs, 66 `dark:` overrides | Pairs with no exact semantic token (`text-ash-700 dark:text-ash-300`, `border-ash-100 dark:border-ash-800`, …) | Open: see systemic recommendations |
| P2 | HIER-2 | `rewards-panel.tsx` | Card title "Rewards" still echoes the `h1`; it stays for balance beside "Projected Yield" | Open: needs a new string in 21 locales |

### P0 — TYPE-3: grey text below AA

`ash-400` (#a3a3a3) on white is 2.5:1, under the 4.5:1 floor for body text. It was used
for the labels that carry meaning: stat-card captions, chart descriptions, `d/h/m/s` units,
the FENIX unit suffix, the footer copyright, and link icons. The dark-mode half of the
`ash-400 dark:ash-500` pair failed as well (3.9:1 on `#171717`).

```diff
-<p className="mt-1 text-sm text-ash-400 dark:text-ash-500">
+<p className="mt-1 text-sm text-muted-foreground">
```

The token is `ash-500`/`ash-400` (4.74:1 light, 7.9:1 dark), so the same change fixes
both themes. Source: [1968252670604685678](https://x.com/zander_supafast/status/1968252670604685678)

> Note: this change reached `main` before the rest of this pass, as `1e6cbbf`. Its commit
> message ("normalize utility class ordering") does not describe it.

### P1 — HIER-2: every utility page said its title twice

```
Burn XEN for FENIX                      ← page h1
Transfer XEN value to the FENIX …       ← page description
┌───────────────────────────────────┐
│ 🔥 Burn XEN for FENIX              │   ← card title (same string)
│ Transfer XEN value to the FENIX …  │   ← card description (same string)
```

The card now starts at the form, so the first thing under the heading is the field the
user came to fill in. Source: [2053925539019165904](https://x.com/zander_supafast/status/2053925539019165904)

### P1 — TYPE-1: centred section stacks on home

The three section headers centred a 30px heading plus a wrapping subtitle above tables
and grids whose content is left-aligned. The eye has to find a new left edge for every
section. Source: [2090368430914310313](https://x.com/zander_supafast/status/2090368430914310313)

## Hero — photoreal rising ash (three.js)

The 56 framer-motion `div`s, each animating `box-shadow` blur, are replaced by
`components/effects/rising-ash*.ts(x)`. The scene is modelled on a long-exposure photo
of a fire:

- **Embers as light trails.** Each ember is a ribbon sampled along its actual trajectory
  over a shutter interval. Trails curve with the turbulence and corkscrew that carry
  them, and are *beaded*, because the ember flickers while the shutter is open.
- **Physical colour.** Embers cool along a blackbody ramp (1300–1800K down to 620K) as
  they rise. Cores are HDR and pass through a hue-preserving film curve, so only the
  hottest bleach to white. A pixel-space glow stands in for lens bloom.
- **Optics.** A thin-lens circle of confusion per ember gives bokeh off the focal plane.
  Exposure spreads along fast trails, so they dim per pixel the way a camera records them.
- **Ash and smoke.** Tumbling paper-ash flakes with patchy burning rims, lit from below.
  Domain-warped smoke rises through the frame, rendered at quarter resolution.
- **Both themes.** On the light sunset, defocused glow is suppressed, flakes become soft
  grey paper, and cooled embers leave grey specks.

**Cost:**
- Three draw calls a frame, with zero per-particle CPU work.
- three.js is a separate 138 KB gzip chunk, loaded at browser idle. The home HTML does
  not reference it.
- The loop pauses off-screen and in hidden tabs, caps at 60fps, and shows one still frame
  under `prefers-reduced-motion`.
- The hero orbs moved from framer-motion plus `blur-3xl` to compositor-only CSS keyframes.

## Systemic recommendations

1. **Finish the token layer (COL-1/COL-2).** Add semantic tokens for the remaining
   recurring pairs and sweep them:
   - `--foreground-strong`: `ash-700`/`ash-300`
   - `--border-subtle`: `ash-100`/`ash-800`
   - `--surface-hover`: `ash-50`/`ash-800/30`

   That retires most of the 66 hand-written `dark:` overrides.
2. **Share the amount field.** Burn and stake duplicate about 80 lines of amount input,
   validation and Max handling. Their drift is how stake ended up without the
   unsupported-network guard. A `useTokenAmount` hook plus an `<AmountField>` would keep
   them identical.
3. **Lazy-load the wallet stack.** `createAppKit` runs at module scope in `providers.tsx`,
   so every route downloads the AppKit/WalletConnect tree (about 400 KB) before anyone
   clicks Connect. This needs a spike, because `useAppKit` in the header depends on it.

## Outside catalog (reviewer judgment: performance and correctness)

All fixed in this pass unless marked otherwise.

- **Hydration failure on home.** The mobile chain cards put a `<div>` skeleton inside a
  `<p>` 30 times, so React discarded the server HTML and re-rendered the page.
  - The 8 copy-pasted number cells became one `SupplyValue` component.
- **"NaN" in success alerts.** Burn and stake read `amount` after the form had cleared
  it; stake also reported the reset 365-day term instead of the term staked. Both now
  snapshot what was submitted.
- **Polling and freshness.**
  - Removed the global 15s `refetchInterval`, which also re-resolved ENS names every 15s.
  - Cadences now match the data: account reads 60s, protocol stats 30s, the 13-week
    flush cooldown 10 minutes.
  - Every confirmed write (burn, approve, stake, end, defer, flush) invalidates contract
    reads in one place. Before, end/defer/flush did not refresh at all until the next poll.
- **Rewards panel.**
  - It re-rendered every second just to compute a boolean. It now flips once, when the
    cooldown ends.
  - "Your share" counted only the first page of 10 stakes; it now counts all of them.
- **"Max" left dust.** It used the 4-decimal display string. It now uses the exact
  balance.
- **Stake on an unsupported network.** It had no guard; it now matches burn, in all 21
  locales.
- **Paint cost.**
  - `.glow-card` no longer applies `backdrop-blur`: the cards sit on a solid page, so the
    blur was invisible and cost GPU time.
  - The 12 home donuts are fixed-size, with no ResizeObservers and no SVG drop-shadow
    filters.
- **Dead code removed:**
  - `ui/tabs`, `ui/select`, `ui/tooltip`
  - `.glass`, `.bg-fenix-gradient*`
  - the `glow`/`float`/`pulse-slow` animations and an inert RTL rule
  - three unused contract types
  - the never-set `--mouse-x` glow
- **Clipboard hook.** It no longer leaks its timer, stacks timers on repeat clicks, or
  claims "copied" when the write fails.
- **Open:** framer-motion (about 42 KB) loads on every route for a 220ms page fade in
  `template.tsx`; a CSS transition or `LazyMotion` would do it.

## Verified clean

`BTN-1` (one brand-filled CTA per view; the header wallet button stays demoted) ·
`BTN-2` · `BTN-5` · `FORM-1` (ids wired through `ui/field`) · `FORM-2` · `FORM-4` ·
`MODAL-1` · `IMG-1` (lucide only) · `LAY-3` · `COL-2` (every route checked in both
themes) · `MOT-6` · `HIER-5` · `TYPE-2`.
