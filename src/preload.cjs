const { contextBridge, ipcRenderer } = require('electron');
async function invoke(channel, ...args) { const result = await ipcRenderer.invoke(channel, ...args); if (!result.ok) throw new Error(result.error); return result.value; }
contextBridge.exposeInMainWorld('tokenlight', {
  snapshot: () => invoke('get-snapshot'), refresh: id => invoke('refresh', id), month: value => invoke('set-month', value),
  appearance: mode => invoke('set-appearance', mode),
  layout: mode => invoke('set-layout', mode),
  saveKey: (id, key) => invoke('save-key', id, key), target: (id, value) => invoke('set-target', id, value),
  chooseSecrets: () => invoke('choose-secrets'), openProvider: (id, purpose) => invoke('open-provider', id, purpose),
  connect: id => invoke('connect', id), signInClaude: () => invoke('sign-in-claude'), demo: enabled => invoke('demo', enabled), export: () => invoke('export'),
  onSnapshot: callback => { const listener = (_e, value) => callback(value); ipcRenderer.on('snapshot', listener); return () => ipcRenderer.removeListener('snapshot', listener); },
  onConnections: callback => { const listener = () => callback(); ipcRenderer.on('show-connections', listener); return () => ipcRenderer.removeListener('show-connections', listener); }
});
