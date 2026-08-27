---
version: alpha
name: CrowdDrop
description: Light / Orange utility design system for the CrowdDrop Nimiq Pay mini app. Governing visual source is the approved /showcase implementation.
colors:
  background: "#F6F6F4"
  foreground: "#141414"
  muted: "#6A6A6A"
  divider: "#E2E2DE"
  primary: "#C94E12"
  on-primary: "#FFFFFF"
  success: "#1F7A45"
  on-success: "#FFFFFF"
  expired: "#B07A2E"
  status-active-text: "#B9430E"
  status-expired-text: "#A65A16"
  joined-tint: "#F3EBE4"
  surface-input: "#FFFFFF"
typography:
  brand:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: 700
    letterSpacing: -0.02em
  amount:
    fontFamily: Inter
    fontSize: 34px
    fontWeight: 700
    lineHeight: 1
    letterSpacing: -0.04em
  title:
    fontFamily: Inter
    fontSize: 22px
    fontWeight: 700
    letterSpacing: -0.03em
  section-label:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: 600
    letterSpacing: 0.05em
  lead:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 600
  body:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.4
  body-strong:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: 500
    lineHeight: 1.4
  tagline:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: 600
    lineHeight: 1.35
  status:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: 600
  meta:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: 500
  caption:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.4
  wallet:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: 400
  button:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 600
  button-compact:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: 500
  button-new:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: 600
rounded:
  none: 0px
  control: 8px
spacing:
  xs: 4px
  sm: 6px
  md: 8px
  lg: 12px
  xl: 14px
  2xl: 16px
  section: 18px
  page-x: 16px
  page-y: 14px
  touch: 44px
components:
  drop-row:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    typography: "{typography.lead}"
    rounded: "{rounded.none}"
    padding: 12px
    height: 44px
    borderColor: "{colors.divider}"
  button-secondary:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    typography: "{typography.button-compact}"
    rounded: "{rounded.control}"
    height: 44px
    padding: 12px
    borderColor: "{colors.divider}"
  button-share:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    typography: "{typography.button-compact}"
    rounded: "{rounded.control}"
    height: 36px
    padding: 12px
    borderColor: "{colors.divider}"
  button-text:
    backgroundColor: "{colors.background}"
    textColor: "{colors.muted}"
    typography: "{typography.button-compact}"
    height: 32px
  duration-chip:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    typography: "{typography.button-compact}"
    rounded: "{rounded.control}"
    height: 36px
    padding: 11px
    borderColor: "{colors.divider}"
  duration-chip-selected:
    backgroundColor: "{colors.joined-tint}"
    textColor: "{colors.primary}"
    typography: "{typography.button-compact}"
    rounded: "{rounded.control}"
    height: 36px
    padding: 11px
    borderColor: "{colors.primary}"
  input-field:
    backgroundColor: "{colors.surface-input}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.control}"
    height: 44px
    padding: 12px
    borderColor: "{colors.divider}"
  personal-state:
    backgroundColor: "{colors.joined-tint}"
    textColor: "{colors.foreground}"
    padding: 12px
    rounded: "{rounded.control}"
    borderColor: "{colors.primary}"
  participant-dot:
    size: 10px
    padding: 7px
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary}"
    borderColor: "{colors.primary}"
  button-new-drop:
    backgroundColor: "{colors.background}"
    textColor: "{colors.primary}"
    typography: "{typography.button-new}"
    rounded: "{rounded.control}"
    height: 36px
    padding: 10px
    borderColor: "{colors.primary}"
  app-header:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    typography: "{typography.brand}"
  app-header-wallet:
    backgroundColor: "{colors.background}"
    textColor: "{colors.muted}"
    typography: "{typography.wallet}"
  detail-nav-title:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    typography: "{typography.lead}"
    height: 36px
  detail-status-active:
    backgroundColor: "{colors.background}"
    textColor: "{colors.status-active-text}"
    typography: "{typography.status}"
  detail-status-success:
    backgroundColor: "{colors.background}"
    textColor: "{colors.success}"
    typography: "{typography.status}"
  detail-status-expired:
    backgroundColor: "{colors.background}"
    textColor: "{colors.status-expired-text}"
    typography: "{typography.status}"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    height: 44px
    padding: 12px
    borderColor: "{colors.primary}"
  button-primary-success:
    backgroundColor: "{colors.success}"
    textColor: "{colors.on-success}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    height: 44px
    padding: 12px
    borderColor: "{colors.success}"
  button-system:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    height: 40px
    padding: 12px
    borderColor: "{colors.primary}"
