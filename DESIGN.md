---
name: Al-Saqi Audit Management
description: A calm, authoritative interface for the internal audit lifecycle — Arabic-first, bilingual, dense without crowding.
colors:
  teal-primary: "#0a7d85"
  teal-hover: "#065f66"
  teal-700: "#044a50"
  teal-tint: "#e6f5f6"
  ink: "#111827"
  slate-muted: "#5b6b7a"
  bg-main: "#f4f7f9"
  bg-soft: "#eef2f5"
  card: "#ffffff"
  surface-raised: "#fafbfc"
  border-soft: "#dce4ea"
  border-strong: "#b8c5cf"
  dark-bg-main: "#0c1220"
  dark-bg-soft: "#131d2e"
  dark-card: "#1a2538"
  dark-ink: "#f1f5f9"
  dark-muted: "#8b9db3"
  dark-border-soft: "#263347"
  success: "#059669"
  warning: "#d97706"
  danger: "#dc2626"
  info: "#0284c7"
typography:
  display:
    fontFamily: "Tajawal, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "normal"
  headline:
    fontFamily: "Tajawal, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.3
  title:
    fontFamily: "Tajawal, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "Tajawal, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Tajawal, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    letterSpacing: "0.05em"
rounded:
  lg: "0.5rem"
  xl: "0.75rem"
  2xl: "1rem"
spacing:
  xs: "0.5rem"
  sm: "0.75rem"
  md: "1rem"
  lg: "1.5rem"
  xl: "2rem"
components:
  button-primary:
    backgroundColor: "{colors.teal-primary}"
    textColor: "#ffffff"
    rounded: "{rounded.xl}"
    padding: "0.625rem 1.5rem"
    height: "2.5rem"
  button-primary-hover:
    backgroundColor: "{colors.teal-hover}"
    textColor: "#ffffff"
  button-outline:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: "0.625rem 1.5rem"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.slate-muted}"
    rounded: "{rounded.xl}"
  button-destructive:
    backgroundColor: "{colors.danger}"
    textColor: "#ffffff"
    rounded: "{rounded.xl}"
  input-field:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.2xl}"
    padding: "1rem 1.5rem"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.2xl}"
    padding: "1.5rem"
  sidebar-item-active:
    backgroundColor: "{colors.teal-primary}"
    textColor: "#ffffff"
    rounded: "{rounded.xl}"
---

# Design System: Al-Saqi Audit Management

## 1. Overview

**Creative North Star: "The Quiet Authority"**

Al-Saqi is the workspace of internal auditors, compliance officers, and the management who rely on their findings. It earns trust the way a well-run institution does: through restraint, consistency, and precision, never through spectacle. The interface speaks with a single calm voice. A muted teal (`#0a7d85`) carries identity and primary action; everything else is disciplined neutral so the data — findings, risk ratings, correspondence, KPIs — stays the loudest thing on the screen. The system is Arabic-first (RTL) and fully bilingual; direction is a first-class concern, never a retrofit.

This is a high-density product surface, but density here is deliberate, not crowded. Generous corner radii (16px on cards and inputs), soft layered shadows, and consistent spacing rhythm keep dense tables and long Arabic report text legible across long working sessions. Light mode is the default home for reading dense text; a fully tuned dark mode mirrors every token for low-light review. Motion is functional — entrances, state feedback, a notification bell — and always yields to `prefers-reduced-motion`.

It explicitly rejects the flashy consumer-SaaS playbook (gradient heroes, decorative glass, attention-grabbing ornament), the playful-startup register (bouncy motion, mascots, emoji-as-UI), and the cramped legacy government portal (dated chrome, inconsistent spacing, buried actions).

**Key Characteristics:**
- One teal voice; neutrals do the rest.
- Calm density — a lot of structured information, never crowded.
- Bidirectional by default; RTL is primary, LTR fully supported.
- Soft, generous geometry (xl/2xl radii) over hard edges.
- Color always paired with text/icon for status — never the sole signal.

## 2. Colors

A disciplined teal-and-slate palette: one saturated brand hue against cool, lightly blue-tinted neutrals, with a four-channel status system for audit semantics.

### Primary
- **Deep Teal** (`#0a7d85`): The single brand voice. Carries primary buttons, active navigation, focus rings, links, and selected states. Hover deepens to **Teal Pressed** (`#065f66`). A full 50–900 ramp exists (`#e6f7f8` → `#012224`) for tints and fills.
- **Teal Tint** (`#e6f5f6`): Quiet hover wash behind sidebar items and primary-light surfaces.

