// Brücke zwischen Oberfläche und Programm: nur Update-Funktionen, sonst nichts.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('toketaDesktop', {
  downloadUpdate: (info) => ipcRenderer.invoke('upd:download', info),
  installUpdate: () => ipcRenderer.invoke('upd:install'),
  onProgress: (cb) => { ipcRenderer.removeAllListeners('upd:progress'); ipcRenderer.on('upd:progress', (_e, p) => cb(p)); },
});
