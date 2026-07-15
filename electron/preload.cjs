const { contextBridge, ipcRenderer } = require('electron');

const IPC_PREFIX = 'gajae-app-desktop:';

function invoke(action, ...args) {
  return ipcRenderer.invoke(`${IPC_PREFIX}${action}`, ...args);
}

function onStateChanged(callback) {
  if (typeof callback !== 'function') {
    throw new TypeError('State change listener must be a function.');
  }

  const listener = (_event, state) => callback(state);
  ipcRenderer.on(`${IPC_PREFIX}state:changed`, listener);
  return () => {
    ipcRenderer.removeListener(`${IPC_PREFIX}state:changed`, listener);
  };
}

if (window.location.protocol === 'file:') {
  contextBridge.exposeInMainWorld('gajaeAppDesktop', {
    getState: () => invoke('state:get'),
    onStateChanged,
    openLocal: () => invoke('local:open'),
    listRemoteServers: () => invoke('remote-servers:list'),
    createRemoteServer: (server) => invoke('remote-servers:create', server),
    updateRemoteServer: (targetId, input) => invoke('remote-servers:update', { id: targetId, ...input }),
    deleteRemoteServer: (targetId) => invoke('remote-servers:delete', targetId),
    testRemoteServer: (targetId) => invoke('remote-servers:test', targetId),
    openRemoteServer: (targetId) => invoke('remote-servers:open', targetId),
    selectRemoteServer: (targetId) => invoke('remote-servers:select', targetId),
  });
}
