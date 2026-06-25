# QueueStorm — Frontend Design Instructions

> **For:** Claude Opus (Claude “Design / Artifacts” mode)
> **Goal:** Redesign and build the **entire** QueueStorm frontend from scratch — every page, desktop **and** mobile — as a premium, editorial, *non-AI-looking* product. No generic SaaS templates, no “cards fading up on scroll,” no purple-blue AI gradient clichés.
> **Stack (mandatory):** React + Vite · Tailwind CSS · Three.js (via React Three Fiber) · GSAP (+ ScrollTrigger) · Lenis · plus the premium libraries listed in §3.
> **Read this whole file before writing a single line of code.** Build in the phase order in §15.

---

## 0. What the product actually is (so the design has meaning, not decoration)

QueueStorm is an **intelligent ticket-triage console for a digital-finance company** (think bKash on a chaotic afternoon). Thousands of customer complaints arrive at once. The product reads each message and instantly answers four questions:

1. **What kind of problem is this?** → `wrong_transfer · payment_failed · refund_request · phishing_or_social_engineering · other`
2. **How serious is it?** → `low · medium · high · critical`
3. **Which team handles it?** → `customer_support · dispute_resolution · payments_ops · fraud_risk`
4. **One-sentence summary** an agent reads in two seconds.

It also **raises a flag** for phishing or critical cases so a human reviews them immediately, and it **never** asks the customer for OTP / PIN / password / card number.

**The visual metaphor for the whole site is the name: a storm of chaotic tickets being sorted into calm, ordered streams.** Chaos → order. Noise → one sentence. Every signature animation must serve that idea. This is what stops the design from feeling generic.

**Core feature (from the spec):**
- `GET /health` — service health
- `POST /sort-ticket` — classify one ticket

**Four NEW features we are adding (must appear in the UI and the README):**

| # | Feature | One-liner | Backed by |
|---|---------|-----------|-----------|
| F1 | **Triage Playground** | Type/paste a customer message, watch it get classified live with a cinematic reveal of the JSON result. | `POST /sort-ticket` |
| F2 | **Command Center** | A live operations dashboard — real-time ticket flow, severity heatmap, department load balancing, throughput & latency. | stored tickets in SQLite + websocket/poll |
| F3 | **Sentinel** | A fraud & phishing radar: every `critical`/`phishing` case surfaces here for human review, with a 3D radar sweep and a review queue. | `human_review_required` cases |
| F4 | **Insights** | Historical analytics — volume trends, case-type mix, severity over time, resolution funnel, anomaly callouts. | SQLite aggregations |

> These four features map 1:1 to the four AI agents in `agents.md`. Keep the naming identical across UI, README, and agents doc.

---

## 1. Design philosophy — the “non-AI, luxury” rulebook

The brief: **must not look AI-generated. Must feel premium / luxury, editorial, deliberate.** Follow these rules literally.

**DO**
- Treat it like a **financial editorial product** (think the confidence of a private-bank dashboard crossed with an award-winning agency site). Lots of negative space. Strong typographic hierarchy. One disciplined accent.
- Use **asymmetry and a real grid** — off-center hero, baseline-aligned type, intentional overhangs into margins.
- Use **hairline rules, tabular numerals, and editorial captions** (small-caps labels, index numbers like `01 — Triage`).
- Make motion **physical and continuous** (smooth scroll, momentum, parallax depth), not “element appears.”
- Use **one signature 3D moment per major page**, performant and meaningful.
- Keep color **restrained**: warm neutrals + a single cool “aurora” signal used sparingly.

**DON’T**
- ❌ No generic `fade-up + stagger` card grids as the primary motion.
- ❌ No purple→blue diagonal gradients, no glassmorphism everywhere, no neon glow on everything.
- ❌ No emoji in UI, no rounded-pill-everything, no default Inter/Roboto, no stock “3D blob.”
- ❌ No center-everything layouts. No symmetric hero with a headline + two buttons + a screenshot.
- ❌ No drop shadows as the only depth cue — use light, blur, and overlap instead.

**Litmus test:** if a section could be dropped into any AI SaaS landing page unchanged, redesign it.

---

## 2. Brand, theme & visual system

**Product name:** QueueStorm
**Design system codename:** *Obsidian Aurora*
**Two complete themes (build both, fully — not just an inverted palette):**
- **Dark = “Obsidian”** (default)
- **Light = “Porcelain”**

