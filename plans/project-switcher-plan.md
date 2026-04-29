# Project Switcher Feature Plan

## Problem

Currently, pi is locked to the working directory where it was started. Users who have multiple git repositories under a common parent folder (e.g., `~/GitHub/`) must exit pi, `cd` into another project, and restart pi to work on a different codebase. There is no way to switch projects from within the interactive TUI.

## Goal

Add a `/project` slash command that opens a selector UI listing all version-controlled projects under a configurable root directory. Selecting a project switches pi's context to that project (cwd, git branch, sessions) without restarting. The interaction should feel identical to `/model` selection.

## Discovery Root

The root directory for project discovery should be resolved in this order:

1. `PI_PROJECTS_ROOT` environment variable
2. The parent directory of the current project if it is a git repo (e.g., `/user/GitHub/` when inside `/user/GitHub/pi-mono`)
3. `process.cwd()` as fallback

## Project Discovery

A utility function `discoverProjects(root: string): ProjectInfo[]` should:

1. Read the root directory (non-recursive into subdirectories)
2. For each subdirectory, check if it contains a `.git` folder or `.git` file (for worktrees)
3. If yes, collect: `name` (dirname), `path` (absolute), `branch` (optional, resolved lazily)
4. Also include the current project in the list (even if started outside the root)
5. Sort by name alphabetically, with the current project sorted first

```typescript
interface ProjectInfo {
  name: string;
  path: string;
  branch?: string;
}
```

## Branch Awareness

### How GitHub Desktop and VS Code work
Both GitHub Desktop and VS Code simply read the current git branch from the working tree's `.git/HEAD` file. They do not maintain a separate branch database. When a user checks out a branch in GitHub Desktop, it updates the working tree's `HEAD` file. When VS Code opens a folder, it reads that same `HEAD` file to display the branch in the status bar.

