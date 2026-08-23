# Design Review — Fenix Protocol

Reviewed against the 30-check [zandesign catalog](https://x.com/zander_supafast).
Stack: Next.js 15 (static export) · Tailwind v4 · shadcn/ui + Radix · next-themes ·
framer-motion. Surfaces: `/` (SEO root), dashboard home, burn, stake, rewards, dashboard.

**Method note:** Phase 1 (static) and Phase 3 (flow) ran in full. Phase 2 (visual) is
**partial** — the Chrome screenshot bridge failed repeatedly mid-review, so visual
findings draw on captures taken earlier in the same session (burn, dashboard, home,
footer, light + dark, desktop + the `ja` locale) rather than a fresh systematic sweep at
390px/desktop × light/dark. Findings below that depend on unverified pixels are marked
**[visual unconfirmed]**.

## Verdict

The component layer is genuinely good — a properly tiered six-variant `Button` with
hover/active states, skeletons instead of spinners everywhere, real on-chain data, one
icon library. The biggest lever is not any single screen: it is that **the design system
is defined but not used**. `globals.css` ships a complete shadcn semantic token layer
(`--background`, `--muted-foreground`, `--destructive`), and components ignore it, hand-
writing `text-ash-500 dark:text-ash-400` pairs 261 times. Dark mode is therefore
maintained by hand in every file rather than aliased once. Fixing that collapses three
separate check failures at once and is the highest-leverage change available.

## Findings

| ID | Check | Where | Finding | Fix |
|---|---|---|---|---|
| P0 | FORM-1 | `burn-form.tsx:132`, `stake-form.tsx:187` | `Label` has no `htmlFor`; `Input` has no `id` — no programmatic association | Add `id`/`htmlFor` pair |
| P1 | COL-1/COL-2 | 39 component files | Semantic tokens bypassed: 261 `dark:` overrides vs 13 token uses; 524 raw `ash-*` refs | Sweep to semantic tokens |
| P1 | TYPE-1 | `burn`, `stake`, `rewards` `/page.tsx`, `hero-section.tsx:202` | Multi-line centered copy stacks | Left-align headers |
| P1 | COL-4 | `ui/button.tsx` destructive variant | Danger colour **is** the brand colour (`ember-500`) | Neutral danger, or shift brand |
| P1 | LAY-2 | 15 `border border-ash-*` containers | Borders used to build hierarchy | Spacing/surface shift instead |
| P1 | BTN-1 | header + every page CTA | Two brand-gradient-filled buttons co-visible | Demote header CTA |
| P2 | COL-3 | `globals.css:13,36` | `--primary: #f97316` identical in both themes | Warm ≈70% in dark |
| P2 | TYPE-2 | `liquidity-pairs.tsx:252-270`, `dashboard-chain-selector.tsx:59` | `uppercase` at 12px | Sentence case or drop to 11px |
| P2 | MOT-1 | App Router, no transitions | Route changes are hard cuts | Drill transitions |
| P2 | MOT-6 | `stakes-list.tsx:430` | Empty state has icon + text but no action | Add a CTA |
| P2 | BTN-3 | `ui/button.tsx` sizes | No `min-width` token | Add `min-w-[96px]` |

## P0 / P1 detail

### FORM-1 — labels are visible but not associated (P0)

Both money inputs render a real `<Label>` above the field, so the *usability* half of
FORM-1 passes — this is not placeholder-as-label. The failure is programmatic:

```tsx
<Label className="...">{t("amount_label")}</Label>   // no htmlFor
<Input type="text" inputMode="decimal" ... />         // no id
```

Screen readers announce the field unlabelled, and clicking the label does not focus the
input. On a form that moves money, that is the highest-cost defect on the list.

```diff
-<Label className="...">{t("amount_label")}</Label>
-<Input type="text" inputMode="decimal" ... />
+<Label htmlFor="burn-amount" className="...">{t("amount_label")}</Label>
+<Input id="burn-amount" type="text" inputMode="decimal" ... />
```

Source: [1874759761180365226](https://x.com/zander_supafast/status/1874759761180365226)

### COL-1 + COL-2 — the token layer exists and is unused (P1, systemic)

`globals.css` defines a full semantic layer for light and dark. Components reference it
13 times. They reference the raw `ash-*` primitive scale 524 times, and hand-write 261
`dark:` overrides to compensate.

The consequence is not cosmetic: every new component must re-derive dark mode by hand,
which is why dark-mode coverage is 30/39 files rather than automatic. COL-2's exact
failure mode is "overrides sprinkled per-component" instead of token aliasing.

```diff
-<p className="text-sm text-ash-500 dark:text-ash-400">
+<p className="text-sm text-muted-foreground">
```

This one sweep also resolves COL-3 (dark tuning becomes a token edit) and most of COL-2.
Do it before the per-screen fixes below — it is the difference between eleven point
patches and two systemic ones.

Source: [1875103802082382115](https://x.com/zander_supafast/status/1875103802082382115)

### TYPE-1 — centered multi-line copy (P1)

`burn`, `stake` and `rewards` each wrap an `h1` plus a wrapping description in
`<div className="text-center">`, and the hero centres title + subtitle + two CTAs. A
centred single line is fine; a centred stack gives the reader a new alignment anchor per
line. Confirmed visually on the burn page earlier in this session — the description wraps
to two ragged lines under a centred heading.

```diff
-<div className="text-center">
+<div>
```

Keep the hero centred if the brand wants it (heroes are the sanctioned exception), but
the three utility pages should be left-aligned.

Source: [2090368430914310313](https://x.com/zander_supafast/status/2090368430914310313)

### COL-4 — the danger colour is the brand colour (P1)

```ts
default:     "bg-gradient-to-r from-fenix-500 to-ember-500 ..."  // brand
destructive: "bg-ember-500 ..."                                   // danger
```

`ember-500` is half the brand gradient. A destructive button is therefore nearly
indistinguishable from the primary CTA — precisely the case COL-4 calls out ("especially
when the brand color is red"). On a protocol where the primary action *burns tokens
irreversibly*, "destructive" and "proceed" must not look alike.

Source: [1988234478452359457](https://x.com/zander_supafast/status/1988234478452359457)

### LAY-2 — borders doing hierarchy's job (P1)

15 containers carry `border border-ash-200/300` on top of card backgrounds, plus 12
`border-b`/`border-t` rules. Combined with `<Card>` used 33 times across seven
components, the dashboard reads as boxes inside boxes. **[visual unconfirmed at 390px]**

Source: [2080000671781110136](https://x.com/zander_supafast/status/2080000671781110136)

### BTN-1 — two brand-filled buttons on screen (P1)

The header's "Connect Wallet" uses the same brand gradient as each page's primary CTA
("Burn XEN", "Stake FENIX"), so every core screen shows two equally-weighted brand
buttons. Confirmed in the burn screenshot. The header CTA is persistent chrome and should
be `secondary` or `outline` so the page's own action wins.

Source: [1802684455670136954](https://x.com/zander_supafast/status/1802684455670136954)

## Systemic recommendations

1. **Sweep components onto semantic tokens** (COL-1, COL-2, COL-3). One change, three
   checks, and dark mode stops being manual.
2. **Split brand from danger** (COL-4) — either move `destructive` to a true red outside
   the brand ramp, or desaturate it.
3. **Add `id`/`htmlFor` to the shared `Input`/`Label` pair** (FORM-1) rather than at each
   call site, so future forms inherit it.

## Verified clean

`FORM-2` (instructional placeholders, no "e.g."), `FORM-4` (focus + disabled states
designed), `MOT-5` (skeletons in 9 components, one spinner total), `BTN-5` (hover/active
on all six variants, 200ms transitions), `BTN-2` (verb labels — only an unused
`common.confirm` string), `MODAL-1` (no "Are you sure?" modals exist), `IMG-1` (lucide
only; the three inline SVGs are brand marks plus a vendored GitHub icon lucide 1.x
dropped), `LAY-3` (Tailwind's 4px scale throughout), `HIER-5` (real on-chain data, no
lorem).

## Outside catalog

- **Dead chains render as permanent skeletons.** Evmos and Dogechain have no reachable
  RPC, so their dashboard cards load forever. No catalog check covers "correct loading
  state, impossible data" — but MOT-5's spirit (loading is a designed state) argues for a
  distinct "unavailable" state rather than an infinite skeleton.
- **`/` is English-only for non-JS clients.** The SEO root serves English content and
  redirects via script. Correct for crawlers; a non-JS user in another locale is stranded
  on English.