Theme is user-toggleable and persists (`localStorage`), respects `prefers-color-scheme` on first load, and animates the transition (≤ 400 ms cross-fade of CSS variables, no hard flash).

### 2.1 Color tokens (use CSS variables; these exact values)

**Obsidian (dark)**
```
--bg-base:        #0A0A0C   /* near-black, faint blue */
--bg-elevated:    #121217
--bg-surface:     #16161D
--bg-glass:       rgba(22,22,29,0.62)   /* + backdrop-blur 18px */
--line-subtle:    rgba(255,255,255,0.06)
--line-strong:    rgba(255,255,255,0.12)
--text-primary:   #F4F2EE   /* warm bone, NOT pure white */
--text-secondary: #A8A6A0
--text-muted:     #6E6D68
--accent-violet:  #7A5CFF   /* primary interactive */
--accent-magenta: #FF3D81   /* energy / “storm” signal */
--accent-mint:    #28E0C8   /* success / resolved */
--champagne:      #D9C6A3   /* luxe hairline accent, VERY sparing */
```

**Porcelain (light)**
```
--bg-base:        #F6F4EF   /* warm bone */
--bg-elevated:    #FFFFFF
--bg-surface:     #FDFCFA
--bg-glass:       rgba(255,255,255,0.66)
--line-subtle:    rgba(20,18,16,0.08)
--line-strong:    rgba(20,18,16,0.16)
--text-primary:   #14110E   /* near-black ink */
--text-secondary: #4A463F
--text-muted:     #8A857C
--accent-violet:  #5B3CE0
--accent-magenta: #D8276A
--accent-mint:    #12B59C
--champagne:      #B79A63
```

**Signature gradient (the “Aurora”) — sparing, for the storm motifs only**
`linear-gradient(110deg, var(--accent-magenta) 0%, var(--accent-violet) 48%, var(--accent-mint) 100%)`

**Semantic — severity (consistent everywhere: charts, badges, 3D particle colors)**
```
low:      #5FB587   (calm green)
medium:   #E0B23C   (amber/gold)
high:     #F0743A   (ember)
critical: #FF3B5C   (alarm red — always paired with a slow pulse)
```

**Semantic — department hues (subtle, for routing visuals)**
```
customer_support:   #34C7E0
dispute_resolution: #7A5CFF
payments_ops:       #E0B23C
fraud_risk:         #FF3D81
```

### 2.2 Typography (do NOT use Inter/Roboto)

| Role | Font | Source | Use |
|------|------|--------|-----|
| Display | **Clash Display** | Fontshare (free) | hero headlines, section titles, big statements |
| Editorial serif | **Fraunces** (variable, `opsz`/`wght`) | Google Fonts | pull-quotes, large numerals, elegant accents |
| Body / UI | **Satoshi** | Fontshare (free) | paragraphs, labels, buttons, tables |
| Mono | **JetBrains Mono** (or Geist Mono) | Google Fonts | JSON, ticket IDs, latency, code, data readouts |

Self-host fonts (`/public/fonts`, `@font-face`, `font-display: swap`). Subset to Latin + Bangla where available (locale `bn` is real in this product — see §6).

**Type scale (fluid, `clamp`)**
```
display-xl: clamp(3.25rem, 8.5vw, 9rem)   Clash, weight 600, tracking -0.03em, line-height 0.92
display-l:  clamp(2.5rem, 5.5vw, 5rem)    Clash, 600, -0.02em
h1:         clamp(2rem, 4vw, 3.25rem)     Clash, 500
h2:         clamp(1.5rem, 3vw, 2.25rem)   Clash, 500
h3:         1.25rem                        Satoshi, 600
body-l:     1.125rem / 1.65               Satoshi, 400
body:       1rem / 1.6                     Satoshi, 400
label:      0.75rem, 0.14em tracking, UPPERCASE  Satoshi, 600  (editorial captions)
mono:       0.875rem                       JetBrains Mono
```
- Numerals: enable `font-feature-settings: "tnum" 1` for all data/tabular contexts.
- Section indices: render as `01 — Triage`, `02 — Command Center` … (editorial signature).

### 2.3 Space, grid, radius, elevation

