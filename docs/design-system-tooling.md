# Design-system workbench and visual regression

Phase 4 asks for an isolated component gallery, axe checks and visual regression.
The route at `/gallery` still exists for quick local browsing, but it is a 404 in
a production build, so it cannot be the screenshot surface. Storybook is:
every story renders a component with explicit props, no session, no database and
no network.

## Run it

```bash
pnpm storybook          # http://localhost:6006
pnpm build-storybook    # static build in storybook-static/
pnpm test:visual        # screenshots + axe against the static build
pnpm test:visual:update # rewrite the committed baselines
```

The workbench has toolbar controls for theme, accent and density. They apply the
same `data-theme` / `data-accent` / `data-density` attributes the app uses, so a
story is a real skin, not a mock.

## What is covered

| Area        | Stories                                                                                      |
| ----------- | -------------------------------------------------------------------------------------------- |
| Foundations | semantic palette, accent ramps                                                               |
| Actions     | button variants/sizes/states, icon buttons, keyboard hints                                   |
| Forms       | text fields, textarea, checkbox/radio/switch/slider, select, combobox                        |
| Display     | badges, avatars, progress, spinner, skeletons, alerts, separators, empty/error states, cards |
| Navigation  | tabs, accordion, breadcrumb, pagination, action menu                                         |
| Overlays    | dialog, drawer, popover, tooltip, toast, command palette                                     |
| Pickers     | calendar, time, timezone, date-time, icon + colour                                           |
| Composition | notes editor, swipe actions, split panes                                                     |

`tests/visual/storybook.spec.ts` screenshots 53 frames: every static story, eight
dark-theme variants, a rose/compact accent variant, four interactive states
(select open, combobox open, menu open, tooltip visible) and two phone viewports.

`tests/visual/accessibility.spec.ts` runs axe on every static story and on alerts
in dark mode. Component fragments are exempted only from the three document-level
rules (`region`, `landmark-one-main`, `page-has-heading-one`); everything else is
enforced.

## Determinism

- Storybook is built once; the suite serves `storybook-static/` from a loopback
  static server, so no dev server, HMR or rebuild runs during a test.
- Geist and Geist Mono are bundled locally via `@fontsource-variable/*`, matching
  the app's next/font choice without a network request.
- The preview decorator waits for `document.fonts.ready`, applies the theme and
  sets `data-story-ready` after two animation frames. Tests wait for that marker
  and for the requested theme before taking a screenshot.
- `page.clock.setFixedTime` freezes time, so "today" in the calendar and timezone
  offsets never drift.
- Screenshots disable animations and caret rendering; the diff budget is 0.1% of
  pixels, which tolerates anti-aliasing but not a layout or colour change.

Baselines are committed under `tests/visual/storybook.spec.ts-snapshots/`. They
are platform-suffixed (`-chromium-linux.png`); regenerate them in the CI visual
job's environment (Ubuntu 24.04 + the pinned Playwright Chromium) when a change
is intended. CI uploads the actual/diff images and the HTML report on failure.

## What the suite caught immediately

Adding the workbench exposed real defects rather than just recording them:

1. **Soft status tints were pink.** `color-mix(in oklch, …)` interpolates the
   hue of an achromatic white surface as 0, dragging every accent/status tint
   towards red. The derived tints now mix in `oklab`.
2. **Dialogs were pinned to the top-left.** Tailwind's preflight resets the UA's
   `margin: auto` on `<dialog>`; the modal and the command palette now set their
   own centring margins.
3. **Dark mode ignored the accent picker.** `[data-accent]` was declared after
   `[data-theme="dark"]`, so the light primitive always won. Accent bases are now
   theme-independent and dark mode re-derives a lighter fill with relative colour
   syntax.
4. **Six AA contrast failures** in the shared palette (muted text, success,
   warning, danger, accent text in both themes). Tokens were darkened/lightened
   until axe passed, and the visual baselines now guard the result.
5. **Accessible-name mismatches** in select, calendar day buttons, the popover
   panel and icon-only swipe actions.

## CI

The `visual` job installs Chromium, builds Storybook and runs
`pnpm test:visual`. It is separate from the end-to-end job because it needs no
database, mail server or application environment.