### Neutral
- **Ink** (`#111827`): Primary text. Use for body and headings; never drop body text to the muted slate.
- **Slate Muted** (`#5b6b7a`): Secondary text, table headers, captions, placeholders (at full opacity, not faded below 4.5:1).
- **Canvas** (`#f4f7f9`) / **Canvas Soft** (`#eef2f5`): App background and recessed zones. Cool, lightly blue-tinted — not warm cream.
- **Card** (`#ffffff`) / **Surface Raised** (`#fafbfc`): Content surfaces that sit above the canvas.
- **Border Soft** (`#dce4ea`) / **Border Strong** (`#b8c5cf`): Dividers and structural strokes.
- **Dark mode** mirrors every role: canvas `#0c1220`, card `#1a2538`, ink `#f1f5f9`, muted `#8b9db3`, border `#263347`.

### Status (audit semantics)
- **Success** (`#059669`), **Warning** (`#d97706`), **Danger** (`#dc2626`), **Info** (`#0284c7`) — each with a matching light tint background for badges and alerts.
- **Risk ladder**: Critical (rose `#e11d48`), High (orange `#f97316`), Medium (amber `#f59e0b`), Low (emerald `#10b981`) — rendered as solid uppercase pills.

### Named Rules
**The One Voice Rule.** Teal is the only brand hue. Do not introduce a second accent color for variety; if an element needs emphasis, use weight, size, or a status color that carries real meaning.

**The Status-Plus-Label Rule.** Color never carries status alone. Every badge, risk pill, and alert pairs its color with a text label (and usually an icon) so meaning survives color-blindness and grayscale print.

## 3. Typography

**Display / Body Font:** Tajawal (with Inter, then system sans fallback)
**Label/Mono Font:** JetBrains Mono (for codes, IDs, and monospaced data only)

**Character:** Tajawal is a geometric Arabic-and-Latin sans built for crisp RTL legibility; it carries the entire UI in a single family across weights 400–900, so Arabic and English read as one continuous voice. Inter is the Latin fallback. One family in many weights — never paired against a similar competing sans.

### Hierarchy
- **Display** (800, ~1.875rem/30px, lh 1.2): Page titles and dashboard headers.
- **Headline** (700, ~1.25rem/20px, lh 1.3): Section and card headings.
- **Title** (600, ~1.125rem/18px, lh 1.4): Sub-section labels, modal titles, empty-state titles.
- **Body** (400, ~0.875rem/14px, lh 1.6): Default reading text and table cells. Cap long-form prose at 65–75ch.
- **Label** (600, ~0.75rem/12px, +0.05em, often uppercase): Table headers, badges, eyebrow metadata. Uppercase tracking is reserved for these utility labels, never for prose.

### Named Rules
**The Single-Family Rule.** Tajawal carries headings and body alike. Hierarchy comes from weight (400→800) and size, not from a second typeface.

## 4. Elevation

A soft, layered system. Surfaces are calm and nearly flat at rest, lifting on interaction. Depth is conveyed by diffuse, low-opacity multi-layer shadows on a light canvas (and by tonal layering of `bg-main` → `card` → `surface-raised` in dark mode), never by hard dark drop-shadows.

### Shadow Vocabulary
- **xs** (`0 1px 2px rgba(0,0,0,0.03)`): Hairline lift for subtle chips.
- **sm** (`0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)`): Resting state for cards, tables, inputs.
- **md** (`0 4px 12px rgba(0,0,0,0.06), 0 2px 4px rgba(0,0,0,0.03)`): Card hover.
- **lg** (`0 8px 24px rgba(0,0,0,0.08), 0 4px 8px rgba(0,0,0,0.04)`): Interactive-card hover, popovers.
- **xl** (`0 20px 40px rgba(0,0,0,0.12)`): Modals and fullscreen overlays.
- **primary** (`0 4px 14px rgba(10,125,133,0.25)`): Teal glow under primary buttons and the active sidebar item.

### Named Rules
**The Lift-On-Intent Rule.** Surfaces rest at `sm`. Shadow grows only in response to state — hover (`md`/`lg`), overlay (`xl`). A static screen has no deep shadows.

## 5. Components

