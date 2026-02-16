---
name: clawbots
description: AI agent FTP/SFTP toolkit by @clawbots_ai - Upload, download, sync files with retry, dry-run, and connection management
---

# ClawBots

Professional FTP/SFTP client for AI agents.

## Commands

| Command | Description |
|---------|-------------|
| `clawbots add` | Add FTP/SFTP connection (interactive or flags) |
| `clawbots remove -n <name>` | Remove connection |
| `clawbots connections` | List saved connections |
| `clawbots ping -c <name>` | Test connection |
| `clawbots upload -c <name> -l <local> -r <remote>` | Upload file |
| `clawbots upload -c <name> -l <dir> -r <remote> -R` | Upload directory recursively |
| `clawbots download -c <name> -r <remote> -l <local>` | Download file |
| `clawbots sync -c <name> -l <local> -r <remote>` | Sync directory |

## Options

- `-R, --recursive` - Recursive upload/download
- `--dry-run` - Preview what would be changed
- `-n, --name` - Connection name
- `-H, --host` - Server host
- `-u, --user` - Username  
- `-P, --pass` - Password
- `-p, --port` - Custom port
- `--protocol` - ftp/sftp/ftps

## Examples

```bash
# Interactive setup
clawbots add

# Quick add
clawbots add -n prod -H ftp.example.com -u admin -P secret

# Upload with progress
clawbots upload -c prod -l ./dist -r /public_html -R

# Dry run first
clawbots sync -c prod -l ./site -r /public_html --dry-run

# Test connection
clawbots ping -c prod
npm i -g clawbots
• basic-ftp, ssh2-sftp-client, commander, chalk, cli-progress, ignore, p-limit, p-retry, inquirer