- **Spacing scale (px):** 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96 · 128 · 192.
- **Grid:** 12-col, max-width `1440px`, gutter `24px`, page margin `clamp(20px, 5vw, 96px)`. Mobile: 4-col, 16px gutter.
- **Radius:** `--r-sm 10px · --r-md 16px · --r-lg 24px · --r-xl 32px`. Use **sharp 0-radius hairline dividers** for editorial rules; round only surfaces/cards.
- **Elevation:** prefer *light + blur + overlap* over heavy shadows. Glass surfaces: `backdrop-blur(18px)` + 1px `--line-subtle` top border catching light. Max one soft shadow level: `0 24px 60px -24px rgba(0,0,0,0.5)` (dark) / `0 24px 50px -28px rgba(20,18,16,0.18)` (light).
- **Texture:** a single, subtle film-grain noise overlay (SVG/`<canvas>` or `mix-blend-overlay` PNG at ~3% opacity) across the whole app to kill the “flat AI” look.

---

## 3. Tech stack & dependencies (install exactly these)

```
# core
react react-dom
vite @vitejs/plugin-react
tailwindcss postcss autoprefixer
clsx tailwind-merge class-variance-authority

# motion
gsap                      # + ScrollTrigger, SplitText, Flip, Observer, MotionPathPlugin
lenis                     # smooth scroll (import "lenis")
motion                    # framer-motion (component micro-interactions, shared layout)

# 3D
three
@react-three/fiber
@react-three/drei
@react-three/postprocessing
postprocessing
maath simplex-noise       # noise / particle math

# data + state
@tanstack/react-query
zustand
axios

# dataviz (custom-styled, animated)
d3-scale d3-shape d3-array   # hand-built charts (preferred over chart libs for the luxe look)

# ui primitives (restyled — never ship default look)
@radix-ui/react-* (dialog, tooltip, dropdown, tabs, switch, scroll-area)
lucide-react              # icons (stroke 1.5), restyle as needed

# routing + utils
react-router-dom
date-fns
zod                       # validate API payloads on the client
```
Dev-only: `lil-gui`, `@react-three/drei`’s `<Perf>` or `r3f-perf`, `eslint`, `prettier`.

> GSAP **SplitText** is now free — use it. Register all plugins once in a `lib/gsap.ts`.

**Project layout**
```
src/
  app/            # router, providers (QueryClient, Theme, Lenis)
  pages/          # one file per route (§7)
  components/     # ui/ (atoms), sections/ (page sections), three/ (scenes)
  three/          # R3F scenes, shaders (.glsl), materials
  motion/         # gsap timelines, scroll choreography hooks
  lib/            # api client, gsap setup, theme, formatters
  store/          # zustand stores
  styles/         # tailwind, tokens.css, fonts.css
  data/           # mock fixtures for design-time (real API later)
public/
  fonts/  textures/ (grain.png, env.hdr)
```

---

## 4. Motion principles (global)

- **Smooth scroll via Lenis**, wired to GSAP ScrollTrigger:
  ```ts
  const lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
  ```
- **Easing palette:** entrance `cubic-bezier(0.16,1,0.3,1)` (expo-out); transitions `cubic-bezier(0.65,0,0.35,1)`; loops linear. Define as GSAP `CustomEase` and Tailwind tokens.
- **Durations:** micro 160–240ms · standard 420–640ms · cinematic 900–1400ms.
- **Custom cursor (desktop ≥1024px):** a small ring that grows + magnetizes to interactive elements; trails slightly behind the pointer. Hidden on touch.
- **Page transitions:** a “storm wipe” — a noise/displacement shader sweep (or GSAP Flip on shared elements) between routes, 600–800ms. Never a plain fade.
- **`prefers-reduced-motion`:** ship a full fallback — disable Lenis smoothing, replace scroll-scrub with simple in-view fades, freeze particle sims to a static frame, keep all content reachable. This is a hard requirement, not optional.

---

## 5. Signature scroll choreography (the part that makes it *not* generic)

These are **specific, scripted scroll sequences.** Implement them as GSAP ScrollTrigger timelines (scrubbed), not as element-in-view triggers. Each is described precisely.

