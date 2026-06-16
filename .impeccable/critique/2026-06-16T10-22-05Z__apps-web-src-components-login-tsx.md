---
timestamp: 2026-06-16T10-22-05Z
slug: apps-web-src-components-login-tsx
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Loading shows `...` instead of a spinner; 2FA step gives no "step X of Y" progress signal |
| 2 | Match System / Real World | 3 | Label eyebrows use UPPERCASE TRACKING-WIDEST which reads as form chrome, not natural language |
| 3 | User Control and Freedom | 3 | Cancel on 2FA modals works; no way to edit credentials once 2FA screen appears without cancelling |
| 4 | Consistency and Standards | 2 | Field labels use uppercase tracking-widest but the rest of the app uses normal-case labels; language toggle is icon-only |
| 5 | Error Prevention | 3 | noValidate bypasses browser defaults — acceptable since inline validation exists; but error banner appears at top while failed field stays unflagged |
| 6 | Recognition Rather Than Recall | 3 | Show/hide password toggle with aria-label is good; language toggle is icon-only with no text label |
| 7 | Flexibility and Efficiency | 1 | onForgotPassword wired to empty handler — forgot password is completely non-functional |
| 8 | Aesthetic and Minimalist Design | 2 | Right panel illustration carries two stat cards (99.98%, 1,240+) — hero-metric template on a login screen |
| 9 | Error Recovery | 2 | Error message sits at form top, not adjacent to failing field; password field doesn't get danger border on login failure |
| 10 | Help and Documentation | 2 | "Need help?" routes to ContactAdmin, not a self-serve reset — no password recovery path |
| **Total** | | **24/40** | **Acceptable — significant improvements needed** |

## Anti-Patterns Verdict

**LLM assessment:** The illustration panel commits two banned patterns: the hero-metric template (99.98% uptime, 1,240+ audits) and tiny uppercase tracked eyebrow on every stat card. The decorative glassmorphism badge (backdrop-blur-md) is also present. Field labels use uppercase eyebrow treatment inconsistently with app-wide conventions.

**Deterministic scan:** Unavailable — missing lib/impeccable-config.mjs dependency.

## Overall Impression

Solid auth engineering (RTL, 2FA, localized errors, focus management) undermined by a marketing-flavored illustration panel and a broken forgot-password flow.

## What's Working

1. Bilingual direction handling is correct end-to-end.
2. 2FA flow is well-considered with proper focus management and autoComplete attributes.
3. Error messages mapped from stable codes, not server text.

## Priority Issues

**[P0] Forgot Password is dead** — onForgotPassword wired to () => {}. No self-serve recovery path. Fix: wire a real reset flow or label the contact button "Contact Administrator." Suggested: /impeccable craft forgot password flow

**[P1] Stat cards in illustration panel violate design brief** — hero-metric template (99.98%, 1,240+) with eyebrow kicker labels. Remove the stat cards. Suggested: /impeccable polish LoginIllustration

**[P1] Glassmorphism badge** — backdrop-blur-md decorative badge in illustration. Replace with simple pill or remove. Suggested: /impeccable polish LoginIllustration

**[P2] Field labels use uppercase eyebrow treatment** — inconsistent with app-wide .input-label convention. Switch to text-sm font-semibold normal case. Suggested: /impeccable polish LoginForm

**[P2] Error banner doesn't co-locate with failing field** — mark both fields with danger border on auth failure, or show error inline below password. Suggested: /impeccable harden LoginForm

## Persona Red Flags

**Maram (Arabic-first daily user):** Forgotten password → ContactAdmin modal only → must call IT. No self-service path.

**Khalid (IT admin):** Stat cards on login read as marketing. Undermines institutional gravitas.

**Layla (first login, forced password change):** No password strength indicator. 8-char minimum only. Weak for sensitive audit data.

## Minor Observations

- Loading state shows literal "..." — use .loading-spinner
- Language toggle icon-only; add AR/EN text label
- resetStatus callout uses raw Tailwind colors instead of token system
- Footer copyright uses text-[10px] — below practical minimum
