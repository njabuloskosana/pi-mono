# Git Operations Extension Feature Plan

## Overview

Build a `/git` slash command suite that provides essential git operations directly within pi's interactive mode, eliminating dependency on external tools (GitHub Desktop, Git Bash) for basic workflows. This is especially valuable given the current Windows/Git Bash environment issues with husky hooks.

## Motivation

- Running git commands through GitHub Desktop or Git Bash is unreliable due to PATH and environment mismatches
- Husky pre-commit hooks fail because `node_modules` were installed in WSL but hooks run in MINGW
- Users need a reliable, consistent way to push/pull/commit from within pi itself
- Provides a learning platform for git operations in a controlled terminal environment

## Design Philosophy

Every `/git` command should:
1. Execute git directly via Node.js child processes (bypass shell environment issues)
2. Run in the current working directory (respecting pi's project context)
3. Show clear, actionable output (success/failure with colored status)
4. Support undo/redo where possible (e.g., stash pop)
5. Never silently fail — all operations show what happened

## Command Structure

All commands live under the `/git` namespace:

```
/git status          - Show working tree status
/git diff            - Show unstaged changes
/git log [n]         - Show recent commits (default: 10)
/git branch          - List branches, show current with '*'
/git checkout <name> - Switch to branch (creates if not exists with -b flag)
/git pull            - Pull from remote tracking branch
/git push            - Push to remote tracking branch
/git commit <msg>    - Stage all changes and commit with message
/git add <file>      - Stage specific file(s) or all if omitted
/git stash           - Stash current changes
/git stash pop       - Apply and remove most recent stash
/git stash list      - List all stashes
/git stash drop      - Discard most recent stash
/git fetch           - Fetch from remote
/git merge <branch>  - Merge branch into current
/git reset [mode]    - Reset: --soft, --mixed (default), --hard <ref>
/git remote          - List configured remotes
/git clone <url>     - Clone a repository into a new directory
```

## Phase 1: Core Commands (Highest Priority)

### 1.1 Status and Inspection

**`/git status`**
- Runs `git status --short --branch`
- Displays: branch name, ahead/behind counts, modified/staged/untracked files
- Color-coded output: green=staged, red=unstaged, yellow=untracked

**`/git diff`**
- Runs `git diff` for unstaged changes
- Optional: `/git diff --staged` for staged changes
- Shows file-by-file diff in a scrollable output panel

**`/git log [n=10]`**
- Runs `git log --oneline -n <count> --decorate`
- Shows: hash (short), branch tags, commit message
- Extended: `/git log --graph` for ASCII graph

**`/git branch`**
- Runs `git branch -a` (all branches)
- Marks current branch with `*`
- Shows: local branches, remote branches
- Extended: show last commit date per branch

### 1.2 Branching

**`/git checkout <branch-name>`**
- Runs `git checkout <branch>` if exists
- If branch doesn't exist, asks to create with `/git checkout -b <name>`
- Shows: files changed, branch switched confirmation

### 1.3 Remote Sync (Push/Pull)

**`/git pull`**
- Runs `git pull --rebase` (safer default) or `git pull` based on config
- Shows: commits fetched, merge results, conflict warnings
- On conflict: shows conflicted files, prompts resolution

**`/git push`**
- Runs `git push origin <current-branch>`
- Detects if branch is new (no upstream) and sets with `-u`
- Shows: remote URL, branch pushed, commit count
- Warns if behind remote (suggest pull first)

### 1.4 Committing

**`/git commit <message>`**
- Stages all tracked modifications automatically (like `git commit -am`)
- For new files: requires explicit `/git add` or include in command
- Shows: files committed, commit hash, message
- Optional: `/git commit --amend` to amend previous commit

**`/git add [files...]`**
- With no args: stages all changes (`git add .`)
- With file paths: stages specific files
- Shows: files staged count, names

## Phase 2: Stash Management

### 2.1 Stash Operations

**`/git stash [message]`**
- Runs `git stash push -m "<message>"`
- Without message: auto-generates timestamped message
- Shows: files stashed, stash index

**`/git stash pop`**
- Runs `git stash pop stash@{0}`
- Shows: files restored
- On conflict: shows conflict details, keeps stash intact

**`/git stash list`**
- Runs `git stash list`
- Shows: stash index, message, relative time (e.g., "2 hours ago")

**`/git stash drop [index=0]`**
- Removes specific stash or latest
- Confirmation prompt for destructive operation

## Phase 3: Extended Commands

### 3.1 History Manipulation

**`/git reset <mode> <ref>`**
- `mode`: `--soft` (keep staged), `--mixed` (default, unstage), `--hard` (discard)
- `ref`: commit hash or `HEAD~n`
- Shows: files affected, commits removed (if --hard)
- **Danger**: `--hard` requires explicit confirmation

### 3.2 Remote Operations

**`/git fetch`**
- Runs `git fetch --all`
- Shows: branches fetched, new tags

**`/git merge <branch>`**
- Runs `git merge <branch>`
- Shows: merge result, conflicted files if any

**`/git remote`**
- Shows: remote names, URLs, branches tracked
- Extended: `add`, `remove`, `set-url` subcommands

### 3.3 Repository Initialization

**`/git clone <url> [directory]`**
- Runs `git clone <url> [dir]`
- Shows: progress (if possible), final path
- Offers to switch pi to cloned directory after completion

## UI/UX Design

### Command Input
```
/git push
```

### Output Panel
- Scrollable output box (like `/project` selector results)
- Color coding: green=success, yellow=warning, red=error
- Syntax-highlighted diff output
- Copy-to-clipboard for commit hashes

### Confirmation Prompts
Destructive commands (`--hard reset`, `stash drop`, push --force) show:
```
⚠️  This will discard uncommitted changes. Confirm?
[y] Yes  [n] No  [?] Show details
```

### Progress Indicators
Long-running commands (clone, large push/pull) show animated spinner:
```
⏳ Pushing 14 commits to origin/main...
```

## Implementation Architecture

### Files to Create

```
packages/coding-agent/src/extensions/git-extension.ts       # Main command dispatcher
packages/coding-agent/src/extensions/git-commands.ts      # Individual command implementations
packages/coding-agent/src/extensions/git-parser.ts        # Output parsing/formatting
packages/coding-agent/src/extensions/git-ui.ts            # Output rendering & prompts
packages/coding-agent/src/utils/git-exec.ts              # Git child process wrapper
```

### Core Module: `git-exec.ts`

Wrapper around `child_process.execFile` that:
- Handles WSL vs Windows path resolution
- Captures stdout/stderr separately
- Returns structured result: `{ success, stdout, stderr, code }`
- Supports timeout and cancellation

```typescript
interface GitResult {
  success: boolean;
  stdout: string;
  stderr: string;
  code: number;
}

async function execGit(args: string[], cwd?: string): Promise<GitResult>;
```

### Extension Registration

Register in `slash-commands.ts` alongside existing commands:

```typescript
{
  id: "git",
  aliases: ["g"],
  description: "Git operations: /git status, /git push, /git pull, /git commit, /git stash",
  handler: handleGitCommand,
}
```

### Argument Parsing

Simple space-separated parsing:
```
/git commit "Fix the login bug"
  -> command: "commit", args: ["Fix the login bug"]
  
/git log --graph 20
  -> command: "log", args: ["--graph", "20"]
```

## Integration Points

### 1. Project Context
- All `/git` commands run in the **current project directory** (wherever `/project` switched to)
- `git-exec.ts` uses `process.cwd()` by default, respects project changes

### 2. Session Persistence
- Git operations don't affect sessions directly
- Commit messages could optionally be logged in session timeline

### 3. Footer Status Bar
- Extend `footer-data-provider.ts` to show:
  - Current branch name
  - Ahead/behind counts (e.g., `main ↑2 ↓1`)
  - Dirty indicator if uncommitted changes exist

## Error Handling Strategy

| Scenario | Behavior |
|----------|----------|
| Not in a git repo | Show: "Not a git repository. Run `/git init` or switch to a project." |
| No remote configured | Show: "No remote configured. Add with `/git remote add <name> <url>`" |
| Merge conflicts | Show conflicted files, suggest `/git stash` or manual resolution |
| Authentication fail | Show: "Authentication failed. Check your SSH keys or remote URL." |
| Network error | Retry once, then show error with suggestion to retry |

## Testing Plan

1. **Unit tests**: Mock `child_process` for each command
2. **Integration tests**: Create temp git repo, run commands against it
3. **Error cases**: Test every error scenario with mock responses
4. **UI tests**: Verify output formatting matches expectations

## Success Criteria

- [ ] All Phase 1 commands work reliably from within pi on any platform
- [ ] Phase 1 commands successfully replace GitHub Desktop for daily push/pull/commit workflows
- [ ] Stash operations (Phase 2) allow switching contexts without losing work
- [ ] Footer shows accurate git status at all times
- [ ] No crashes or hangs when network is unavailable
- [ ] Commands work correctly after `/project` switch

## Future Enhancements (Nice to Have)

- Interactive rebase (`/git rebase -i` with commit selection UI)
- Cherry-pick with visual commit picker
- Git bisect for debugging
- Blame annotation on files
- Tag management (`/git tag`)
- Submodule support
- Worktree management
- Git hooks toggle (`/git hooks disable` for husky bypass)
- Conflict resolution UI with side-by-side diff
- Commit signing (`git commit -S`)
- Pre-commit check runner that works cross-platform (delegates to WSL on Windows)

## Learning Platform Angle

This feature serves as an educational tool:
- `/git status` teaches users what each file state means
- Diffs show what changed and why
- Branch visualization helps understand git history
- Safe defaults (rebase pull, staging confirmation) prevent common mistakes
- Each command can optionally show the equivalent `git` CLI command being run

## Notes

- This extension is **independent** of the existing `/project` feature but complements it
- The pre-commit hook bypass capability is intentionally scoped to `/git push --no-verify` (respects git conventions)
- All commands are readonly until the user explicitly confirms destructive operations
- The extension should not bypass pi's normal code editing — it's a supplementary workflow tool