### 5.1 Hero — “The Storm Forms → The Storm Sorts” (Landing)
A full-viewport Three.js scene of **~12,000 GPU particles** (instanced points, custom GLSL).
- **Frame 0 (top of page):** particles swarm in a turbulent vortex — chaotic, magenta-hot, simplex-noise driven. This *is* the queue storm.
- **As the user scrolls the hero (pinned, ~150vh of scroll):** a single scroll-scrubbed timeline drives uniforms so the swarm **decelerates, cools (magenta→violet→mint), and self-organizes into four laminar streams**, each stream tinted with a department hue, flowing left→right into four labeled “gates” (`Support · Disputes · Payments · Fraud`).
- Camera does a slow dolly-in + slight orbit, scrubbed.
- The headline (SplitText, masked clip-path reveal per word) resolves in sync: e.g. **“We read the storm. You read one sentence.”**
- Exit: the four streams compress into a single hairline that becomes the top border of the next section. (Use GSAP to literally hand the line off.)

### 5.2 “Four questions” — pinned horizontal scroll
Pin a section for ~400vh. Vertical scroll translates a horizontal track of **four full panels** — one per question the service answers (case type / severity / department / summary). Each panel:
- A giant Fraunces numeral (`01–04`) in the margin,
- a kinetic-typography statement,
- a small bespoke 3D/SVG motif (e.g. severity panel = a vertical “pressure gauge” that fills `low→critical` as it enters).
Progress rail at the bottom draws as you go.

### 5.3 Ticket journey — scroll-drawn SVG path
A single SVG line **draws itself** (`MotionPathPlugin` / `stroke-dashoffset` scrub) tracing a ticket: `Received → Read → Classified → Routed → (Flagged?) → Resolved`. At each node a small label and a live-looking JSON fragment snaps in. The path literally forks at “Flagged” toward Sentinel.

### 5.4 Parallax depth (throughout)
3–4 depth layers per long section moving at different rates (`data-speed`): background aurora/grid (slowest), mid glow orbs, foreground UI mockups/typography (fastest). Subtle — max ~12% differential. On mobile, drive a gentler version from device orientation if available, else from scroll only.

### 5.5 Kinetic type & number ribbons
Big statements revealed by scroll-scrubbed `clip-path` masks (line-by-line). Stat counters (`12,840 tickets sorted · 38ms median · 0 PINs requested`) count up as their row crosses center, with tabular numerals.

### 5.6 Section transitions
Between major sections, a brief noise-displacement wipe (reuse the hero shader as a fullscreen pass) so scrolling feels like moving through one continuous world, not stacked blocks.

> **Mobile note:** keep 5.1, 5.2 (as a snap-scroll vertical stack instead of horizontal), 5.3, and 5.5. Reduce particle count to ~4,000 and DPR cap (§13). Never ship the desktop horizontal-pin on small screens — convert to vertical snap.

---

## 6. Localization & domain realism (bn / en / mixed)

The product serves Bangladesh. `locale` ∈ `bn | en | mixed` is real.
- Ship a language toggle (EN / বাংলা). Body font must render Bangla (pair Satoshi-Latin with a quality Bangla face such as **Hind Siliguri** or **Noto Sans Bengali** for `bn`).
- Sample messages, ticket fixtures, and the Playground should include realistic Bangla and code-mixed (“Banglish”) examples, e.g. *“ভুল নাম্বারে ৫০০০ টাকা চলে গেছে, ফেরত দিন”*.
- Currency shown as **BDT / ৳**. Times in Asia/Dhaka.
- Never render any UI string that asks the customer for OTP/PIN/password/card (safety rule is part of the brand — even surface a subtle “We will never ask for your PIN/OTP” trust mark in the footer).

---

## 7. Pages — build every one (desktop + mobile)

Routes use `react-router-dom`. Each page lists its purpose, sections, the signature moment, and mobile adaptation. **ASCII wireframes are layout intent, not pixel specs.**

### 7.1 `/` — Landing / Storytelling
The marketing/explainer surface; heaviest 3D + scroll work.
Sections: Hero (5.1) → Four Questions (5.2) → Ticket Journey (5.3) → Feature showcase (F1–F4, each a scroll scene, **not** a card grid) → Trust/safety strip (the “never asks for PIN/OTP” promise) → Stats ribbon (5.5) → Footer/CTA (“Open the Console”).
```
DESKTOP
┌───────────────────────────────────────────────────────────────┐
│  QUEUESTORM            Playground  Console  Sentinel  Insights  ◐│  ← glass nav, magnetic
│                                                                   │
│      WE READ THE STORM.                  ╭─────────────────╮      │
│      YOU READ ONE SENTENCE.              │  3D particle    │      │
│      ───                                 │  vortex → 4      │      │
│      Intelligent triage for             │  ordered streams │      │
│      digital finance.   [ Open Console ] ╰─────────────────╯      │
│  01 — Triage   02 — Command   03 — Sentinel   04 — Insights        │
└───────────────────────────────────────────────────────────────┘
MOBILE: headline stacks, 3D becomes a contained square canvas (4k particles),
nav collapses to a bottom “dock” + slide-over menu.
```

