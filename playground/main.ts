import { createAtrium, replayAnimation, stagger, type MotionMode, type StatusTone, type ThemeName, type ToastType } from '../src';
import 'bootstrap-icons/font/bootstrap-icons.css';

const atrium = createAtrium();
(window as unknown as { atrium: typeof atrium }).atrium = atrium;

const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;

// Settings
const themeSelect = $<HTMLSelectElement>('#theme');
const motionSelect = $<HTMLSelectElement>('#motion');
themeSelect.value = atrium.theme;
motionSelect.value = atrium.motion;
themeSelect.addEventListener('change', () => atrium.setTheme(themeSelect.value as ThemeName));
motionSelect.addEventListener('change', () => atrium.setMotion(motionSelect.value as MotionMode));
atrium.select(themeSelect);
atrium.select(motionSelect);

// Resizable tiles
const tileSize = $<HTMLInputElement>('#tile-size');
tileSize.addEventListener('input', () => {
  const size = Number(tileSize.value);
  const demo = $('#tile-resize-demo');
  demo.style.setProperty('--atrium-tile-size', `${size}px`);
  demo.style.setProperty('--atrium-tile-icon', `${Math.round(size * 0.53)}px`);
  $('#tile-size-out').textContent = `${size}px`;
});

// Tooltip from code
atrium.tooltip.attach($('#tooltip-code'), 'Attached with atrium.tooltip.attach()', { placement: 'right' });

// Context menu
atrium.menu.bind($('#menu-target'), [
  { label: 'Open folder', icon: 'folder2-open', hint: 'Ctrl+O', onClick: () => atrium.toast.info('Folder opened') },
  { label: 'Rename', icon: 'pencil', hint: 'F2', onClick: () => atrium.toast.info('Rename') },
  { label: 'Change slot', icon: 'arrow-left-right', onClick: () => atrium.toast.info('Change slot') },
  { label: 'Disabled item', icon: 'slash-circle', disabled: true },
  'separator',
  { label: 'Uninstall', icon: 'trash3', danger: true, onClick: () => atrium.toast.error('Uninstalled') },
]);

// Forms
atrium.select($<HTMLSelectElement>('#f-select'), {
  onChange: (value) => atrium.toast.info('Sort by {{value}}', { params: { value } }),
});

// Feedback: animate the main progress bar
const progress = $('#progress-demo');
let pct = 64;
setInterval(() => {
  pct = pct >= 100 ? 8 : Math.min(100, pct + Math.round(Math.random() * 9 + 3));
  progress.style.setProperty('--atrium-progress', `${pct}%`);
  $('#progress-text').textContent = `${pct}% · ${((pct / 100) * 64).toFixed(1)} / 64.0 MB`;
}, 900);

const steps = Array.from(document.querySelectorAll<HTMLElement>('#steps-demo .atrium-step'));
steps.forEach((step, i) =>
  step.addEventListener('click', () => {
    steps.forEach((s, n) => {
      s.classList.toggle('is-active', n === i);
      s.classList.toggle('is-done', n < i);
    });
  }),
);

// App shell
const statusbar = atrium.statusbar($('#statusbar-demo'));
document.querySelectorAll<HTMLElement>('[data-status]').forEach((btn) => {
  btn.addEventListener('click', () => statusbar.set(btn.dataset.status!, (btn.dataset.tone as StatusTone) ?? 'default'));
});
$('#status-bounce').addEventListener('click', () => statusbar.bounce());
atrium.dropzone({
  target: $('#statusbar-demo'),
  accept: ['zip', 'rar', '7z'],
  onDrop: (files) => {
    statusbar.set(`Installing ${files.length} file${files.length > 1 ? 's' : ''}…`, 'busy');
    atrium.toast.success('{{count}} file(s) dropped', { params: { count: files.length } });
  },
  onReject: (files) => atrium.toast.warning('{{name}} is not a ZIP, RAR or 7Z', { params: { name: files[0].name } }),
});
atrium.windowControls({
  minimize: () => atrium.toast.info('Minimize'),
  maximize: () => atrium.toast.info('Maximize'),
  close: () => atrium.toast.warning('Close'),
});

// Tabs
atrium.tabs({ root: $('#main-tabs'), nav: $('#main-nav'), transition: 'slide' });
atrium.tabs({ root: $('#sub-tabs'), nav: $('#sub-nav'), transition: 'step' });

// Toggle groups: clicking a [data-toggle] button makes it the active one among its siblings
document.querySelectorAll<HTMLElement>('[data-toggle]').forEach((btn) => {
  btn.addEventListener('click', () => {
    btn.parentElement!.querySelectorAll('[data-toggle]').forEach((b) => b.classList.remove('is-active'));
    btn.classList.add('is-active');
  });
});

