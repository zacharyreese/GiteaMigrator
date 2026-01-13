// State
const state = {
  githubToken: null,
  githubUser: null,
  giteaUrl: null,
  giteaToken: null,
  giteaUser: null,
  repos: [],
  selectedRepos: new Set(),
  isConnected: {
    github: false,
    gitea: false
  }
};

// DOM Elements
const elements = {
  // Navigation
  navItems: document.querySelectorAll('.nav-item'),
  navRepos: document.getElementById('nav-repos'),
  navMigrate: document.getElementById('nav-migrate'),
  
  // Sections
  sectionConnect: document.getElementById('section-connect'),
  sectionRepos: document.getElementById('section-repos'),
  sectionMigrate: document.getElementById('section-migrate'),
  
  // GitHub
  githubCard: document.getElementById('github-card'),
  githubToken: document.getElementById('github-token'),
  githubUser: document.getElementById('github-user'),
  githubStatus: document.getElementById('github-status'),
  connectGithub: document.getElementById('connect-github'),
  statusGithub: document.getElementById('status-github'),
  
  // Gitea
  giteaCard: document.getElementById('gitea-card'),
  giteaUrl: document.getElementById('gitea-url'),
  giteaToken: document.getElementById('gitea-token'),
  giteaUser: document.getElementById('gitea-user'),
  giteaStatus: document.getElementById('gitea-status'),
  connectGitea: document.getElementById('connect-gitea'),
  statusGitea: document.getElementById('status-gitea'),
  
  // Proceed
  proceedSection: document.getElementById('proceed-section'),
  proceedToRepos: document.getElementById('proceed-to-repos'),
  
  // Repos
  repoSearch: document.getElementById('repo-search'),
  selectAll: document.getElementById('select-all'),
  selectedCount: document.getElementById('selected-count'),
  reposList: document.getElementById('repos-list'),
  backToConnect: document.getElementById('back-to-connect'),
  startMigration: document.getElementById('start-migration'),
  
  // Migration
  migrationProgress: document.getElementById('migration-progress'),
  migrationSubtitle: document.getElementById('migration-subtitle'),
  backToRepos: document.getElementById('back-to-repos'),
  newMigration: document.getElementById('new-migration')
};

// Initialize
document.addEventListener('DOMContentLoaded', init);

function init() {
  setupEventListeners();
  setupProgressListener();
}

function setupEventListeners() {
  // Navigation
  elements.navItems.forEach(item => {
    item.addEventListener('click', () => {
      if (!item.disabled) {
        switchSection(item.dataset.section);
      }
    });
  });

  // Toggle password visibility
  document.querySelectorAll('.toggle-visibility').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.target);
      input.type = input.type === 'password' ? 'text' : 'password';
    });
  });

  // GitHub connection
  elements.connectGithub.addEventListener('click', connectGithub);
  elements.githubToken.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') connectGithub();
  });

  // Gitea connection
  elements.connectGitea.addEventListener('click', connectGitea);
  elements.giteaToken.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') connectGitea();
  });

  // Proceed to repos
  elements.proceedToRepos.addEventListener('click', () => {
    switchSection('repos');
    loadRepos();
  });

  // Repo search
  elements.repoSearch.addEventListener('input', filterRepos);

  // Select all
  elements.selectAll.addEventListener('change', toggleSelectAll);

  // Back buttons
  elements.backToConnect.addEventListener('click', () => switchSection('connect'));
  elements.backToRepos.addEventListener('click', () => {
    switchSection('repos');
    elements.backToRepos.style.display = 'none';
    elements.newMigration.style.display = 'none';
  });

  // Start migration
  elements.startMigration.addEventListener('click', startMigration);

  // New migration
  elements.newMigration.addEventListener('click', () => {
    state.selectedRepos.clear();
    updateSelectedCount();
    switchSection('repos');
    renderRepos();
    elements.backToRepos.style.display = 'none';
    elements.newMigration.style.display = 'none';
  });

  // GitHub token help
  document.getElementById('github-token-help').addEventListener('click', (e) => {
    e.preventDefault();
    window.api.openExternal('https://github.com/settings/tokens/new?scopes=repo&description=Gitea%20Migrator');
  });
}

function setupProgressListener() {
  window.api.onMigrationProgress((data) => {
    updateMigrationProgress(data);
  });
}

// Section switching
function switchSection(section) {
  elements.navItems.forEach(item => {
    item.classList.toggle('active', item.dataset.section === section);
  });

  document.querySelectorAll('.section').forEach(sec => {
    sec.classList.remove('active');
  });

  document.getElementById(`section-${section}`).classList.add('active');
}