### 7.2 `/playground` — Triage Playground (F1)
The interactive core. A composer on the left, a **cinematic result reveal** on the right.
- Composer: large textarea, channel selector (`app/sms/call_center/merchant_portal`), locale (`bn/en/mixed`), preset sample chips (the 5 public sample cases from the spec). A real `POST /sort-ticket`.
- On submit: a brief “reading” state (particles from the hero condense into a single token), then the result **assembles**: `case_type` badge, a severity gauge filling to the right level, the routed department gate lighting up, the `agent_summary` typewritten, the `human_review_required` flag (if true, a red pulse + “Escalated to Sentinel”), and a `confidence` dial.
- Show the raw JSON response in a mono panel with syntax highlight + copy.
```
┌───────────────── Playground ─────────────────┐
│  Compose ticket            │  Classification   │
│  ┌──────────────────────┐  │  [wrong_transfer] │
│  │ message…             │  │  severity ▓▓▓░ HIGH│
│  └──────────────────────┘  │  → dispute_resolution
│  channel ▼  locale ▼       │  “Customer reports…”│
│  [sample chips]  [Classify]│  ⚑ review  conf 0.85│
│                            │  { json … }  ⧉ copy │
└──────────────────────────────────────────────┘
MOBILE: composer top, result reveals below; gauge + dial stack.
```

### 7.3 `/console` — Command Center (F2)
Live ops dashboard. The hero of the “app” side.
- **Left rail:** filters (case_type, severity, department, channel, locale, time range).
- **Center:** a **live ticket-flow visualization** — a 3D node graph / particle stream where new tickets enter as particles and route to department nodes in real time; node size = current load. Below it, a virtualized live ticket table (ticket_id, snippet, case_type, severity badge, department, confidence, time).
- **Right rail:** real-time stat stack — throughput (tickets/min, animated sparkline), median latency, severity distribution (animated stacked bar), department load gauges, critical-in-queue counter.
- New `critical`/`phishing` rows flash and emit a particle toward Sentinel.
```
┌ filters ┬─────── live flow (3D) ───────┬ stats ┐
│ type    │      ·  ·   →[Support]       │ tk/min │
│ sev     │   ·  ·  ·   →[Disputes]      │ p50 ms │
│ dept    │  ·   ·      →[Payments]      │ sev ▆▃▂│
│ chan    │      ·      →[Fraud] ⚠       │ loads  │
│ locale  ├──────── live ticket table ───┴────────┤
│ time    │ T-104  “payment failed…”  HIGH  pay…  │
└─────────┴───────────────────────────────────────┘
MOBILE: 3D flow becomes a compact banner; stats become a horizontal
snap-carousel of stat tiles; table is the primary scroll surface.
```

### 7.4 `/sentinel` — Fraud & Phishing Radar (F3)
Everything `human_review_required === true` lands here.
- Centerpiece: a **3D radar sweep** (rotating sweep line, blips = flagged tickets, distance from center = risk, color = severity). Hovering a blip previews the ticket; clicking opens detail.
- A **review queue** list: claim / approve-escalation / mark-safe actions, SLA timer per item (critical = aggressive pulse).
- A “threat patterns” strip showing detected phishing indicators (OTP request, urgency, impersonation, link bait).
```
┌────────── SENTINEL · human review ──────────┐
│            ╭───── radar sweep ─────╮  queue: │
│            │   • crit   • crit     │  T-201 ⚑│
│            │      ◎ sweep          │  T-208 ⚑│
│            │   • high              │  [claim]│
│            ╰──────────────────────╯  SLA 02:41│
│  patterns: OTP-ask · urgency · impersonation  │
└──────────────────────────────────────────────┘
MOBILE: radar shrinks to top; queue is the main list; patterns wrap.
```

