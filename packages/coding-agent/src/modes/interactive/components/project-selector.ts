import { Container, type Focusable, fuzzyFilter, getKeybindings, Input, Spacer, Text } from "@earendil-works/pi-tui";
import type { ProjectInfo } from "../../../utils/projects.ts";
import { shortenPath } from "../../../utils/projects.ts";
import { theme } from "../theme/theme.ts";
import { DynamicBorder } from "./dynamic-border.ts";

/**
 * Component that renders a project selector with search.
 */
export class ProjectSelectorComponent extends Container implements Focusable {
	private searchInput: Input;

	private _focused = false;
	get focused(): boolean {
		return this._focused;
	}
	set focused(value: boolean) {
		this._focused = value;
		this.searchInput.focused = value;
	}

	private listContainer: Container;
	private allProjects: ProjectInfo[] = [];
	private filteredProjects: ProjectInfo[] = [];
	private selectedIndex: number = 0;
	private currentProjectPath: string;
	private onSelectCallback: (project: ProjectInfo) => void;
	private onCancelCallback: () => void;
	private errorMessage?: string;

	constructor(
		_tui: unknown,
		projects: ProjectInfo[],
		currentProjectPath: string,
		onSelect: (project: ProjectInfo) => void,
		onCancel: () => void,
		initialSearchInput?: string,
	) {
		super();

		this.allProjects = projects;
		this.filteredProjects = projects;
		this.currentProjectPath = currentProjectPath;
		this.onSelectCallback = onSelect;
		this.onCancelCallback = onCancel;

		const currentIndex = this.filteredProjects.findIndex((p) => p.path === this.currentProjectPath);
		this.selectedIndex = currentIndex >= 0 ? currentIndex : 0;

		this.addChild(new DynamicBorder());
		this.addChild(new Spacer(1));
		this.addChild(new Text(theme.bold("  Select Project"), 0, 0));
		this.addChild(new Spacer(1));

		this.searchInput = new Input();
		if (initialSearchInput) {
			this.searchInput.setValue(initialSearchInput);
		}
		this.searchInput.onSubmit = () => {
			if (this.filteredProjects[this.selectedIndex]) {
				this.handleSelect(this.filteredProjects[this.selectedIndex]);
			}
		};
		this.addChild(this.searchInput);

		this.addChild(new Spacer(1));

		this.listContainer = new Container();
		this.addChild(this.listContainer);

		this.addChild(new Spacer(1));
		this.addChild(new DynamicBorder());

		if (initialSearchInput) {
			this.filterProjects(initialSearchInput);
		} else {
			this.updateList();
		}
	}

	updateProjects(projects: ProjectInfo[]): void {
		this.allProjects = projects;
		this.filterProjects(this.searchInput.getValue());
	}

	private filterProjects(query: string): void {
		this.filteredProjects = query
			? fuzzyFilter(this.allProjects, query, (project) => `${project.name} ${shortenPath(project.path)}`)
			: this.allProjects;
		this.selectedIndex = Math.min(this.selectedIndex, Math.max(0, this.filteredProjects.length - 1));
		this.updateList();
	}

	private updateList(): void {
		this.listContainer.clear();

		const maxVisible = 10;
		const startIndex = Math.max(
			0,
			Math.min(this.selectedIndex - Math.floor(maxVisible / 2), this.filteredProjects.length - maxVisible),
		);
		const endIndex = Math.min(startIndex + maxVisible, this.filteredProjects.length);

		for (let i = startIndex; i < endIndex; i++) {
			const project = this.filteredProjects[i];
			if (!project) continue;

			const isSelected = i === this.selectedIndex;
			const isCurrent = project.path === this.currentProjectPath;
			const branch = project.branch ?? "";
			const shortPath = shortenPath(project.path);

			let line: string;
			if (isSelected) {
				const cursor = theme.fg("accent", "→ ");
				const name = theme.fg("accent", project.name);
				const branchBadge = branch ? theme.fg("warning", ` (${branch})`) : "";
				const pathBadge = theme.fg("muted", ` [${shortPath}]`);
				const checkmark = isCurrent ? theme.fg("success", " ✓") : "";
				line = `${cursor}${name}${branchBadge}${pathBadge}${checkmark}`;
			} else {
				const cursor = "  ";
				const name = project.name;
				const branchBadge = branch ? theme.fg("warning", ` (${branch})`) : "";
				const pathBadge = theme.fg("muted", ` [${shortPath}]`);
				const checkmark = isCurrent ? theme.fg("success", " ✓") : "";
				line = `${cursor}${name}${branchBadge}${pathBadge}${checkmark}`;
			}

			this.listContainer.addChild(new Text(line, 0, 0));
		}

		if (startIndex > 0 || endIndex < this.filteredProjects.length) {
			const scrollInfo = theme.fg("muted", `  (${this.selectedIndex + 1}/${this.filteredProjects.length})`);
			this.listContainer.addChild(new Text(scrollInfo, 0, 0));
		}

		if (this.errorMessage) {
			const errorLines = this.errorMessage.split("\n");
			for (const line of errorLines) {
				this.listContainer.addChild(new Text(theme.fg("error", line), 0, 0));
			}
		} else if (this.filteredProjects.length === 0) {
			this.listContainer.addChild(new Text(theme.fg("muted", "  No matching projects"), 0, 0));
		}
	}

	handleInput(keyData: string): void {
		const kb = getKeybindings();
		if (kb.matches(keyData, "tui.select.up")) {
			if (this.filteredProjects.length === 0) return;
			this.selectedIndex = this.selectedIndex === 0 ? this.filteredProjects.length - 1 : this.selectedIndex - 1;
			this.updateList();
		} else if (kb.matches(keyData, "tui.select.down")) {
			if (this.filteredProjects.length === 0) return;
			this.selectedIndex = this.selectedIndex === this.filteredProjects.length - 1 ? 0 : this.selectedIndex + 1;
			this.updateList();
		} else if (kb.matches(keyData, "tui.select.confirm")) {
			const selected = this.filteredProjects[this.selectedIndex];
			if (selected) {
				this.handleSelect(selected);
			}
		} else if (kb.matches(keyData, "tui.select.cancel")) {
			this.onCancelCallback();
		} else {
			this.searchInput.handleInput(keyData);
			this.filterProjects(this.searchInput.getValue());
		}
	}

	private handleSelect(project: ProjectInfo): void {
		this.onSelectCallback(project);
	}

	getSearchInput(): Input {
		return this.searchInput;
	}
}
