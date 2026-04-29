import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export interface GitPaths {
	repoDir: string;
	commonGitDir: string;
	headPath: string;
}

/**
 * Find git metadata paths by walking up from cwd.
 * Handles both regular git repos (.git is a directory) and worktrees (.git is a file).
 */
export function findGitPaths(cwd: string): GitPaths | null {
	let dir = cwd;
	while (true) {
		const gitPath = join(dir, ".git");
		if (existsSync(gitPath)) {
			try {
				const stat = statSync(gitPath);
				if (stat.isFile()) {
					const content = readFileSync(gitPath, "utf8").trim();
					if (content.startsWith("gitdir: ")) {
						const gitDir = resolve(dir, content.slice(8).trim());
						const headPath = join(gitDir, "HEAD");
						if (!existsSync(headPath)) return null;
						const commonDirPath = join(gitDir, "commondir");
						const commonGitDir = existsSync(commonDirPath)
							? resolve(gitDir, readFileSync(commonDirPath, "utf8").trim())
							: gitDir;
						return { repoDir: dir, commonGitDir, headPath };
					}
				} else if (stat.isDirectory()) {
					const headPath = join(gitPath, "HEAD");
					if (!existsSync(headPath)) return null;
					return { repoDir: dir, commonGitDir: gitPath, headPath };
				}
			} catch {
				return null;
			}
		}
		const parent = dirname(dir);
		if (parent === dir) return null;
		dir = parent;
	}
}

/**
 * Read the current branch from a git working tree by inspecting .git/HEAD directly.
 * Returns the branch name, "detached" for detached HEAD, or null if not a git repo.
 */
export function readGitBranch(cwd: string): string | null {
	const gitPaths = findGitPaths(cwd);
	if (!gitPaths) return null;
	try {
		const content = readFileSync(gitPaths.headPath, "utf8").trim();
		if (content.startsWith("ref: refs/heads/")) {
			const branch = content.slice(16);
			return branch === ".invalid" ? null : branch;
		}
		return "detached";
	} catch {
		return null;
	}
}

/**
 * Check whether a directory is a git repository (has .git dir or .git file for worktrees).
 */
export function isGitRepo(dir: string): boolean {
	const gitPath = join(dir, ".git");
	if (!existsSync(gitPath)) return false;
	try {
		const stat = statSync(gitPath);
		if (stat.isDirectory()) {
			return existsSync(join(gitPath, "HEAD"));
		}
		if (stat.isFile()) {
			const content = readFileSync(gitPath, "utf8").trim();
			if (content.startsWith("gitdir: ")) {
				const gitDir = resolve(dir, content.slice(8).trim());
				return existsSync(join(gitDir, "HEAD"));
			}
		}
		return false;
	} catch {
		return false;
	}
}
