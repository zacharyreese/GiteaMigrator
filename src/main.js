const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const simpleGit = require('simple-git');
const fs = require('fs');
const os = require('os');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0d1117',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Open external URL
ipcMain.handle('shell:openExternal', async (event, url) => {
  await shell.openExternal(url);
});

// GitHub API calls
ipcMain.handle('github:fetchRepos', async (event, token) => {
  try {
    const repos = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await fetch(`https://api.github.com/user/repos?per_page=100&page=${page}&affiliation=owner`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Gitea-Migrator'
        }
      });

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`);
      }

      const data = await response.json();
      repos.push(...data);

      if (data.length < 100) {
        hasMore = false;
      } else {
        page++;
      }
    }

    return { success: true, repos };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('github:validateToken', async (event, token) => {
  try {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Gitea-Migrator'
      }
    });

    if (!response.ok) {
      throw new Error('Invalid token');
    }

    const user = await response.json();
    return { success: true, user };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Gitea API calls
ipcMain.handle('gitea:validateConnection', async (event, { url, token }) => {
  try {
    const apiUrl = url.replace(/\/$/, '') + '/api/v1/user';
    console.log('Attempting to connect to Gitea:', apiUrl);
    
    const response = await fetch(apiUrl, {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/json'
      }
    });

    console.log('Gitea response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.log('Gitea error response:', errorText);
      throw new Error(`HTTP ${response.status}: ${errorText || 'Invalid credentials'}`);
    }

    const user = await response.json();
    console.log('Gitea user:', user);
    return { success: true, user };
  } catch (error) {
    console.error('Gitea connection error:', error);
    return { success: false, error: error.message };
  }
});

// Migration logic
ipcMain.handle('migrate:repos', async (event, { githubToken, giteaUrl, giteaToken, repos }) => {
  const results = [];
  const tempDir = path.join(os.tmpdir(), 'gitea-migrator');

  // Ensure temp directory exists
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  for (const repo of repos) {
    const repoDir = path.join(tempDir, repo.name);

    try {
      // Notify progress
      mainWindow.webContents.send('migrate:progress', {
        repo: repo.name,
        status: 'cloning',
        message: `Cloning ${repo.name}...`
      });

      // Clean up if exists
      if (fs.existsSync(repoDir)) {
        fs.rmSync(repoDir, { recursive: true, force: true });
      }

      // Clone from GitHub (mirror clone)
      const git = simpleGit();
      await git.clone(repo.clone_url.replace('https://', `https://${githubToken}@`), repoDir, ['--mirror']);

      // Create repo on Gitea
      mainWindow.webContents.send('migrate:progress', {
        repo: repo.name,
        status: 'creating',
        message: `Creating ${repo.name} on Gitea...`
      });

      const giteaApiUrl = giteaUrl.replace(/\/$/, '') + '/api/v1/user/repos';
      const createResponse = await fetch(giteaApiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `token ${giteaToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          name: repo.name,
          description: repo.description || '',
          private: repo.private,
          default_branch: repo.default_branch || 'main'
        })
      });

      if (!createResponse.ok) {
        const errorData = await createResponse.json().catch(() => ({}));
        if (createResponse.status === 409 || (errorData.message && errorData.message.includes('already exists'))) {
          // Repo already exists, continue with push
          mainWindow.webContents.send('migrate:progress', {
            repo: repo.name,
            status: 'exists',
            message: `${repo.name} already exists on Gitea, pushing updates...`
          });
        } else {
          throw new Error(`Failed to create repo: ${errorData.message || createResponse.status}`);
        }
      }

      const giteaRepoData = await createResponse.json().catch(() => null);

      // Get Gitea user for repo URL
      const userResponse = await fetch(giteaUrl.replace(/\/$/, '') + '/api/v1/user', {
        headers: {
          'Authorization': `token ${giteaToken}`,
          'Accept': 'application/json'
        }
      });
      const giteaUser = await userResponse.json();

      // Push to Gitea
      mainWindow.webContents.send('migrate:progress', {
        repo: repo.name,
        status: 'pushing',
        message: `Pushing ${repo.name} to Gitea...`
      });

      const giteaRepoUrl = `${giteaUrl.replace(/\/$/, '')}/${giteaUser.login}/${repo.name}.git`;
      const giteaUrlWithAuth = giteaRepoUrl.replace('https://', `https://${giteaUser.login}:${giteaToken}@`).replace('http://', `http://${giteaUser.login}:${giteaToken}@`);

      const repoGit = simpleGit(repoDir);
      await repoGit.addRemote('gitea', giteaUrlWithAuth).catch(() => {
        // Remote might already exist
        return repoGit.remote(['set-url', 'gitea', giteaUrlWithAuth]);
      });

      // Push all branches and tags, but exclude GitHub-specific pull request refs
      // Using --all for branches and --tags for tags instead of --mirror
      await repoGit.push('gitea', '--all', '--force');
      await repoGit.push('gitea', '--tags', '--force');

      // Cleanup
      fs.rmSync(repoDir, { recursive: true, force: true });

      mainWindow.webContents.send('migrate:progress', {
        repo: repo.name,
        status: 'complete',
        message: `Successfully migrated ${repo.name}`
      });

      results.push({ repo: repo.name, success: true });
    } catch (error) {
      // Cleanup on error
      if (fs.existsSync(repoDir)) {
        fs.rmSync(repoDir, { recursive: true, force: true });
      }

      mainWindow.webContents.send('migrate:progress', {
        repo: repo.name,
        status: 'error',
        message: `Failed to migrate ${repo.name}: ${error.message}`
      });

      results.push({ repo: repo.name, success: false, error: error.message });
    }
  }

  return { results };
});