---

## Overview

CrowdDrop is a compact group-funding utility that runs primarily inside Nimiq Pay. The approved direction is **Light / Orange / Utility**: practical, trustworthy, lightweight, fast to scan, and purpose-built for Drop actions—not a landing page, not generic Web3 chrome, and not an AI-generated fintech template.

Prioritize Drop information over branding or decoration. Hierarchy comes from typography weight, size, spacing, and alignment. The locked visual reference is `/showcase` (Treatment 2), especially `src/showcase/PhoneFrame.vue`, `ParticipantDots.vue`, `screens/HomeScreen.vue`, `screens/DropDetailScreen.vue`, `screens/CreateScreens.vue`, and `screens/SystemScreens.vue`. Do not invent a new visual language when implementing production screens.

## Colors

Use the flat palette only. The canvas is `{colors.background}` edge-to-edge. Body copy uses `{colors.foreground}`; secondary copy, wallet/network, helpers, and seller metadata use `{colors.muted}`. Separators use `{colors.divider}` as 1px horizontal rules.

`{colors.primary}` is the CrowdDrop orange for Active participant dots, primary money CTAs (Create / Enable / Join / expired-buyer Withdraw), selected duration chips, and the compact `+ New Drop` outline. `{colors.success}` is reserved for Successful and Claimed status text, success-state dots, and Claim. `{colors.expired}` is reserved for expired-state dots—never scary red for normal expiry.

Small status labels on `{colors.background}` use dedicated readable tokens: `{colors.status-active-text}` (`#B9430E`, ~5.0:1) for Active and `{colors.status-expired-text}` (`#A65A16`, ~4.7:1) for Expired. Keep `{colors.primary}` / `{colors.expired}` for controls, dots, and larger accents—do not darken the whole brand system to fix small-text contrast.

`{colors.joined-tint}` is only for the restrained joined-buyer personal note and selected duration chip fill. Do not introduce purple, gradients, decorative blue, or beige lifestyle-brand styling.

## Typography

Inter is the only UI typeface. Do not add a display serif or second decorative family. The CrowdDrop wordmark may use `{typography.brand}` (slightly heavier); everything else stays Inter.

Use these roles from the approved showcase:

- `{typography.amount}` for contribution on Drop detail
- `{typography.title}` for Create / Created headings
- `{typography.section-label}` uppercase for Community / Your Drops / Recent
- `{typography.lead}` for Drop row titles and detail back title
- `{typography.body-strong}` for progress and pooled amounts
- `{typography.body}` / `{typography.caption}` for supporting copy
- `{typography.status}` for plain colored status text
- `{typography.wallet}` for compact network · address

Capitalization for Home sections: **Community**, **Your Drops**, **Recent**.

Standard copy (implement exactly):

- Progress: `8 / 10 joined · 2 spots left`
- Contribution: `5 USDT per person`
- Approval helper: `Approve once for future Drops, up to 100 USDT.`
- Trust: `Funds stay in the contract until the Drop succeeds or expires.`

## Layout

Mobile-first for Nimiq Pay. The real app canvas is edge-to-edge `{colors.background}` with page padding about `{spacing.page-x}` / `{spacing.page-y}`. Do not wrap the application in a giant rounded outer card (the thin border on showcase phone frames is gallery framing only).

Use flat sections, thin horizontal dividers, restrained vertical spacing, compact density, and predictable left/right alignment. Drops must appear quickly in the first Home viewport. No giant Home CTA, no bottom navigation, no nested card soup, no decorative whitespace.

Approved global header (**Header A**):

`CrowdDrop` left · `Polygon · 0xB028…af28` right (wallet/network compact and secondary). Do not repeat “Polygon connected.” when the header already shows network/wallet state.

Detail screens then use one tight nav row:

`← Drop #14` left · plain status text right (`Active` / `Successful` / `Claimed` / `Expired`). No status pills.

## Elevation & Depth

CrowdDrop is flat. Do not use shadows unless a future requirement has a strong functional reason. Hierarchy comes from type, color, dividers, and whitespace—not elevation, gradients, or floating cards.

Allowed motion is minimal: subtle button press, Join state transition, participant-dot progress updates, and a lightweight success acknowledgement. No decorative page-load animation, floating cards, confetti, 3D effects, or gratuitous motion.

## Shapes

Interactive controls that need a boundary use `{rounded.control}` (8px). Rows, sections, and the app canvas stay `{rounded.none}`. Do not use large decorative rounded containers. The joined personal-state note may use a thin left rule plus light tint and only a small right-side radius if needed—never a large generic info card.

