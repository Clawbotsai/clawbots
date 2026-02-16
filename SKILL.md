---
name: clawbots
description: AI agent FTP/SFTP toolkit - Upload, download, sync files with retry, dry-run, and connection management
---

# ClawBots v2.0.0

Professional FTP/SFTP client for AI agents.

## Install
npm i -g clawbots

## Commands
- `clawbots add` - Add connection (interactive)
- `clawbots connections` - List connections
- `clawbots ping -c <name>` - Test connection
- `clawbots upload -c <name> -l <local> -r <remote> [-R]` - Upload
- `clawbots download -c <name> -r <remote> -l <local> [-R]` - Download
- `clawbots sync -c <name> -l <local> -r <remote>` - Sync directory

## Options
- `-R, --recursive` - Recursive
- `--dry-run` - Preview changes
