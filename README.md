# Atrium-UI

MOSAIC's interface (theme, animations, buttons, forms, toasts, modals, menus, tooltips, tabs, app shell) as a reusable vanilla TypeScript library.

> **Attribution required.** Any project that uses Atrium-UI must show "UI by [Atrium-UI](https://github.com/MosaicFoundation/Atrium-UI)" **inside the app, in its About screen**. A mention only in a README or in the code is not enough. See [Attribution](#attribution) and [LICENSE](LICENSE).

## Install

From another project, as a git dependency:

```bash
npm install github:MosaicFoundation/Atrium-UI
```

or from a local checkout while developing:

```bash
npm install ../Atrium-UI
```

## Usage

```ts
import 'bootstrap-icons/font/bootstrap-icons.css'; // icons used by the components
import 'atrium-ui/style.css';
import { createAtrium } from 'atrium-ui';

const atrium = createAtrium({
  theme: 'dark',                              // 'dark' | 'light'
  motion: 'full',                             // 'full' | 'reduced' | 'none'
  t: (key, params) => i18n.t(key, params),    // optional: translation
  sounds: { play: (name) => sfx.play(name) }, // optional: 'complete' | 'error' | 'notification' | 'switchTab'
});

// Toasts
atrium.toast.success('Mod installed');
atrium.toast.info('{{count}} mods disabled', {
  params: { count: 4 },
  duration: 6000,
  action: { text: 'Undo', onClick: undo },
});

// Modals
const ok = await atrium.modal.confirm({
  title: 'Uninstall this mod?',
  message: 'Its files will be permanently deleted.',
  danger: true,
});

await atrium.modal.alert({ title: 'Done', message: 'All mods are up to date.', tone: 'success' });

const modal = atrium.modal.open({
  title: 'Rename',
  icon: 'pencil-fill',
  body: formElement, // a Node, or a trusted HTML string
  size: 'normal',    // 'small' | 'normal' | 'large' | 'fullscreen'
  buttons: [
    { text: 'Cancel', variant: 'cancel' },
    { text: 'Save', variant: 'primary', onClick: (_e, m) => { if (!valid) { m.shake(); return false; } } },
  ],
});

// Theme and motion at runtime
atrium.setTheme('light');
atrium.setMotion('reduced');
```

## Tabs

`atrium.tabs()` wires buttons to panels with MOSAIC's tab-switch animations:

- `'slide'`: the main tab switch. The outgoing panel slides left and fades out (0.3s) while the incoming one slides in from the right with a passing shadow (0.4s), and the `switchTab` sound plays.
- `'step'`: the settings sub-tabs. The incoming panel slides 14px in from the right or the left, depending on whether you move down or up the list.

```html
<nav id="sidebar">
  <button class="atrium-sidebar-btn" data-atrium-tab="mods"><i class="bi bi-grid"></i></button>
  <button class="atrium-sidebar-btn" data-atrium-tab="settings"><i class="bi bi-gear"></i></button>
</nav>
<div id="stage" style="flex: 1">
  <div data-atrium-panel="mods">…</div>
  <div data-atrium-panel="settings">…</div>
</div>
```

```ts
const tabs = atrium.tabs({
  root: document.querySelector('#stage'),
  nav: document.querySelector('#sidebar'),
  transition: 'slide',                         // or 'step'
  initial: 'mods',
  beforeChange: (name) => loadTabContent(name), // optional, awaited (lazy loading)
  onChange: (name, previous) => {},
});

tabs.show('settings');
```

Buttons get `.is-active` and panels are shown or hidden automatically. With `'slide'`, the panels stack inside `root`, so give `root` a size. With `motion: 'reduced'` or `'none'`, the switch is instant, as in MOSAIC.

MOSAIC drives the `'slide'` transition with GSAP. Atrium-UI replays the same timeline with the Web Animations API and GSAP's exact `power3` curves (sampled into CSS `linear()` easings), so GSAP is not a dependency. Checked frame by frame against GSAP 3.12.5 running MOSAIC's code: the largest difference is 0.1% opacity.

## Context menu

```ts
// Right-click menu on an element (items can also be computed from the event)
atrium.menu.bind(row, [
  { label: 'Open folder', icon: 'folder2-open', hint: 'Ctrl+O', onClick: openFolder },
  { label: 'Rename', icon: 'pencil', onClick: rename },
  'separator',
  { label: 'Uninstall', icon: 'trash3', danger: true, onClick: uninstall },
]);

// Or open it yourself, at the pointer or at a point
atrium.menu.open(event, items);
atrium.menu.open({ x: 120, y: 80 }, items);
```

It stays inside the window, closes on outside click, Escape, scroll, resize or window blur, and is keyboard navigable (arrows, Home, End).

## Select

`atrium.select()` turns a native `<select>` into MOSAIC's custom dropdown. The native element stays in the DOM and in sync, so forms and `select.value` keep working. Add `data-icon` to an `<option>` to show an icon.

```html
<select id="sort">
  <option value="name" data-icon="sort-alpha-down">Name</option>
  <option value="date" data-icon="calendar3">Date added</option>
</select>
```

```ts
const sort = atrium.select(document.querySelector('#sort'), { onChange: (value) => {} });
sort.setValue('date');
sort.refresh(); // after changing the <option>s
```

It opens upward when there is no room below and supports the keyboard (arrows, Home, End, Enter, Escape).

## Tooltips

Two kinds, both from MOSAIC:

```html
<!-- CSS only, for short labels. Positions: top (default), bottom, left, right -->
<button class="atrium-tile-btn atrium-tooltip" data-tooltip="Launch" data-tooltip-position="bottom">…</button>

<!-- Floating: never clipped by overflow, flips when there is no room, wraps, shows on keyboard focus -->
<button data-atrium-tooltip="Longer explanation…" data-atrium-tooltip-position="right" data-atrium-tooltip-delay="300">…</button>
```

```ts
const remove = atrium.tooltip.attach(element, 'Text', { placement: 'bottom', delay: 200 });
```

## App shell

`atrium-titlebar`, `atrium-sidebar`, `atrium-main`, `atrium-content` and `atrium-statusbar` rebuild MOSAIC's window layout; the full markup is at the top of `src/styles/components/shell.css`. Sizes come from `--atrium-titlebar-height`, `--atrium-sidebar-width` and `--atrium-statusbar-height`.

```ts
// Titlebar buttons with data-atrium-window="minimize|maximize|close"
atrium.windowControls({
  minimize: () => window.api.minimize(),
  maximize: () => window.api.maximize(),
  close: () => window.api.close(),
});

// Status bar with MOSAIC's blur-and-slide text swap
const status = atrium.statusbar(document.querySelector('.atrium-statusbar'));
status.set('Installing Mario Classic…', 'busy'); // 'default' | 'success' | 'warning' | 'error' | 'busy'
status.setRight('v1.0.0');
status.bounce();
```

### Drop zone

MOSAIC's file drop target: while files are dragged over the window, the status bar grows to 180px with a dashed edge and a bouncing "Drop files here" card. Text drags are ignored, and folders always pass the `accept` filter.

```ts
atrium.dropzone({
  target: document.querySelector('.atrium-statusbar'), // default: the first status bar
  accept: ['zip', 'rar', '7z'],                         // default: everything
  when: () => tabs.current === 'mods',                  // optional, as MOSAIC only accepts drops on its Mods tab
  onDrop: (files) => install(files),
  onReject: (files) => atrium.toast.warning('Unsupported file'),
  title: 'Drop mod files here',                         // badge, title, hint and icon are customisable
});
```

## Buttons

Every MOSAIC button family has an equivalent, verified identical at rest, on hover and on click:

| MOSAIC | Atrium-UI |
| --- | --- |
| `.modal-btn` + `-primary` / `-danger` / `-cancel` / `-secondary` | `.atrium-btn` + `atrium-btn-primary` / `-danger` / `-cancel` / `-secondary` |
| `.input-btn` | `.atrium-input-btn` |
| `.settings-btn` | `.atrium-settings-btn` |
| `.settings-btn-action` (+ `-content`, `-title`, `-desc`, `-danger`) | `.atrium-action-card` (+ `-content`, `-title`, `-desc`, `-danger`) |
| `.settings-tab-btn.active` | `.atrium-tab-btn.is-active` |
| `.action-btn` (+ `.action-btn-tooltip`) | `.atrium-tile-btn` (+ `.atrium-tooltip` with `data-tooltip`) |
| _(new)_ | `.atrium-tile-btn.is-large` / `.is-xl`: tiles with an icon and a label, same hover grow |
| `.action-btn-small` | `.atrium-icon-btn-sm` (+ `atrium-tone-accent` / `-danger`) |
| `.download-action-btn` | `.atrium-icon-btn` (+ `atrium-tone-warning` / `-success` / `-danger` / `-accent`) |
| `.logs-action-btn` | `.atrium-tool-btn` (+ `.is-active`) |
| `.logs-filter-btn` | `.atrium-filter-btn` (+ `.is-active`) |
| `.smart-rename-filter-btn` | `.atrium-chip-btn` |
| `.social-btn` + `-primary` / `-secondary` / `-danger` / `-success` | `.atrium-block-btn` + same variants (`.is-inline` for the non-full-width version) |
| `.social-btn-link` | `.atrium-link-btn` |
| `.social-compact-action-btn` / `.social-icon-action-btn` | `.atrium-compact-btn` / `.atrium-compact-btn.is-icon` |
| `.tutorial-btn` + `-primary` / `-secondary` / `-ghost` | `.atrium-cta-btn` + same variants |
| `.titlebar-btn` (+ `.close`) | `.atrium-titlebar-btn` (+ `.is-close`) |
| `.sidebar-btn.active` | `.atrium-sidebar-btn.is-active` |

As in MOSAIC, buttons and inputs use Chromium's control font (Arial), through `--atrium-font-control`.

Tiles are resizable through CSS variables, set on the tile, a parent or `:root`: `--atrium-tile-size` (square tiles), `--atrium-tile-width`, `--atrium-tile-height`, `--atrium-tile-icon`, `--atrium-tile-label`, `--atrium-tile-radius`, `--atrium-tile-hover-scale`.

```html
<div style="--atrium-tile-size: 80px; --atrium-tile-icon: 42px">
  <button class="atrium-tile-btn"><i class="bi bi-play-fill"></i></button>
</div>
```

## Forms and feedback

Each class maps to a MOSAIC element and was checked against MOSAIC's stylesheet at rest, on hover and on focus. The full mapping is at the top of `form.css` and `feedback.css`.

| MOSAIC | Atrium-UI |
| --- | --- |
| `.modal-input`, `.input-field`, `.settings-input`, `.characters-search` | `.atrium-input`, `.atrium-field`, `.atrium-settings-input`, `.atrium-search` |
| `.smart-rename-search-wrapper` | `.atrium-input-icon` (input with a leading icon) |
| `.settings-switch` | `.atrium-switch` > `input[type=checkbox]` + `.atrium-switch-slider` |
| `.smart-rename-checkbox`, `.social-theme-range` | `.atrium-checkbox`, `.atrium-range` |
| `.download-progress-bar` (+ indeterminate), `.ext-progress-container` | `.atrium-progress` (+ `.is-indeterminate`, `.is-thin`, `.is-success`, `.is-error`), value in `--atrium-progress` |
| `.social-loading`, skeleton blocks | `.atrium-loading`, `.atrium-skeleton` (+ `-line`, `-title`, `-pill`, `-circle`, `-block`) |
| `.downloads-empty`, `.characters-empty-state`, `.stages-empty-state` | `.atrium-empty` (+ `.is-compact`, `.is-boxed`, `.is-error`) |
| `.social-mod-badge`, `.conflict-header-badge`, `.smart-rename-status-badge` | `.atrium-badge` (+ `-success` / `-warning` / `-danger` / `-neutral`, `.is-solid`, `.is-caps`) |
| `.plugin-status`, `.status-item`, `.tutorial-progress-dot` | `.atrium-dot`, `.atrium-status-item`, `.atrium-steps` > `.atrium-step` |

## Other classes

| Class | Effect |
| --- | --- |
| `atrium-input`, `atrium-label` | Form fields (`is-invalid` for the error state) |
| `atrium-enter-fade` / `-slide-up` / `-slide-down` / `-slide-right` / `-scale` / `-pop` | Entrance animations, delayed with `--atrium-delay`. They release the element when done, so hover effects keep working |
| `atrium-enter-list` + `stagger(container)` | Cascading entrance for list items |
| `atrium-lift` | Hover lift of MOSAIC's action buttons |
| `atrium-shake`, `atrium-bounce`, `atrium-spin` | One-shot animations (replay with `replayAnimation`) |
| `atrium-shell` on `<body>` | Full-window layout for an Electron app |

## Theme

All tokens are `--atrium-*` CSS variables (see `src/styles/tokens.css`). Override them to customise the look:

```css
:root {
  --atrium-accent-color: #ff7a59;
  --atrium-accent-rgb: 255, 122, 89;
  --atrium-accent-hover: #e0603f;
}
```

## Development

```bash
npm install
npm run dev      # playground on http://localhost:5173
npm run build    # dist/atrium-ui.js, dist/atrium-ui.css, dist/types
```

## Roadmap

- [x] Tokens, light/dark theme, motion modes
- [x] Toasts, modals, buttons, inputs, entrance animations
- [x] Tab switch animations (main tabs and settings sub-tabs)
- [x] Context menu, custom select, tooltips, form controls, progress, loading, skeletons, empty states, badges
- [x] Titlebar, sidebar and status bar
- [x] File drop zone in the status bar
- [ ] MOSAIC's expanding "dynamic island" download panel in the status bar
- [ ] `atrium-ui/electron` preload helpers for the window controls
- [ ] Built-in UI sounds, splash screen and loading Lottie
- [ ] Guided tutorial

## Attribution

Atrium-UI is released under the [Atrium-UI License](LICENSE): MIT, plus one condition. Any product that uses Atrium-UI, in whole or in part (modified versions and derived styles or animations included), must show this credit **inside its own interface**:

```
UI by Atrium-UI — https://github.com/MosaicFoundation/Atrium-UI
```

- **Where:** in the product's About screen. If it has none, in an equivalent screen users can open from the app (Credits, Settings).
- **Not enough on its own:** a README, the docs, a code comment or anything users don't see inside the product. Those are welcome in addition, never instead.
- **Wording:** "UI by Atrium-UI" or a faithful translation, with the link wherever the screen can show one.
