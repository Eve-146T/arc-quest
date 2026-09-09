import {$, icon, reduced} from './common.js';

// ---- screens
const screens = ['launch', 'onboarding', 'home', 'game', 'detail'];
export let screenName = 'launch';
let detailStack = [], detailReturn = null;
export function show(name, back = false) {
  const changed = screenName !== name;
  screenName = name;
  for (const s of screens) $('#' + s).hidden = s !== name;
  if (changed && !reduced) {const el = $('#' + name); el.getAnimations().forEach(a => a.cancel()); el.animate([{opacity: .72}, {opacity: 1}], {duration: 110, easing: 'ease-out'});}
}

// Native modal focus and keyboard containment keep the board inert behind overlays.
let overlayDismiss = null, overlayClosing = false;
export function gameOverlay(title, content, cls, onDismiss = null) {
  closeGameOverlay(); overlayDismiss = onDismiss;
  const dialog = $('#game-dialog'); dialog.className = cls;
  $('#overlay-body').innerHTML = `<header class="overlay-header"><h2 id="overlay-title">${title}</h2><button class="overlay-close" aria-label="Close">${icon('close')}</button></header>${content}`;
  $('.overlay-close').onclick = dismissGameOverlay;
  dialog.showModal();
}
export function closeGameOverlay() {
  const dialog = $('#game-dialog');
  overlayClosing = false; dialog.getAnimations().forEach(a => a.cancel()); overlayDismiss = null;
  if (dialog.open) dialog.close();
}
export function dismissGameOverlay() {
  if (overlayClosing || !$('#game-dialog').open) return;
  const dialog = $('#game-dialog'), done = () => {const cb = overlayDismiss; closeGameOverlay(); cb?.();};
  overlayClosing = true;
  if (reduced) done();
  else dialog.animate([{opacity: 1, transform: 'translateY(0)'}, {opacity: 0, transform: 'translateY(8px)'}], {duration: 90, easing: 'ease-in'}).finished.then(done).catch(() => {});
}
$('#game-dialog').addEventListener('cancel', e => {e.preventDefault(); dismissGameOverlay();});
let backdropPress = false;
$('#game-dialog').addEventListener('pointerdown', e => {const r = e.currentTarget.getBoundingClientRect(); backdropPress = e.target === e.currentTarget && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom);});
$('#game-dialog').addEventListener('click', e => {if (backdropPress && e.target === e.currentTarget) dismissGameOverlay(); backdropPress = false;});

// ---- Full pages. Preserve DOM handlers and scroll when returning to a parent page.
export function closeDetails(reveal = true) {
  if (reveal && screenName === 'detail') show(detailStack[0]?.screen ?? 'home', true);
  detailStack = []; detailReturn = null;
}
export function detailPage(title, content, onBack = null, cls = '') {
  detailStack.push({screen: screenName, title: $('#detail-title').textContent, nodes: [...$('#detail-body').childNodes], scroll: $('#detail-body').scrollTop, onBack: detailReturn, cls: $('#detail').className, focus: document.activeElement});
  detailReturn = onBack;
  $('#detail').className = `screen detail-screen ${cls}`;
  $('#detail-title').textContent = title;
  $('#detail-body').innerHTML = content;
  $('#detail-body').scrollTop = 0;
  show('detail');
  $('#detail-title').focus({preventScroll: true});
}
export function goDetailBack() {
  if (screenName !== 'detail') return;
  const cb = detailReturn, prev = detailStack.pop(); detailReturn = prev?.onBack ?? null;
  if (prev?.screen === 'detail') {
    $('#detail-title').textContent = prev.title; $('#detail-body').replaceChildren(...prev.nodes);
    $('#detail').className = prev.cls; $('#detail-body').scrollTop = prev.scroll;
    if (!reduced) $('#detail-body').animate([{opacity: .72}, {opacity: 1}], {duration: 110});
  } else show(prev?.screen ?? 'home', true);
  prev?.focus?.focus({preventScroll: true});
  cb?.();
}

