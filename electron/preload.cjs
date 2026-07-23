const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('posOffline', {
  dbPing: () => ipcRenderer.invoke('db:ping'),
  getDbPath: () => ipcRenderer.invoke('db:getPath'),
  revealDbFile: () => ipcRenderer.invoke('db:revealFile'),
  openInDbBrowser: () => ipcRenderer.invoke('db:openInDbBrowser'),
  listSqliteUsers: () => ipcRenderer.invoke('db:listUsers'),
  listSqliteProducts: () => ipcRenderer.invoke('db:listProducts'),
  authLogin: (identifier, password) => ipcRenderer.invoke('auth:login', { identifier, password }),
  offlineApi: (method, path, body) => ipcRenderer.invoke('offline:api', { method, path, body }),
  posDb: (payload) => ipcRenderer.invoke('posDb', payload),
  printK80: (html, copies) => ipcRenderer.invoke('print:k80', { html, copies }),
});
