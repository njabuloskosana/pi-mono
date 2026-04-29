import { readdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { isGitRepo, readGitBranch } from "./git-repo.js";

export interface ProjectInfo {
	name: string;
	path: string;
	branch?: string;
}

/**
 * Resolve the root directory for project discovery.
 *
 * Order of resolution:
 * 1. PI_PROJECTS_ROOT environment variable
 * 2. Parent directory of the current git repo
 * 3. process.cwd() fallback
 */
export function resolveProjectsRoot(cwd: string): string {
	const envRoot = process.env.PI_PROJECTS_ROOT;
	if (envRoot) {
		if (envRoot === "~") return homedir();
		if (envRoot.startsWith("~/")) return homedir() + envRoot.slice(1);
		return resolve(envRoot);
	}

	// Walk up from cwd to find a git repo, then use its parent
	let dir = cwd;
	while (true) {
		if (isGitRepo(dir)) {
			const parent = dirname(dir);
			if (parent !== dir) {
				return parent;
			}
			break;
		}
		const parent = dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}

	return cwd;
}

/**
 * Discover git repositories under a root directory.
 * Performs a single-level scan of immediate subdirectories.
 */
export function discoverProjects(root: string): ProjectInfo[] {
	const projects: ProjectInfo[] = [];
	try {
		const entries = readdirSync(root, { withFileTypes: true });
		for (const entry of entries) {
			if (!entry.isDirectory()) continue;
			const projectPath = join(root, entry.name);
			if (isGitRepo(projectPath)) {
				projects.push({
					name: entry.name,
					path: resolve(projectPath),
				});
			}
		}
	} catch {
		// Return empty list on any error (no access, not a directory, etc.)
	}
	return projects;
}

/**
 * Sort projects alphabetically by name, with the current project first.
 */
export function sortProjects(projects: ProjectInfo[], currentPath: string): ProjectInfo[] {
	const resolvedCurrent = resolve(currentPath);
	const sorted = [...projects];
	sorted.sort((a, b) => {
		const aIsCurrent = a.path === resolvedCurrent;
		const bIsCurrent = b.path === resolvedCurrent;
		if (aIsCurrent && !bIsCurrent) return -1;
		if (!aIsCurrent && bIsCurrent) return 1;
		return a.name.localeCompare(b.name);
	});
	return sorted;
}

/**
 * Resolve branches for all projects asynchronously.
 * Mutates the ProjectInfo objects in place.
 */
export async function resolveProjectBranches(projects: ProjectInfo[]): Promise<void> {
	await Promise.all(
		projects.map(async (project) => {
			project.branch = readGitBranch(project.path) ?? undefined;
		}),
	);
}

/**
 * Format a project path for display, replacing home directory with ~.
 */
export function shortenPath(projectPath: string): string {
	const home = homedir();
	if (projectPath.startsWith(home)) {
		return `~${projectPath.slice(home.length)}`;
	}
	return projectPath;
}