### 7.5 `/insights` — Analytics & Trends (F4)
Hand-built, animated dataviz (d3-scale + SVG; no off-the-shelf chart skins).
- Volume over time (area, animated draw), case-type mix (animated stacked stream/donut), severity-over-time heatmap (calendar/matrix), department workload, resolution funnel, and **anomaly callouts** in prose (from the Insights agent).
- Each chart animates on scroll-in via its data path drawing, not a fade.
```
┌── Insights ──────────────────────────────────┐
│ Volume ╱╲___╱╲      Case mix ◓   Severity grid │
│ Funnel ▣▣▣▢  Dept load ▆▃▂▅  Anomalies: “…”    │
└──────────────────────────────────────────────┘
MOBILE: charts stack full-width, each snap-scrolls into view & redraws.
```

### 7.6 `/ticket/:id` — Ticket Detail
Drill-down: original message (with locale), full classification, confidence breakdown, the safety-check pass/fail, routing path replay (mini version of 5.3), agent_summary, Copilot-suggested reply (from agents.md F-Copilot), and an audit timeline.

### 7.7 `/docs` — API & About
Live API reference for `/health` and `/sort-ticket` with request/response schema, enum tables (render the spec’s enums faithfully), an interactive “try it” that hits the real endpoint, the safety rule called out, runtime constraints, and the deployment runbook link. Editorial, readable, mono code blocks.

### 7.8 Auxiliary
- `/settings` — theme (Obsidian/Porcelain), language (EN/বাংলা), motion (full/reduced), density.
- `404` + error boundary — on-brand (a “lost in the storm” scene; particles drifting off).
- Global **command palette** (`⌘/Ctrl-K`): jump to pages, classify a quick message, toggle theme.

---

## 8. Global components (atoms → restyle Radix, never default look)

Nav (glass, magnetic, scroll-aware shrink) · Theme toggle (animated sun→storm) · Language toggle · Button (primary/ghost/quiet, with magnetic + cursor states) · Severity badge (4 states) · Department tag · Confidence dial (SVG arc) · Severity gauge (vertical fill) · JSON viewer (mono, syntax-tinted, copy) · Stat tile (counter + sparkline) · Live table row · Toast/alert (critical = pulse) · Modal/sheet (Radix Dialog) · Tooltip · Command palette · Footer (with the “never asks for PIN/OTP” trust mark) · Loader (particle condense, reused from hero) · Custom cursor.

---

## 9. Three.js scene specs (R3F)

| Scene | Where | Notes |
|-------|-------|-------|
| Storm vortex → streams | Hero §5.1 | instanced points, custom GLSL vertex/fragment, simplex curl-noise, scroll-driven uniforms, additive blending, mild bloom |
| Ticket-flow graph | Console §7.3 | nodes + particle edges, instanced, color by department, live data feeds positions |
| Radar sweep | Sentinel §7.4 | rotating sweep mesh + shader gradient, blips as sprites, risk→radius |
| Loader condense | global | reuse hero particles, collapse to a token |
| 404 drift | error | particles slowly dispersing |

Rules: one `<Canvas>` per page max; pause render loop when offscreen / tab hidden (`frameloop="demand"` where possible); cap DPR (§13); provide a static poster image fallback for reduced-motion and for first paint. Postprocessing: bloom (subtle) + film grain + slight vignette; **no** heavy chromatic aberration except on transitions.

---

## 10. Data & API contract (design-time + real)

Build against fixtures in `src/data/` first, then swap to the live API. Validate with `zod`.

**Request** `POST /sort-ticket`
```json
{ "ticket_id": "T-001", "channel": "app", "locale": "en",
  "message": "I sent 5000 taka to a wrong number this morning, please help me get it back" }
```
**Response**
```json
{ "ticket_id": "T-001", "case_type": "wrong_transfer", "severity": "high",
  "department": "dispute_resolution",
  "agent_summary": "Customer reports sending 5000 BDT to a wrong number and requests recovery.",
  "human_review_required": false, "confidence": 0.85 }
```
Enums (render exactly): `case_type ∈ {wrong_transfer, payment_failed, refund_request, phishing_or_social_engineering, other}` · `severity ∈ {low, medium, high, critical}` · `department ∈ {customer_support, dispute_resolution, payments_ops, fraud_risk}`.
Use the **5 public sample cases** from the spec as the default Playground chips and seed data.
Provide `VITE_API_BASE_URL` env; client in `lib/api.ts` (axios + React Query). `GET /health` powers a live status dot in the nav.