// GitHub connection
async function connectGithub() {
  const token = elements.githubToken.value.trim();
  if (!token) return;

  elements.connectGithub.disabled = true;
  elements.connectGithub.innerHTML = '<span class="spinner" style="width:16px;height:16px;border-width:2px;"></span>';

  const result = await window.api.githubValidateToken(token);

  if (result.success) {
    state.githubToken = token;
    state.githubUser = result.user;
    state.isConnected.github = true;

    elements.githubCard.classList.add('connected');
    elements.githubUser.textContent = `@${result.user.login}`;
    elements.githubStatus.innerHTML = '<span class="status-badge connected">Connected</span>';
    elements.statusGithub.classList.add('connected');
    elements.connectGithub.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg><span>Connected</span>';
    elements.connectGithub.classList.remove('btn-primary');
    elements.connectGithub.classList.add('btn-success');
    elements.githubToken.disabled = true;

    checkBothConnected();
  } else {
    elements.connectGithub.innerHTML = '<span>Connect GitHub</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>';
    alert('Invalid GitHub token. Please check and try again.');
  }

  elements.connectGithub.disabled = state.isConnected.github;
}

// Gitea connection
async function connectGitea() {
  const url = elements.giteaUrl.value.trim();
  const token = elements.giteaToken.value.trim();
  if (!url || !token) return;

  elements.connectGitea.disabled = true;
  elements.connectGitea.innerHTML = '<span class="spinner" style="width:16px;height:16px;border-width:2px;"></span>';

  const result = await window.api.giteaValidateConnection(url, token);

  if (result.success) {
    state.giteaUrl = url;
    state.giteaToken = token;
    state.giteaUser = result.user;
    state.isConnected.gitea = true;

    elements.giteaCard.classList.add('connected');
    elements.giteaUser.textContent = `@${result.user.login || result.user.username}`;
    elements.giteaStatus.innerHTML = '<span class="status-badge connected">Connected</span>';
    elements.statusGitea.classList.add('connected');
    elements.connectGitea.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg><span>Connected</span>';
    elements.connectGitea.classList.remove('btn-primary');
    elements.connectGitea.classList.add('btn-success');
    elements.giteaUrl.disabled = true;
    elements.giteaToken.disabled = true;

    checkBothConnected();
  } else {
    elements.connectGitea.innerHTML = '<span>Connect Gitea</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>';
    alert(`Gitea connection failed: ${result.error}`);
  }

  elements.connectGitea.disabled = state.isConnected.gitea;
}

function checkBothConnected() {
  if (state.isConnected.github && state.isConnected.gitea) {
    elements.proceedSection.style.display = 'flex';
    elements.navRepos.disabled = false;
  }
}

// Load repositories
async function loadRepos() {
  elements.reposList.innerHTML = `
    <div class="loading-spinner">
      <div class="spinner"></div>
      <p>Loading repositories...</p>
    </div>
  `;

  const result = await window.api.githubFetchRepos(state.githubToken);

  if (result.success) {
    state.repos = result.repos.sort((a, b) => a.name.localeCompare(b.name));
    renderRepos();
  } else {
    elements.reposList.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <h3>Failed to load repositories</h3>
        <p>${result.error}</p>
      </div>
    `;
  }
}

// Render repositories
function renderRepos(filter = '') {
  const filteredRepos = state.repos.filter(repo => 
    repo.name.toLowerCase().includes(filter.toLowerCase()) ||
    (repo.description && repo.description.toLowerCase().includes(filter.toLowerCase()))
  );

  if (filteredRepos.length === 0) {
    elements.reposList.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
        <h3>No repositories found</h3>
        <p>${filter ? 'Try a different search term' : 'You don\'t have any repositories'}</p>
      </div>
    `;
    return;
  }

  elements.reposList.innerHTML = filteredRepos.map(repo => `
    <div class="repo-item ${state.selectedRepos.has(repo.id) ? 'selected' : ''}" data-id="${repo.id}">
      <label class="checkbox-label repo-checkbox" onclick="event.stopPropagation()">
        <input type="checkbox" ${state.selectedRepos.has(repo.id) ? 'checked' : ''} onchange="toggleRepo(${repo.id})">
        <span class="checkmark"></span>
      </label>
      <div class="repo-info">
        <div class="repo-name">
          ${repo.name}
          ${repo.private ? '<span class="private-badge">Private</span>' : ''}
        </div>
        ${repo.description ? `<div class="repo-description">${escapeHtml(repo.description)}</div>` : ''}
      </div>
      <div class="repo-meta">
        ${repo.language ? `
          <span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
            </svg>
            ${repo.language}
          </span>
        ` : ''}
        <span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
          ${repo.stargazers_count}
        </span>
      </div>
    </div>
  `).join('');

  // Add click handlers
  elements.reposList.querySelectorAll('.repo-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (!e.target.closest('.repo-checkbox')) {
        const id = parseInt(item.dataset.id);
        toggleRepo(id);
      }
    });
  });

  updateSelectAllState();
}

