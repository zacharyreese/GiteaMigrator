# Gitea Migrator

A beautiful Electron app to migrate your GitHub repositories to a Gitea instance.

![Gitea Migrator](https://img.shields.io/badge/Electron-28.0.0-blue) ![License](https://img.shields.io/badge/License-MIT-green)

## Features

- **Secure Authentication** - Connect with GitHub and Gitea using personal access tokens
- **Repository Listing** - View all your GitHub repositories with search and filtering
- **Bulk Selection** - Select individual repos or all at once
- **Mirror Migration** - Full mirror clone including all branches, tags, and history
- **Real-time Progress** - Watch the migration progress in real-time

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) or [Node.js](https://nodejs.org/) (v18+)
- Git installed on your system

### Installation

```bash
# Install dependencies
bun install

# Start the app
bun start
```

### Creating Access Tokens

#### GitHub Personal Access Token

1. Go to [GitHub Settings > Developer Settings > Personal Access Tokens](https://github.com/settings/tokens/new)
2. Select **"Generate new token (classic)"**
3. Give it a descriptive name (e.g., "Gitea Migrator")
4. Select the `repo` scope (full control of private repositories)
5. Click **Generate token**
6. Copy the token (starts with `ghp_`)

#### Gitea Access Token

1. Go to your Gitea instance
2. Navigate to **Settings → Applications → Access Tokens**
3. Enter a token name (e.g., "Gitea Migrator")
4. Select the following scopes:
   - `read:user` - Required to verify connection
   - `write:repository` - Required to create repositories
5. Click **Generate Token**
6. Copy the token

## Usage

1. **Connect GitHub** - Enter your GitHub personal access token
2. **Connect Gitea** - Enter your Gitea instance URL and access token
3. **Select Repositories** - Browse and select the repos you want to migrate
4. **Migrate** - Click "Migrate Selected" and watch the progress

## How It Works

The migrator performs a **full clone** of each repository:

1. Clones the repository from GitHub with `--mirror` flag (includes all branches and tags)
2. Creates a new repository on your Gitea instance with matching settings
3. Pushes all branches (`--all`) and tags (`--tags`) to Gitea
4. Cleans up temporary files

**Note:** Your GitHub repositories are NOT deleted or modified. This is a copy operation only. GitHub-specific pull request refs are excluded as Gitea doesn't support them.

## Security

- Tokens are never stored persistently - they only exist in memory during the session
- All communication uses HTTPS
- Context isolation for security

## Development

```bash
# Run in development mode
bun run dev
```

## License

MIT License - feel free to use and modify as needed.

