// Toketa Reise – Desktop-Fenster (Electron). Lädt die gebaute Web-App aus dist/.
const { app, BrowserWindow, shell, Menu, ipcMain, net } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');

if (!app.requestSingleInstanceLock()) { app.quit(); }

let win;
function create() {
  win = new BrowserWindow({
    width: 1180, height: 860, minWidth: 420, minHeight: 600,
    backgroundColor: '#0B0B12',
    title: 'Toketa Reise',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: path.join(__dirname, 'preload.cjs') },
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  // Externe Links im normalen Browser öffnen, nicht im App-Fenster
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file:')) { e.preventDefault(); if (/^https?:/i.test(url)) shell.openExternal(url); }
  });
}
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(create);
app.on('window-all-closed', () => app.quit());

/* ---------- Update im Programm: herunterladen, prüfen, still installieren, neu starten ---------- */
let updFile = null;
const OK_URL = /^https:\/\/github\.com\/toketa-ghub\/toketa-reise\/releases\/download\/pc-v[\d.]+\/Toketa-Reise-Setup\.exe$/;

ipcMain.handle('upd:download', async (e, info) => {
  if (!info || !OK_URL.test(String(info.url))) throw new Error('Ungültige Update-Adresse');
  const dest = path.join(os.tmpdir(), 'Toketa-Reise-Update-' + Date.now() + '.exe');
  const res = await net.fetch(info.url, { redirect: 'follow' });
  if (!res.ok || !res.body) throw new Error('Download fehlgeschlagen (' + res.status + ')');
  const total = Number(info.size) || Number(res.headers.get('content-length')) || 0;
  const hash = crypto.createHash('sha256');
  const out = fs.createWriteStream(dest);
  let got = 0, last = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    hash.update(value); got += value.length;
    if (!out.write(value)) await new Promise((r) => out.once('drain', r));
    const now = Date.now();
    if (total && now - last > 150) { last = now; e.sender.send('upd:progress', Math.min(99, Math.round((got / total) * 100))); }
  }
  await new Promise((r) => out.end(r));
  if (total && got !== total) { fs.unlink(dest, () => {}); throw new Error('Datei unvollständig'); }
  const want = String(info.digest || '').replace(/^sha256:/, '').toLowerCase();
  if (want && hash.digest('hex') !== want) { fs.unlink(dest, () => {}); throw new Error('Prüfsumme stimmt nicht'); }
  updFile = dest;
  e.sender.send('upd:progress', 100);
  return true;
});

ipcMain.handle('upd:install', () => {
  if (!updFile || !fs.existsSync(updFile)) throw new Error('Kein Update heruntergeladen');
  // Installer läuft still im Hintergrund, startet die App danach selbst neu
  spawn(updFile, ['/S', '--updated', '--force-run'], { detached: true, stdio: 'ignore' }).unref();
  setTimeout(() => app.quit(), 400);
  return true;
});