## Components

### App header & detail nav

Keep Header A on product screens. Detail nav is a single row (`← Drop #ID` + colored status). Status colors: Active → primary, Successful/Claimed → success, Expired → expired.

### Drop row

Anatomy (flat, full-row tappable, divider-separated, no shadow, no radius):

1. `5 USDT · #14` · status text
2. Participant dots
3. `8 / 10 joined · 2 spots left` · `3h 42m`

Reference: `src/showcase/screens/HomeScreen.vue`.

### Participant dots

Primary CrowdDrop motif. Diameter **10px**, gap **7px**, border **1.5px**. Filled = joined; outline = remaining. Active/default tone is primary orange; Successful/Claimed use success green; Expired uses expired amber. For goals ≤ 20, render one dot per slot. For larger goals, cap visual dots at **20** while always preserving numeric joined/goal progress nearby. Never render hundreds of DOM dots. Logic reference: `src/showcase/system.ts` (`MAX_PARTICIPANT_DOTS`) and `ParticipantDots.vue`.

### Buttons

Primary financial actions may be full-width `{components.button-primary}` (min-height `{spacing.touch}` / 44px, 8px radius, weight 600, 1px matching fill border): Create Drop, Enable CrowdDrop, Join, expired-buyer Withdraw. Claim uses `{components.button-primary-success}`.

Secondary actions must not compete: active Withdraw (`button-secondary` outlined), Share (compact `{components.button-share}`, not full-width), Open Drop, Back to Home (`button-text`). `+ New Drop` is a compact outlined control, not a giant CTA.

Disabled: keep layout, lower emphasis with muted text/border and reduced opacity (~0.45–0.5); do not invent a new disabled color. Pressed: slightly darker fill for filled primaries, or slightly stronger border for outlines. Focus: visible 2px outline using primary (or success on Claim) without adding glow shadows. Preserve ≥44px touch targets even when the visible control is compact (Share/text links).

### Duration chips

Create uses one-screen segmented options matching production durations: `1h` / `4h` / `24h` / `3d` / `7d` / `30d`. Unselected = outline divider; selected = restrained primary text + joined-tint fill. No wizard.

### Inputs

Compact bordered fields on `{colors.surface-input}`, 44px min height, 8px radius, muted suffix labels (`USDT`, `buyers`).

### Screen states

**Home:** header → tagline + `+ New Drop` → Community / Your Drops / Recent flat rows.

**Active buyer:** amount → dots → `8 / 10 joined · 2 spots left` → time remaining → pooled → trust sentence → seller → divider → Enable + approval helper, or Join after approval.

**Joined buyer:** Drop stays Active/orange (not green). Flat personal note: “You’re in this Drop” / “Your 5 USDT is pooled and waiting on the rest.” Withdraw secondary.

**Active seller:** “You created this Drop.” / “Waiting for N more buyers.” Share compact only. Never show Enable, allowance language, or Join.

**Successful:** green only because the Drop reached its goal. Seller: Claim primary. Buyer: informational copy only; no Claim.

**Claimed:** keep dots, joined count, pooled amount, seller, supporting sentence; small Back to Home—do not leave an empty success screen.

**Expired:** amber status. Buyer with deposit: Withdraw is the recovery primary + helper. Seller: informational only; no Claim.

**Created:** Drop #ID created, amount/goal/duration, share URL; Copy link primary, Open Drop secondary, View transaction tertiary—no prominent raw tx hash.

**Disconnected / wrong network:** Community remains browsable. Connect or Switch to Polygon is the priority system action; subdue `+ New Drop` so it does not compete. No giant network-warning blocks.

## Do's and Don'ts

- Do ask of every element: “Does the user actually need this?”
- Do keep Drop facts (amount, dots, joined/goal, time, pooled, actions) above branding and decoration.
- Do use plain colored status text; do not use pill badges unless a future UX requirement genuinely demands one.
- Do keep green reserved for Successful/Claimed Drop states—not for personal “you joined” while Active.
- Do keep Community visible while disconnected or on the wrong network.
- Don't add giant marketing heroes, gradients, large decorative rounded cards, shadow stacks, or bottom nav without a real IA need.
- Don't add generic three-column stat cards, fake avatars, fake social proof, decorative trust icons, meaningless icons, or UI invented to fill whitespace.
- Don't expose raw transaction hashes prominently, wrap the app in an outer card, or use scary red for normal Drop expiry.
- Don't redesign the locked Light / Orange utility direction or invent alternate brand treatments when implementing from this document.
