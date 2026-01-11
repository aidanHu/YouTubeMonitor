
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
    refreshCookies: () => ipcRenderer.invoke('refresh-cookies')
});