### Buttons
- **Shape:** Generously rounded (xl, 12px); small size drops to lg (8px). Press feedback via `active:scale-[0.97]`.
- **Primary (default):** Teal `#0a7d85` on white text, `shadow-primary`; hover deepens to `#065f66` and the glow intensifies. Padding `0.625rem 1.5rem`, height 40px (sm 36px, lg 44px, icon 40×40).
- **Outline:** Card background, soft border, ink text; hover fills with `bg-soft`.
- **Secondary:** Slate `#f1f5f9` surface with dark slate text.
- **Ghost:** Transparent, muted text; hover washes `bg-soft`. Used for low-emphasis and toolbar actions.
- **Destructive:** Danger red `#dc2626`, white text — reserved for irreversible actions.
- **Link:** Teal text, underline on hover.
- **Focus:** 2px teal `focus-visible` ring with 2px offset on every variant.

### Inputs / Fields (Input, Select, Textarea)
- **Style:** Card background, soft border, fully rounded (2xl, 16px), `shadow-sm`, padding `1rem 1.5rem`.
- **Focus:** Teal border with a 2px teal ring at ~50% opacity.
- **Error:** Border and ring switch to danger red; `aria-invalid` is set.
- **Disabled:** `not-allowed` cursor at 50% opacity.
- **Mobile:** Minimum 44px tap target and 16px font (prevents iOS zoom-on-focus).

### Cards / Containers (.glass-card, .interactive-card)
- **Corner Style:** 2xl (16px).
- **Background:** Card white (`#ffffff` light / `#1a2538` dark) on the canvas.
- **Shadow Strategy:** Rests at `sm`; `.glass-card` lifts to `md` on hover; `.interactive-card` lifts to `lg` and rises `translateY(-2px)`.
- **Border:** 1px `border-soft`.
- **Internal Padding:** lg (24px). Never nest a card inside a card.

### Navigation (.sidebar-item)
- **Style:** Rounded-xl rows, muted text and icon at rest.
- **Hover:** Teal-tint wash, text shifts to teal.
- **Active:** Solid teal fill, white text, `shadow-primary`.
- **Direction:** Sidebar and all entrance motion are RTL-aware (mirrored slide-in keyframes under `[dir="rtl"]`).

### Badges & Risk Pills
- **Status badges** (success/warning/danger/info): tinted background, matching text, 20%-opacity border, rounded-lg, semibold, small.
- **Risk pills** (critical/high/medium/low): solid saturated fill, white uppercase 10px bold text, wide tracking. Always accompanied by the level word.

### Tables (.table-container)
- **Container:** Rounded-2xl, soft border, `shadow-sm`, horizontal scroll with a direction-aware edge-fade indicator when overflowing.
- **Header:** `bg-soft`, muted uppercase label text, `text-start` (direction-aware).
- **Rows:** Hover washes `bg-soft/50`; cells use soft bottom borders.

## 6. Do's and Don'ts

### Do:
- **Do** keep teal `#0a7d85` as the single brand voice — emphasis comes from weight, size, and meaningful status color.
- **Do** pair every status/risk color with a text label and icon (the Status-Plus-Label Rule).
- **Do** use ink `#111827` for body text; bump toward ink, never down to faded slate, when contrast is close (≥4.5:1 body, ≥3:1 large).
- **Do** mirror layout, motion, and iconography for RTL — Arabic is primary, not an afterthought.
- **Do** rest surfaces at `shadow-sm` and lift only on hover/overlay.
- **Do** keep cards flat-bordered with 16px radii; carry hierarchy with spacing rhythm.

### Don't:
- **Don't** build flashy consumer-SaaS chrome: no gradient hero blocks, no `background-clip:text` gradient text, no decorative glassmorphism.
- **Don't** drift into the playful-startup register: no bouncy/elastic motion, no mascots, no emoji used as UI icons (use Lucide SVGs).
- **Don't** ship the cramped legacy-portal look: no inconsistent spacing, dated chrome, or buried actions; density must stay breathable.
- **Don't** introduce a second accent hue "for variety" — it breaks the One Voice Rule.
- **Don't** use a colored `border-left`/`border-right` stripe as an accent on cards or alerts; use full borders or a background tint.
- **Don't** nest cards inside cards.
- **Don't** let status rely on color alone, or let any animation run without a `prefers-reduced-motion` fallback.
