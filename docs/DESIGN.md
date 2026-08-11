# Design System — MCSU Console

The visual language for the Managed Cloud Services Unit console. It derives
entirely from the QNX QSERV-MCSU logo, so the product looks like it belongs to
Questronix without needing a separate brand book.

---

## 1. Brand foundation

### Source of truth

The master artwork is `public/qnx-qserv-mcsu-logo.png` — a 1536×1024 canvas
whose lockup occupies only rows 414–629. Everything else is derived from it by
`scripts/build-brand-assets.mjs` (`npm run brand:build`):

| Asset                      | Use                                            |
| -------------------------- | ---------------------------------------------- |
| `public/brand/logo.png`      | Full lockup, brand colours — light surfaces    |
| `public/brand/logo-white.png`| Full lockup, monochrome — the auth panel, dark |
| `public/brand/mark.png`      | QSERV quadrant mark — favicon, tight spaces    |
| `public/brand/mark-white.png`| Mark, monochrome — dark surfaces               |

Never hand-edit the files in `public/brand/` — change the script and re-run it,
so a future logo update is one command rather than an archaeology exercise.

Use the `<Logo />` and `<BrandMark />` components in
`src/components/brand/logo.tsx` rather than raw `<Image>` tags: they carry the
correct aspect ratio and alt text.

### Colours

Sampled directly from the logo's pixels, not eyeballed:

| Token          | Hex       | OKLCH                        |
| -------------- | --------- | ---------------------------- |
| QNX Blue       | `#000FBE` | `oklch(0.3701 0.2458 264.17)` |
| QNX Orange     | `#FE4F00` | `oklch(0.6680 0.2211 37.49)`  |
| MCSU Navy      | `#05061F` | `oklch(0.1418 0.0534 274.86)` |

Everything is authored in OKLCH so tints stay perceptually even — lightening a
blue in OKLCH does not drift it toward purple the way it does in HSL.

**Neutrals carry a slight blue cast** (hue ≈ 277, chroma ≈ 0.005–0.05). Pure
grey next to a saturated blue reads as dirty yellow-green; the cast makes greys
sit with the brand instead of fighting it.

### The orange rule

> Orange is an accent for indicators and graphics. **It is never a text colour
> on a light surface, and never a button fill with white text.**

White on `#FE4F00` is **3.32:1** — it fails WCAG AA for body text. Where orange
must carry text, pair it with navy `#0A0D33` (**5.66:1**). In practice orange
appears in exactly three places: the active-nav bar, the password-strength
meter, and chart series 2.

---

## 2. Tokens

All tokens live in `src/app/globals.css`. Two layers:

1. **Brand constants** (`--brand-blue`, `--brand-orange`, `--brand-navy`) —
   identical in both themes. Brand surfaces such as the auth panel must look the
   same regardless of the viewer's theme.
2. **Semantic tokens** (`--primary`, `--muted-foreground`, `--sidebar`, …) —
   redefined under `.dark`.

**Always use semantic tokens in components.** Write `bg-primary`, not
`bg-[#000FBE]`. The one exception is the `.brand-panel` component class, which
is brand-constant by design.

### Light / dark divergence

`--primary` is the one token that genuinely changes hue-lightness between
themes:

- Light: `#000FBE` — the logo blue, 11.59:1 against white.
- Dark: `#4A5CFF` — same hue, lifted. The logo blue is too dark to read on a
  dark background; this tint still clears 4.5:1 against white button text.

Verified contrast ratios:

| Pair                                | Ratio  | Verdict     |
| ----------------------------------- | ------ | ----------- |
| White on `#000FBE` (light primary)  | 11.59  | AAA         |
| White on `#4A5CFF` (dark primary)   | 4.92   | AA          |
| `#5B5F7B` on white (muted text)     | 6.24   | AA          |
| `#A2A7C4` on `#12152B` (dark muted) | ~7.1   | AAA         |
| White on `#FE4F00`                  | 3.32   | **Fails** — large graphics only |

### Radius and type