Pi should behave identically: **show the current working-tree branch for each project in the selector**, and **operate in that branch automatically after switching** (since `process.chdir()` makes git tools use the working tree's current state).

### Lazy branch resolution
For performance, branches are resolved asynchronously after the selector opens:
1. For each discovered project, read `.git/HEAD` directly (no `git` process spawn)
2. Handle regular repos (`.git/HEAD`) and worktrees (follow `gitdir:` in `.git` file)
3. Parse `ref: refs/heads/<branch>` format; show `detached` if not a branch ref
4. Refresh the selector list as branch data streams in

This logic is nearly identical to `FooterDataProvider.resolveGitBranchSync()`, which can be extracted into a shared utility.

### GitHub Desktop state enrichment (optional future enhancement)
GitHub Desktop stores repository metadata in platform-specific app data:
- Windows: `%APPDATA%\GitHub Desktop\`
- macOS: `~/Library/Application Support/GitHub Desktop/`

If accessible, pi could read GitHub Desktop's repository list to:
- Enrich project entries with PR numbers or "last viewed" timestamps
- Validate that discovered projects are tracked in GitHub Desktop
- Show a GitHub Desktop indicator (e.g., `pi-mono (main) [PR #123]`)

**Important**: The primary branch source must always be `.git/HEAD`. GitHub Desktop state is best-effort enrichment only, because its internal file format is undocumented and may change between versions.

## New Slash Command

Add to `BUILTIN_SLASH_COMMANDS` in `src/core/slash-commands.ts`:

```typescript
{ name: "project", description: "Switch to a different project (opens selector UI)" }
```

## New Component: `ProjectSelectorComponent`

Create `src/modes/interactive/components/project-selector.ts` following the pattern of `ModelSelectorComponent`.

### Features
- Search input with fuzzy filtering on project name and path
- List with arrow navigation, wrapping at top/bottom
- Max visible items: 10 with scroll indicator
- Current project marked with `✓`
- Enter to select, Escape to cancel

### Layout with branch names
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Select Project  (↑/↓ move · Enter select · Esc cancel)

  [search input]

  → pi-mono (main) [~/GitHub/pi-mono] ✓
    customer-discount-system (develop) [~/GitHub/customer-discount-system]
    quote-my-move (feature/auth) [~/GitHub/quote-my-move]
    ecom (detached) [~/GitHub/ecom]
  ...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Constructor signature
```typescript
constructor(
  tui: TUI,
  projects: ProjectInfo[],
  currentProjectPath: string,
  onSelect: (project: ProjectInfo) => void,
  onCancel: () => void,
)
```

## Handling `/project` in InteractiveMode

In `interactive-mode.ts`, add:

```typescript
if (text === "/project" || text.startsWith("/project ")) {
  const searchTerm = text.startsWith("/project ") ? text.slice(9).trim() : undefined;
  this.editor.setText("");
  await this.handleProjectCommand(searchTerm);
  return;
}
```

### `handleProjectCommand()` flow
1. Resolve discovery root via env var or parent-of-cwd logic
2. Run `discoverProjects(root)` asynchronously
   - Show a `BorderedLoader` while discovering
3. Open `ProjectSelectorComponent` via `showSelector()`
4. On `onSelect`:
   a. If selected project is the current one, just `done()` and return
   b. Call `this.switchToProject(project.path)`
5. On `onCancel`, just `done()`

## Switching Projects

A new method `switchToProject(newCwd: string)` in `InteractiveMode` must orchestrate the context switch. This is the most complex part because multiple subsystems cache `cwd`.

### Subsystem updates required
1. **Process cwd**: `process.chdir(newCwd)` so spawned tools like `git`, `ls`, `bash` operate in the new directory. Git commands will automatically use whatever branch is already checked out in that working tree (same as VS Code / GitHub Desktop).
2. **SessionManager**: The current `SessionManager` instance is bound to a `cwd` at construction. We cannot mutate its `cwd` because sessions are persisted with a header containing `cwd`. Instead, we must **create a new `SessionManager`** for the target directory and swap it into `AgentSession`.
   - `AgentSession` needs a method to swap `SessionManager` and reinitialize internal state.
   - Alternatively, `AgentSession` could expose `setCwd()` which internally closes the current session, creates a new `SessionManager`, and resets the stream/conversation state.
3. **FooterDataProvider**: Call `footerData.setCwd(newCwd)` to refresh git branch watcher and display the new project's current branch.
4. **AgentSessionRuntime**: If there's a runtime host, it may also cache cwd. Ensure it is notified.
5. **UI State**: Clear the chat container (previous session's messages). The new session will be empty or resumed from disk. Show a status message like `"Switched to pi-mono (main)"` so the user immediately sees the project and branch they landed on.
6. **Session Storage**: Each project's sessions live under `~/.pi/sessions/<hash-of-cwd>/`. Creating a new `SessionManager` with `newCwd` will naturally use the correct session directory.

### Edge cases
- **Unsaved messages**: If the current session has unsaved messages, warn the user: "Switching projects will start a new session. Unsaved messages in the current project will be lost." Add a confirmation step in the selector or as a separate overlay.
- **Same project selected**: No-op.
- **No projects found**: Show status message "No git repositories found in <root>".

## Files to Modify

| File | Change |
|------|--------|
| `src/core/slash-commands.ts` | Add `{ name: "project", description: "..." }` |
| `src/modes/interactive/components/project-selector.ts` | **New** component |
| `src/modes/interactive/interactive-mode.ts` | Add `/project` handler, `handleProjectCommand()`, `switchToProject()` |
| `src/core/footer-data-provider.ts` | Already supports `setCwd()` — verify compatibility |
| `src/core/agent-session.ts` | Add method to swap/reinit `SessionManager` for a new cwd |
| `src/config.ts` or new util file | Add `discoverProjects()` utility |

## UI/UX Details

- The footer should continue to show `cwd (branch) • sessionName`. After a project switch, this should immediately update because `FooterDataProvider.setCwd()` triggers `notifyBranchChange()`.
- The selector should pre-fill the search input if the user typed `/project <partial>`.
- Autocomplete in the editor: the `/project` command should appear in autocomplete.

## Keybindings

Use existing selector keybindings, no new keybindings needed:
- `↑/↓` — navigate
- `Enter` — select
- `Esc` — cancel
- Typing — filter

## Future Enhancements (out of scope for MVP)

- Pin projects to the top
- Show last-opened timestamp per project
- Frecency scoring for sort order
- Show project language/framework icon via heuristics
- Add/remove custom project roots via settings
- Project-scoped settings (model, thinking level, etc.)
- Deep GitHub Desktop integration: read its repository state to show PR numbers, compare branches, or launch GitHub Desktop for the selected repo

## Testing Considerations

- Mock `fs.readdirSync` and `fs.existsSync` for unit tests on `discoverProjects()`
- Test with `.git` as a file (worktrees)
- Test selecting current project (no-op)
- Test switching when streaming is active (should block or abort)
- Test switching with unsaved session state

## Open Questions

1. Should we attempt to resume the most recent session in the target project automatically, or always start a new session? (Resume recent seems more user-friendly.)
2. Should the project list be cached, or re-scanned every time `/project` is invoked? (Re-scan is fine; it's a shallow directory read, fast enough.)
3. Should non-git folders be shown as well? (No, the request specifies "projects that have version control." If needed later, a setting can relax this.)
4. Should pressing `Enter` on a project with a detached HEAD show a warning, or is displaying `(detached)` sufficient?
5. If GitHub Desktop is installed, should pi attempt to read its state file for PR/branch metadata, or is `.git/HEAD` alone enough?