> Console/Sentinel/Insights read **stored** tickets (the backend persists every classification in SQLite — see the backend phase). Until that exists, drive them from `src/data/fixtures.ts` so the design is fully demoable offline.

---

## 11. Accessibility

- WCAG 2.1 AA contrast in **both** themes (verify the bone-on-obsidian and ink-on-porcelain pairs).
- Full keyboard nav; visible focus rings (custom, on-brand); skip-to-content; logical tab order including the command palette.
- All 3D/canvas is decorative → `aria-hidden`; never put essential info only in a canvas.
- Respect `prefers-reduced-motion` everywhere (§4).
- Semantic landmarks, labeled controls, `aria-live` for the live Console counters and toast escalations.
- Don’t encode meaning in color alone — severity also carries a label/shape/position.

---

## 12. Responsive / mobile (first-class, not an afterthought)

Breakpoints: `sm 480 · md 768 · lg 1024 · xl 1280 · 2xl 1536`.
- Convert every horizontal-pin to **vertical snap** on `< lg`.
- Nav → bottom dock + slide-over; command palette reachable from the dock.
- Reduce particles to ~4k, cap DPR at 1.5, prefer `frameloop="demand"`.
- Larger touch targets (≥44px), no hover-only affordances, custom cursor disabled on touch.
- Test the Playground, Console table, and Sentinel queue as the three most-used mobile surfaces.

---

## 13. Performance budgets (enforce)

- Initial route JS ≤ ~200KB gzip (code-split Three scenes per route, lazy-load `@react-three/*`).
- 60fps target desktop / 30fps floor mobile for scroll scenes; DPR cap `Math.min(devicePixelRatio, 2)` desktop / `1.5` mobile.
- Lighthouse: Perf ≥ 85 mobile, A11y ≥ 95.
- Defer/idle-load non-critical scenes; poster image before canvas hydrates; preload only the hero scene + display font.
- No layout shift from fonts (size-adjust / `font-display: swap` + metrics).

---

## 14. Definition of done (acceptance checklist)

- [ ] Both themes complete and animated-toggle; persists; respects system pref.
- [ ] Every page in §7 built, desktop **and** mobile, with its signature moment.
- [ ] All scroll choreography in §5 implemented as scrubbed timelines (not in-view fades).
- [ ] F1–F4 features present and wired to fixtures (then real API).
- [ ] `prefers-reduced-motion` fallback verified on every page.
- [ ] No generic AI-template tells (re-run the §1 litmus test on each section).
- [ ] Bangla / mixed locale renders correctly; safety trust-mark present.
- [ ] A11y + performance budgets met.
- [ ] Nothing center-default, nothing Inter, nothing emoji-in-UI.

---

## 15. Build order (do it in these steps)

1. **Scaffold:** Vite + React + Tailwind; tokens.css (both themes); fonts; `lib/gsap.ts`; Lenis provider; React Query + Router providers; grain overlay; custom cursor.
2. **Design system:** typography, color, spacing, atoms in §8 (Storybook-style page at `/_kitchen-sink`).
3. **Landing shell + Hero scene (§5.1):** get the storm→streams particle system and scroll pin working first — it sets the whole tone.
4. **Landing remaining scroll scenes (§5.2–5.6).**
5. **Playground (F1)** against fixtures, then real `POST /sort-ticket`.
6. **Console (F2)**, **Sentinel (F3)**, **Insights (F4)** against fixtures.
7. **Ticket detail, Docs, Settings, 404, command palette.**
8. **Mobile pass** (convert pins to snaps, tune particles/DPR).
9. **Reduced-motion + a11y pass.**
10. **Performance pass** (code-split, budgets, posters) and final §1 litmus review.

> When the backend exists, swap fixtures for the live API (`VITE_API_BASE_URL`) and connect Console/Sentinel/Insights to stored SQLite tickets.

---

### Appendix — the four agents this UI fronts (see `agents.md`)
F1 Playground ↔ **Triage Agent** · F3 Sentinel ↔ **Sentinel Agent** · Ticket detail Copilot ↔ **Copilot Agent** · F4 Insights ↔ **Insights Agent**. Keep names identical across UI, README, and `agents.md`.
