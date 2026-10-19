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
    if (n && asset && (!best || n > best.build)) best = { build: n, url: asset.browser_download_url, name: '1.0.' + n, size: asset.size, digest: asset.digest || '' };
  }
  if (best && best.build > BUILD) return { status: 'new', ...best };
  return { status: 'current' };
}

let bar;
function paint(html) { bar.innerHTML = html; }
function showBar(u) {
  if (!bar) { bar = document.createElement('div'); bar.id = 'updBar'; document.body.appendChild(bar); }
  const mb = u.size ? ' · ' + (u.size / 1048576).toFixed(0) + ' MB' : '';
  paint('<div class="ut"><b>Update verfügbar</b><span>Version ' + u.name + mb + '</span></div>' +
    '<button class="btn sm primary" type="button" data-u="go">Jetzt aktualisieren</button><button class="btn sm" type="button" data-u="later">Später</button>');
  bar.classList.add('on');
  bar.onclick = e => {
    const a = e.target.closest('[data-u]'); if (!a) return;
    if (a.dataset.u === 'go') startUpdate(u);
    else bar.classList.remove('on');
  };
  const b = document.querySelector('#updBtn'); if (b) b.classList.add('hot');
}
function progress(u, pct, text) {
  paint('<div class="ut"><b>' + text + '</b><div class="pbar"><i style="width:' + pct + '%"></i></div></div>');
}
function fail(u, why) {
  paint('<div class="ut"><b>Update fehlgeschlagen</b><span>' + why + '</span></div>' +
    '<button class="btn sm primary" type="button" data-u="go">Nochmal</button><button class="btn sm" type="button" data-u="web">Im Browser laden</button><button class="btn sm" type="button" data-u="later">Schließen</button>');
  bar.onclick = e => {
    const a = e.target.closest('[data-u]'); if (!a) return;
    if (a.dataset.u === 'go') startUpdate(u);
    else if (a.dataset.u === 'web') { openExternal(u.url); bar.classList.remove('on'); }
    else bar.classList.remove('on');
  };
}

async function startUpdate(u) {
  bar.onclick = null;
  progress(u, 0, 'Lade Update ' + u.name + ' …');
  try {
    if (platform() === 'pc') {
      const d = window.toketaDesktop;
      if (!d) throw new Error('Funktion nicht verfügbar');
      d.onProgress(p => progress(u, p, 'Lade Update ' + u.name + ' … ' + p + ' %'));
      await d.downloadUpdate({ url: u.url, size: u.size, digest: u.digest });
      progress(u, 100, 'Installiere … das Programm startet gleich neu');
      await d.installUpdate();
    } else {
      const { registerPlugin } = await import('@capacitor/core');
      const Inst = registerPlugin('ApkInstaller');
      const ok = await Inst.canInstall();
      if (!ok.allowed) {
        paint('<div class="ut"><b>Einmalig erlauben</b><span>Android fragt gleich, ob Toketa Reise Apps installieren darf. Schalte es ein und gehe zurück.</span></div>' +
          '<button class="btn sm primary" type="button" data-u="perm">Einstellung öffnen</button><button class="btn sm" type="button" data-u="later">Abbrechen</button>');
        bar.onclick = async e => {
          const a = e.target.closest('[data-u]'); if (!a) return;
          if (a.dataset.u === 'perm') { await Inst.openSettings(); showBar(u); } else bar.classList.remove('on');
        };
        return;
      }
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      const h = await Filesystem.addListener('progress', ev => {
        if (ev.contentLength) { const p = Math.min(99, Math.round(ev.bytes / ev.contentLength * 100)); progress(u, p, 'Lade Update ' + u.name + ' … ' + p + ' %'); }
      });
      let res;
      try { res = await Filesystem.downloadFile({ url: u.url, path: 'Toketa-Reise-Update.apk', directory: Directory.Cache, progress: true, recursive: true }); }
      finally { h.remove(); }
      if (u.size) { const st = await Filesystem.stat({ path: 'Toketa-Reise-Update.apk', directory: Directory.Cache }); if (st.size !== u.size) throw new Error('Datei unvollständig'); }
      progress(u, 100, 'Installation startet … bitte bestätigen');
      await Inst.install({ path: res.path });
      setTimeout(() => showBar(u), 4000);
    }
  } catch (e) {
    fail(u, String((e && e.message) || e).slice(0, 90));
  }
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
