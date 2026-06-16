# Product

## Register

product

## Users

Internal auditors, audit managers, compliance and risk officers, and senior management at Arabic-language enterprises and government bodies. They work in long, focused sessions inside the tool — reading dense audit reports, filling structured forms, tracking findings and recommendations, and reviewing KPIs. Arabic (RTL) is the primary working language; English (LTR) is fully supported. Context is professional and desk-based: accuracy, traceability, and legibility over long reading sessions matter far more than novelty. Many actions are sensitive and access-controlled (fraud management, conflict of interest, system logs, audit trail).

## Product Purpose

Al-Saqi is the frontend for an internal audit management system. It consolidates the full audit lifecycle in one place: audit programs and plans, fieldwork tasks, findings, evidence and recommendations, the risk register, the compliance matrix, corporate governance structures, fraud and conflict-of-interest management, official correspondence, and executive dashboards and reports. Success means auditors can move through their workflow quickly and confidently, management gets a reliable high-level picture, and every action remains traceable and permission-aware. It connects to a separate backend API over REST and WebSocket.

## Brand Personality

Authoritative, trustworthy, precise. The voice is calm and professional — an expert system that institutions rely on for serious work. Confidence without flash: clarity, restraint, and consistency signal credibility. Tone in copy is direct, respectful, and unambiguous, never playful or marketing-driven.

## Anti-references

- **Flashy consumer SaaS** — no gradient-soaked hero marketing energy, no attention-grabbing decoration competing with the data.
- **Playful startup** — no whimsical mascots, bouncy motion, emoji-as-UI, or casual copy.
- **Cluttered legacy government portal** — no cramped tables, inconsistent spacing, dated chrome, or buried actions. Density should feel deliberate and breathable, not crowded.

## Design Principles

1. **Legibility over decoration.** Auditors read dense Arabic and English text for long stretches. Contrast, type scale, and spacing serve reading first; ornament never gets in the way.
2. **Bidirectional by default.** RTL is the primary direction, not an afterthought. Layout, motion, and iconography must read correctly in both Arabic and English.
3. **Traceable and permission-aware.** The interface reflects who can do what. Restricted areas (fraud, COI, logs, audit trail) feel appropriately gated; sensitive actions are clear and confirmable.
4. **Calm density.** Show a lot of structured information without crowding. Deliberate whitespace and consistent rhythm keep dense screens scannable.
5. **Quiet confidence.** Visual restraint communicates institutional trust. Color and motion are used to guide and signal state, not to impress.

## Accessibility & Inclusion

Target WCAG 2.1 AA. The codebase already enforces this direction with automated `vitest-axe` checks, `eslint-plugin-jsx-a11y`, skip-to-content links, visible `:focus-visible` rings, and full keyboard support. Motion respects `prefers-reduced-motion` (reduced to near-instant transitions). Color is never the sole carrier of meaning — status and risk levels pair color with text labels and icons. Body text and placeholders must meet ≥4.5:1 contrast in both light and dark modes; full bidirectional (RTL/LTR) support is a hard requirement.
