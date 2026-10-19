/* Update-Prüfung: fragt bei GitHub nach der neuesten Version (Releases) und bietet den Download an. */
import { isNative, openExternal } from './native.js';

const REPO = 'toketa-ghub/toketa-reise';
export const BUILD = Number(typeof __APP_BUILD__ !== 'undefined' ? __APP_BUILD__ : 0) || 0;

export function platform() {
  if (isNative()) return 'android';
  if (/Electron\//.test(navigator.userAgent)) return 'pc';
  return 'web';
}
const PREFIX = { android: 'v1.0.', pc: 'pc-v1.0.' };
const ASSET = { android: /\.apk$/i, pc: /\.exe$/i };

export function versionText() { return BUILD ? '1.0.' + BUILD : 'Entwicklung'; }

export async function checkUpdate() {
  const p = platform();
  if (p === 'web') return { status: 'web' };
  const r = await fetch('https://api.github.com/repos/' + REPO + '/releases?per_page=30', { headers: { Accept: 'application/vnd.github+json' } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const list = await r.json();
  let best = null;
  for (const rel of list) {
    if (rel.draft || !rel.tag_name || !rel.tag_name.startsWith(PREFIX[p])) continue;
    const n = Number(rel.tag_name.slice(PREFIX[p].length));
    const asset = (rel.assets || []).find(a => ASSET[p].test(a.name));
    if (n && asset && (!best || n > best.build)) best = { build: n, url: asset.browser_download_url, name: '1.0.' + n, size: asset.size };
  }
  if (best && best.build > BUILD) return { status: 'new', ...best };
  return { status: 'current' };
}

let bar;
function showBar(u) {
  if (!bar) { bar = document.createElement('div'); bar.id = 'updBar'; document.body.appendChild(bar); }
  bar.innerHTML = '<div class="ut"><b>Update verfügbar</b><span>Version ' + u.name + (u.size ? ' · ' + (u.size / 1048576).toFixed(0) + ' MB' : '') + '</span></div>' +
    '<button class="btn sm primary" type="button" data-u="get">Herunterladen</button><button class="btn sm" type="button" data-u="later">Später</button>';
  bar.classList.add('on');
  bar.onclick = e => {
    const a = e.target.closest('[data-u]'); if (!a) return;
    if (a.dataset.u === 'get') openExternal(u.url);
    bar.classList.remove('on');
  };
  const b = document.querySelector('#updBtn'); if (b) b.classList.add('hot');
}

/* manual=true: Ergebnis immer melden. Sonst nur still prüfen und bei Neuem das Banner zeigen. */
export async function runCheck(manual, toast) {
  try {
    const u = await checkUpdate();
    if (u.status === 'new') { showBar(u); if (manual) toast('Neue Version ' + u.name + ' ist da'); return u; }
    if (manual) toast(u.status === 'web' ? 'Im Browser immer aktuell' : 'Du hast die neueste Version (' + versionText() + ')');
    return u;
  } catch (e) {
    if (manual) toast('Update-Suche nicht möglich. Bist du online?');
    return null;
  }
}

export function initUpdates(toast) {
  const b = document.querySelector('#updBtn');
  if (b) { b.textContent = 'Nach Updates suchen · ' + versionText(); b.onclick = () => runCheck(true, toast); if (platform() === 'web') b.hidden = true; }
  if (platform() !== 'web') setTimeout(() => runCheck(false, toast), 2500);
}
