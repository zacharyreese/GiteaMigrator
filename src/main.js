const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const simpleGit = require('simple-git');
const fs = require('fs');
const os = require('os');

let mainWindow;

function normalizeGiteaUrl(url) {
  return url.replace(/\/$/, '');
}

function sendMigrationProgress(repo, status, message) {
  mainWindow.webContents.send('migrate:progress', {
    repo,
    status,
    message
  });
}

async function readApiError(response) {
  const text = await response.text().catch(() => '');
  if (!text) return response.status;

  try {
    const errorData = JSON.parse(text);
    return errorData.message || errorData.errors || response.status;
  } catch {
    return text;
  }
}

async function fetchGiteaUser(giteaUrl, giteaToken) {
  const userResponse = await fetch(normalizeGiteaUrl(giteaUrl) + '/api/v1/user', {
    headers: {
      'Authorization': `token ${giteaToken}`,
      'Accept': 'application/json'
    }
  });

  if (!userResponse.ok) {
    throw new Error(`Failed to fetch Gitea user: ${await readApiError(userResponse)}`);
  }

  return userResponse.json();
}

async function createLiveMirror({ githubToken, giteaUrl, giteaToken, giteaUser, repo, mirrorInterval }) {
  sendMigrationProgress(repo.name, 'creating-mirror', `Creating live mirror for ${repo.name}...`);

  const migrateResponse = await fetch(normalizeGiteaUrl(giteaUrl) + '/api/v1/repos/migrate', {
    method: 'POST',
    headers: {
      'Authorization': `token ${giteaToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({
      clone_addr: repo.clone_url,
      auth_token: githubToken,
      repo_name: repo.name,
      repo_owner: giteaUser.login || giteaUser.username,
      service: 'github',
      mirror: true,
      mirror_interval: mirrorInterval,
      private: repo.private,
      description: repo.description || ''
    })
  });

  if (!migrateResponse.ok) {
    const errorMessage = await readApiError(migrateResponse);
    if (migrateResponse.status === 409) {
      throw new Error('Repository already exists on Gitea. Pull mirrors can only be created for new repositories.');
    }

    throw new Error(`Failed to create live mirror: ${errorMessage}`);
  }

  sendMigrationProgress(
    repo.name,
    'mirror-ready',
    `Live mirror ready. Gitea will pull updates every ${mirrorInterval}.`
  );
}

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
    const apiUrl = normalizeGiteaUrl(url) + '/api/v1/user';
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
ipcMain.handle('migrate:repos', async (event, { githubToken, giteaUrl, giteaToken, repos, mode = 'copy', mirrorInterval = '10m' }) => {
  const results = [];
  const tempDir = path.join(os.tmpdir(), 'gitea-migrator');
  const isLiveMirror = mode === 'mirror';
  let giteaUser;

  try {
    giteaUser = await fetchGiteaUser(giteaUrl, giteaToken);
  } catch (error) {
    for (const repo of repos) {
      sendMigrationProgress(repo.name, 'error', `Failed to migrate ${repo.name}: ${error.message}`);
      results.push({ repo: repo.name, success: false, error: error.message });
    }

    return { results };
  }

  // Ensure temp directory exists
  if (!isLiveMirror && !fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  for (const repo of repos) {
    const repoDir = path.join(tempDir, repo.name);

    try {
      if (isLiveMirror) {
        await createLiveMirror({ githubToken, giteaUrl, giteaToken, giteaUser, repo, mirrorInterval });
        results.push({ repo: repo.name, success: true });
        continue;
      }

      // Notify progress
      sendMigrationProgress(repo.name, 'cloning', `Cloning ${repo.name}...`);

      // Clean up if exists
      if (fs.existsSync(repoDir)) {
        fs.rmSync(repoDir, { recursive: true, force: true });
      }

      // Clone from GitHub (mirror clone)
      const git = simpleGit();
      await git.clone(repo.clone_url.replace('https://', `https://${githubToken}@`), repoDir, ['--mirror']);

      // Create repo on Gitea
      sendMigrationProgress(repo.name, 'creating', `Creating ${repo.name} on Gitea...`);

      const giteaApiUrl = normalizeGiteaUrl(giteaUrl) + '/api/v1/user/repos';
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
        const errorMessage = await readApiError(createResponse);
        if (createResponse.status === 409 || String(errorMessage).includes('already exists')) {
          // Repo already exists, continue with push
          sendMigrationProgress(repo.name, 'exists', `${repo.name} already exists on Gitea, pushing updates...`);
        } else {
          throw new Error(`Failed to create repo: ${errorMessage}`);
        }
      }

      // Push to Gitea
      sendMigrationProgress(repo.name, 'pushing', `Pushing ${repo.name} to Gitea...`);

      const giteaLogin = giteaUser.login || giteaUser.username;
      const giteaRepoUrl = `${normalizeGiteaUrl(giteaUrl)}/${giteaLogin}/${repo.name}.git`;
      const giteaUrlWithAuth = giteaRepoUrl.replace('https://', `https://${giteaLogin}:${giteaToken}@`).replace('http://', `http://${giteaLogin}:${giteaToken}@`);

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

      sendMigrationProgress(repo.name, 'complete', `Successfully migrated ${repo.name}`);

      results.push({ repo: repo.name, success: true });
    } catch (error) {
      // Cleanup on error
      if (fs.existsSync(repoDir)) {
        fs.rmSync(repoDir, { recursive: true, force: true });
      }

      sendMigrationProgress(repo.name, 'error', `Failed to migrate ${repo.name}: ${error.message}`);

      results.push({ repo: repo.name, success: false, error: error.message });
    }
  }

  return { results };
});