// Toasts
const messages: Record<ToastType, string> = {
  success: 'Mod installed successfully',
  error: 'Could not write to the folder',
  warning: '3 conflicts detected',
  info: 'An update is available',
};

document.querySelectorAll<HTMLElement>('[data-toast]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const type = btn.dataset.toast as ToastType;
    atrium.toast.show(type, messages[type]);
  });
});

$('#toast-action').addEventListener('click', () => {
  atrium.toast.info('{{count}} mods disabled', {
    params: { count: 4 },
    duration: 6000,
    action: { text: 'Undo', onClick: () => atrium.toast.success('Action undone') },
  });
});

$('#toast-burst').addEventListener('click', () => {
  const types: ToastType[] = ['success', 'info', 'warning', 'error', 'success'];
  types.forEach((type, i) => setTimeout(() => atrium.toast.show(type, `${messages[type]} #${i + 1}`, { duration: 5000 }), i * 150));
});

// Modals
$('#modal-basic').addEventListener('click', () => {
  atrium.modal.open({
    title: 'Mod information',
    icon: 'info-circle-fill',
    closeButton: true,
    body: '<p>The body can be trusted HTML or a DOM element.</p><p style="margin-top:12px;color:var(--atrium-text-secondary)">Escape or a click on the backdrop closes the modal.</p>',
    buttons: [
      { text: 'Close', variant: 'cancel' },
      { text: 'Open folder', variant: 'primary', onClick: () => { atrium.toast.info('Folder opened'); } },
    ],
  });
});

$('#modal-confirm').addEventListener('click', async () => {
  const ok = await atrium.modal.confirm({
    title: 'Uninstall this mod?',
    message: 'Its files will be permanently deleted.',
    confirmText: 'Uninstall',
    cancelText: 'Cancel',
    danger: true,
  });
  if (ok) atrium.toast.success('Mod uninstalled');
  else atrium.toast.info('Cancelled');
});

$('#modal-alert').addEventListener('click', () => {
  void atrium.modal.alert({ title: 'Done', message: 'All mods are up to date.', tone: 'success' });
});

$('#modal-form').addEventListener('click', () => {
  const body = document.createElement('div');
  body.innerHTML = `
    <label class="atrium-label" for="pg-name">New name</label>
    <input id="pg-name" class="atrium-input" placeholder="Leave empty to see the shake" />`;
  const input = body.querySelector('input')!;

  atrium.modal.open({
    title: 'Rename',
    icon: 'pencil-fill',
    body,
    clickOverlayToClose: false,
    buttons: [
      { text: 'Cancel', variant: 'cancel' },
      {
        text: 'Rename',
        variant: 'primary',
        onClick: (_e, modal) => {
          if (!input.value.trim()) {
            input.classList.add('is-invalid');
            modal.shake();
            return false;
          }
          atrium.toast.success('Renamed to "{{name}}"', { params: { name: input.value.trim() } });
        },
      },
    ],
  });
  input.addEventListener('input', () => input.classList.remove('is-invalid'));
});

$('#modal-stacked').addEventListener('click', () => {
  atrium.modal.open({
    title: 'First modal',
    size: 'large',
    body: '<p>Open a second modal on top.</p>',
    buttons: [
      { text: 'Close', variant: 'cancel' },
      {
        text: 'Open second',
        variant: 'primary',
        closeOnClick: false,
        onClick: () => {
          void atrium.modal.alert({ title: 'Second modal', message: 'It gets its own depth layer.' });
        },
      },
    ],
  });
});

// Entrance animations
const list = $('#list');
for (const name of ['Mario Classic', 'Link Twilight', 'Kirby Remix', 'Samus Dark', 'Fox Assault']) {
  const row = document.createElement('div');
  row.className = 'pg-card atrium-enter-list';
  row.style.setProperty('--atrium-delay', '0.3s');
  row.innerHTML = `<i class="bi bi-box-seam" style="color:var(--atrium-accent-color)"></i><span>${name}</span>`;
  list.appendChild(row);
}
stagger(list);

// Remember each node's entrance class: replayAnimation removes it once the animation ends.
const entranceNodes = [...$('#entrance').querySelectorAll<HTMLElement>('[class*="atrium-enter-"]')].map((node) => ({
  node,
  cls: [...node.classList].find((c) => c.startsWith('atrium-enter-'))!,
}));
$('#replay').addEventListener('click', () => {
  entranceNodes.forEach(({ node, cls }) => replayAnimation(node, cls));
});

// Token swatches
const swatches = $('#swatches');
for (const token of ['bg-primary', 'bg-tertiary', 'accent-color', 'success-color', 'warning-color', 'danger-color']) {
  const card = document.createElement('div');
  card.className = 'pg-card';
  card.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:8px;font-size:12px';
  card.innerHTML = `<div class="pg-swatch" style="background:var(--atrium-${token})"></div><code>--atrium-${token}</code>`;
  swatches.appendChild(card);
}