// Toggle repo selection
window.toggleRepo = function(id) {
  if (state.selectedRepos.has(id)) {
    state.selectedRepos.delete(id);
  } else {
    state.selectedRepos.add(id);
  }
  
  const item = elements.reposList.querySelector(`[data-id="${id}"]`);
  if (item) {
    item.classList.toggle('selected', state.selectedRepos.has(id));
    const checkbox = item.querySelector('input[type="checkbox"]');
    if (checkbox) checkbox.checked = state.selectedRepos.has(id);
  }
  
  updateSelectedCount();
  updateSelectAllState();
};

// Filter repos
function filterRepos() {
  renderRepos(elements.repoSearch.value);
}

// Toggle select all
function toggleSelectAll() {
  const isChecked = elements.selectAll.checked;
  const filter = elements.repoSearch.value.toLowerCase();
  
  const filteredRepos = state.repos.filter(repo => 
    repo.name.toLowerCase().includes(filter) ||
    (repo.description && repo.description.toLowerCase().includes(filter))
  );

  filteredRepos.forEach(repo => {
    if (isChecked) {
      state.selectedRepos.add(repo.id);
    } else {
      state.selectedRepos.delete(repo.id);
    }
  });

  renderRepos(elements.repoSearch.value);
  updateSelectedCount();
}

// Update select all state
function updateSelectAllState() {
  const filter = elements.repoSearch.value.toLowerCase();
  const filteredRepos = state.repos.filter(repo => 
    repo.name.toLowerCase().includes(filter) ||
    (repo.description && repo.description.toLowerCase().includes(filter))
  );
  
  const allSelected = filteredRepos.length > 0 && filteredRepos.every(repo => state.selectedRepos.has(repo.id));
  elements.selectAll.checked = allSelected;
}

// Update selected count
function updateSelectedCount() {
  const count = state.selectedRepos.size;
  elements.selectedCount.textContent = `${count} selected`;
  elements.startMigration.disabled = count === 0;
  elements.navMigrate.disabled = count === 0;
}

// Start migration
async function startMigration() {
  const selectedRepos = state.repos.filter(repo => state.selectedRepos.has(repo.id));
  
  if (selectedRepos.length === 0) return;

  switchSection('migrate');
  elements.navMigrate.disabled = false;
  
  // Initialize progress items
  elements.migrationProgress.innerHTML = selectedRepos.map(repo => `
    <div class="progress-item" data-repo="${repo.name}">
      <div class="progress-icon pending">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>
      </div>
      <div class="progress-info">
        <div class="progress-name">${repo.name}</div>
        <div class="progress-status">Waiting...</div>
      </div>
      <div class="progress-bar-container">
        <div class="progress-bar" style="width: 0%"></div>
      </div>
    </div>
  `).join('');

  elements.migrationSubtitle.textContent = `Migrating ${selectedRepos.length} repositories to Gitea...`;

  // Start migration
  const result = await window.api.migrateRepos(
    state.githubToken,
    state.giteaUrl,
    state.giteaToken,
    selectedRepos
  );

  // Show completion
  const successful = result.results.filter(r => r.success).length;
  const failed = result.results.filter(r => !r.success).length;

  elements.migrationSubtitle.textContent = `Migration complete: ${successful} succeeded, ${failed} failed`;
  elements.backToRepos.style.display = 'flex';
  elements.newMigration.style.display = 'flex';
}

// Update migration progress
function updateMigrationProgress(data) {
  const item = elements.migrationProgress.querySelector(`[data-repo="${data.repo}"]`);
  if (!item) return;

  const icon = item.querySelector('.progress-icon');
  const status = item.querySelector('.progress-status');
  const progressBar = item.querySelector('.progress-bar');

  status.textContent = data.message;

  // Update icon and progress based on status
  switch (data.status) {
    case 'cloning':
      icon.className = 'progress-icon in-progress';
      icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
      progressBar.style.width = '25%';
      break;
    case 'creating':
    case 'exists':
      progressBar.style.width = '50%';
      break;
    case 'pushing':
      progressBar.style.width = '75%';
      break;
    case 'complete':
      icon.className = 'progress-icon complete';
      icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';
      progressBar.style.width = '100%';
      progressBar.classList.add('complete');
      break;
    case 'error':
      icon.className = 'progress-icon error';
      icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
      progressBar.style.width = '100%';
      progressBar.classList.add('error');
      break;
  }
}

// Utility: Escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

