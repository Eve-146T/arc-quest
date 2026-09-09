import {$, ARC} from './common.js';
let getState, canInput, act;
export function bindBoard(deps) {({getState, canInput, act} = deps);}
export function cancelGesture() {pointer = null;}

const rgba = ARC.map(c => [...c.slice(1).match(/../g).map(x => parseInt(x, 16)), 255]);
const ctx = $('#board').getContext('2d', {alpha: false}); ctx.imageSmoothingEnabled = false;
export function draw(frame) {
  if (!frame) return;
  const image = ctx.createImageData(64, 64);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) image.data.set(rgba[frame[y][x]], (y * 64 + x) * 4);
  ctx.putImageData(image, 0, 0);
}
export function drawAnimationFrame(raw, index) {
  const image = ctx.createImageData(64, 64);
  for (let i = 0; i < 4096; i++) image.data.set(rgba[raw.charCodeAt(index * 4096 + i)], i * 4);
  ctx.putImageData(image, 0, 0);
}
// Board gestures. A short press is a click (action 6) at the pressed cell; a longer drag is a swipe
// in the games that move. Both are decided on release, so a swipe never fires a click first.
const SWIPE = 18;
let pointer = null;
const board = $('#board');
board.addEventListener('pointerdown', e => {
  if (!canInput() || !e.isPrimary) return;
  e.preventDefault(); board.setPointerCapture(e.pointerId);
  pointer = {x: e.clientX, y: e.clientY, id: e.pointerId};
});
board.addEventListener('pointerup', e => {
  if (!pointer || pointer.id !== e.pointerId) return;
  const start = pointer; pointer = null;
  const state = getState();
  if (!state) return;
  const dx = e.clientX - start.x, dy = e.clientY - start.y, a = state.available;
  if (Math.hypot(dx, dy) >= SWIPE) {
    const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 4 : 3) : (dy > 0 ? 2 : 1);
    if (a.includes(dir)) act({id: dir});
    return;
  }
  if (!a.includes(6)) return;
  const r = board.getBoundingClientRect();
  act({id: 6, x: Math.max(0, Math.min(63, Math.floor((start.x - r.left) / r.width * 64))), y: Math.max(0, Math.min(63, Math.floor((start.y - r.top) / r.height * 64)))});
});
board.addEventListener('pointercancel', () => pointer = null);
board.addEventListener('contextmenu', e => e.preventDefault());