- `--radius: 0.625rem` (10px). Derived steps `sm` → `4xl` scale from it, so
  changing one value re-proportions the whole UI.
- **Inter** for UI text, **JetBrains Mono** for identifiers and digests.
- Numerics in tables use `tabular-nums` so columns align.

---

## 3. Layout

### Auth — split panel

`src/app/(auth)/layout.tsx`. Brand panel left, form right, `1fr : 1.05fr` so the
form gets marginally more room.

- The brand panel is **decorative** and disappears entirely below `lg`. A
  compact logo bar replaces it. On a phone the form should own the viewport
  rather than fight a hero image for it.
- Form column caps at `26rem` — comfortable measure for labelled fields.
- The panel background is the `.brand-panel` component class: navy base with two
  offset radial glows (blue lower-left, orange upper-right) echoing the neon
  treatment in the master artwork, plus a faint masked grid for structure.

### App — sidebar shell

`src/app/(app)/layout.tsx`. Fixed 16rem rail, sticky 4rem topbar, content capped
at `max-w-7xl`.

- Below `lg` the rail becomes a `Sheet` drawer.
- The active nav item is marked **two ways**: an orange left bar and
  `aria-current="page"`. Never signal state with colour alone.
- Sidebar contents come from `src/lib/navigation.ts` filtered through RBAC — a
  nav item and the page guard it points at declare the same permission, so they
  cannot drift apart.

---

## 4. Component conventions

### Status vs. role

Colour is a scarce resource; spend it where urgency lives.

- **Status** badges are coloured: amber `pending`, green `active`, red
  `suspended`. Each also carries an icon and a text label.
- **Role** badges are neutral outline + icon. A role is a fact, not an alert.

### Empty, loading, error

Every data surface handles all three:

- **Loading** — skeletons that match the real row geometry, not a spinner. The
  page shouldn't reflow when data lands.
- **Empty** — `<EmptyState>` with an icon, a specific title, and a sentence that
  says what would make rows appear.
- **Error** — an inline panel with the reason and a Retry button. Never a toast
  alone; toasts vanish.

### Disabled controls explain themselves

A disabled action must say why. The row-action menu in User Management wraps its
disabled trigger in a tooltip carrying the exact reason from
`denyReasonForActingOn()` — "You cannot manage a user with the Administrator
role" — rather than being silently inert.

### Destructive actions

Anything irreversible goes through `AlertDialog` with the subject's name in the
body and a verb-specific confirm button ("Remove user", not "OK").

---

## 5. Accessibility baseline

Non-negotiable, and cheap if done from the start:

- Body text meets **4.5:1**; large text and UI graphics meet **3:1**.
- `:focus-visible` draws a 2px ring at 2px offset. Pointer focus does not.
- Every icon-only button has an `aria-label`; decorative icons get `aria-hidden`.
- Live regions (`aria-live="polite"`) on the password-strength meter.
- The reveal toggle inside the password field is `tabIndex={-1}` — tabbing goes
  password → submit, which is what people expect.
- `prefers-reduced-motion` collapses all animation to ~0ms globally.
- Interactive targets are ≥ 36px tall.

---

## 6. Writing

- **Sentence case** everywhere. Not Title Case.
- Say what happened and what to do: "Maria Santos is now Engineer. They'll need
  to sign in again." — not "Update successful."
- Errors name the constraint, never blame: "Use at least 10 characters."
- Login failure is deliberately vague — "Those details don't match an account" —
  because distinguishing a wrong email from a wrong password is an account
  enumeration oracle.
- Use they/them for users whose pronouns you don't know.

---

## 7. Adding a screen

1. Add the permission to `PERMISSIONS` in `src/lib/rbac.ts` and grant it to the
   right roles.
2. Add the nav entry in `src/lib/navigation.ts` with the same permission.
3. Create the page under `src/app/(app)/…` and guard it with
   `await requirePermission("your:permission")`.
4. Compose from `PageHeader` + content. Handle loading, empty and error.
5. Server-render the first read; use TanStack Query for interaction after that.
