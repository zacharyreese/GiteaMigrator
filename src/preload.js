const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // GitHub
  githubValidateToken: (token) => ipcRenderer.invoke('github:validateToken', token),
  githubFetchRepos: (token) => ipcRenderer.invoke('github:fetchRepos', token),

  // Gitea
  giteaValidateConnection: (url, token) => ipcRenderer.invoke('gitea:validateConnection', { url, token }),

  // Migration
  migrateRepos: (githubToken, giteaUrl, giteaToken, repos, options = {}) =>
    ipcRenderer.invoke('migrate:repos', { githubToken, giteaUrl, giteaToken, repos, ...options }),

  // Progress listener
  onMigrationProgress: (callback) => {
    ipcRenderer.on('migrate:progress', (event, data) => callback(data));
  },

  // Remove listener
  removeMigrationProgress: () => {
    ipcRenderer.removeAllListeners('migrate:progress');
  },

  // Open external URL
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url)
});

