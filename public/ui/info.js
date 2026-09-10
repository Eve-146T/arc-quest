import {$} from './common.js';
import {detailPage} from './navigation.js';

export function showInfo(onIntro) {
  detailPage('How it works', `<div class="about-copy app-info">
    <p>A friendly Android app for playing the ARC-AGI-3 games that GPT6-Astra scored so well on. Made with help from GPT6-Astra.</p>
    <h3>Sandbox</h3>
    <p>Play every level in any order and aim for the fewest actions. Your best clear determines your score; actions from earlier attempts are left out.</p>
    <p>Scores measure action efficiency against a human baseline that includes retries. That gives you an advantage in Sandbox, so reaching the maximum score is much easier.</p>
    <h3>Benchmark</h3>
    <p>Play the full ARC-AGI-3 benchmark on your phone, with the freedom to pause and resume at any time.</p>
    <p>All actions from earlier attempts stay in your score, and restarting adds one action. A high score is harder to earn here: think before you tap.</p>
    <p>“% complete” is the share of levels you’ve cleared. Your score measures action efficiency: matching the human baseline earns 100%; fewer actions can earn up to 115% per level.</p>
    <p>Found a bug or behavior that differs from the official benchmark? <a href="https://github.com/Eve-146T/arc-agi3/issues" target="_blank" rel="noopener">Report it on GitHub ↗</a></p>
    <div class="info-links"><button id="show-credits" class="text-button">Credits & licenses</button><button id="replay-intro" class="text-button">Show intro</button></div>
  </div>`);
  $('#show-credits').onclick = showCredits;
  $('#replay-intro').onclick = onIntro;
}

async function readAsset(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url}`);
  return response.text();
}

async function showCredits() {
  detailPage('Credits & licenses', '<div class="about-copy app-info credits-copy" aria-busy="true">Loading credits…</div>');
  const content = $('#detail-body .credits-copy');
  try {
    const document = new DOMParser().parseFromString(await readAsset('./credits.html'), 'text/html');
    document.body.querySelector(':scope > a')?.remove();
    document.body.querySelector('h1')?.remove();
    content.innerHTML = document.body.innerHTML;
    content.onclick = e => {
      const link = e.target.closest('a');
      if (!link || link.origin !== location.origin) return;
      e.preventDefault();
      showLicense(link.textContent, link.href);
    };
  } catch {
    content.textContent = 'Credits could not be loaded. Go back and try again.';
  } finally {content.removeAttribute('aria-busy');}
}

async function showLicense(title, url) {
  detailPage(title, '<pre class="license-copy" aria-busy="true">Loading…</pre>');
  const content = $('#detail-body .license-copy');
  try {content.textContent = await readAsset(url);}
  catch {content.textContent = 'This document could not be loaded. Go back and try again.';}
  finally {content.removeAttribute('aria-busy');}
}
