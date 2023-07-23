import {
	App,
	Editor,
	MarkdownView,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
	FuzzySuggestModal,
} from "obsidian";

interface AutoMOCSettings {
	showRibbonButton: boolean;
	linkToHeading: boolean;
}

const DEFAULT_SETTINGS: AutoMOCSettings = {
	showRibbonButton: true,
	linkToHeading: false,
};

export class TagSuggestModal extends FuzzySuggestModal<string> {
	selection: string;
	plugin: AutoMOC;

	constructor(app: App, plugin: AutoMOC) {
		super(app);
		this.plugin = plugin;
	}

	onOpen(): void {
		this.setPlaceholder("Import notes with tags matching...");
		this.setInstructions([
			{ command: "↑↓", purpose: "to navigate" },
			{ command: "↵", purpose: "to select tag" },
			{ command: "esc", purpose: "to dismiss" },
		]);

		this.inputEl.focus();
	}

	onClose() {
		let { contentEl } = this;
		contentEl.empty();
	}

	getItems(): string[] {
		const allFiles = this.app.metadataCache.resolvedLinks;
		let tagsSet = new Set<string>();

		Object.keys(allFiles).forEach((key) => {
			const file = this.app.vault.getAbstractFileByPath(key);
			if (file instanceof TFile) {
				const body_tags = app.metadataCache.getFileCache(file).tags;
				const frontmatter =
					this.app.metadataCache.getFileCache(file).frontmatter;

				if (body_tags) {
					for (const tag of body_tags) {
						tagsSet.add(tag["tag"]);
					}
				}

				if (frontmatter && String.isString(frontmatter["tags"])) {
					const f_tags = frontmatter["tags"].split(", ");
					for (const f_tag of f_tags) {
						tagsSet.add("#" + f_tag);
					}
				}
			}
		});

		return Array.from(tagsSet).sort();
	}

	getItemText(item: string): string {
		return item;
	}

	onChooseItem(item: string, evt: MouseEvent | KeyboardEvent): void {
		this.selection = item;
		this.plugin.runAutoMOC(item);
	}
}

export default class AutoMOC extends Plugin {
	settings: AutoMOCSettings;

	getPresentLinks(currFilePath: string) {
		const allFiles = this.app.metadataCache.resolvedLinks;
		const presentLinks = Object.keys(allFiles[currFilePath]);

		return presentLinks.sort();
	}

	getLinkedMentions(currFilePath: string) {
		const allFiles = this.app.metadataCache.resolvedLinks;
		let linkedMentions: Array<string> = [];

		Object.keys(allFiles).forEach((key) => {
			if (currFilePath in allFiles[key]) {
				linkedMentions.push(key);
			}
		});

		return linkedMentions.sort();
	}

	getTaggedMentions(tag: string) {
		const allFiles = this.app.metadataCache.resolvedLinks;
		let taggedMentions: Array<string> = [];
		const toCompare = tag.replace("#", "");

		Object.keys(allFiles).forEach((key) => {
			const file = this.app.vault.getAbstractFileByPath(key);
			if (file instanceof TFile) {
				const body_tags = app.metadataCache.getFileCache(file).tags;
				const frontmatter =
					this.app.metadataCache.getFileCache(file).frontmatter;

				if (body_tags) {
					for (const tag of body_tags) {
						if (tag["tag"] === toCompare) {
							taggedMentions.push(file.path);
						}
					}
				}

				if (frontmatter && String.isString(frontmatter["tags"])) {
					const f_tags = frontmatter["tags"].split(", ");
					for (const f_tag of f_tags) {
						if (f_tag == toCompare) {
							taggedMentions.push(file.path);
						}
					}
				}
			}
		});

		return taggedMentions;
	}

	async addMissingLinks(
		activeFileView: MarkdownView,
		presentLinks: Array<string>,
		allLinkedMentions: Array<string>,
		tag?: string
	) {
		let addFlag = false;

		//checks for missing links and adds them
		for (const path of allLinkedMentions) {
			if (!presentLinks.includes(path)) {
				const file = this.app.vault.getAbstractFileByPath(path);

				if (file instanceof TFile) {
					//check for aliases
					const fileAliases =
						this.app.metadataCache.getFileCache(file).frontmatter;
					let alias = "";

					if (
						fileAliases &&
						Array.isArray(fileAliases["aliases"]) &&
						fileAliases["aliases"].length > 0
					) {
						alias = "|" + fileAliases.aliases[0];
					}

					let closestHeading = "";

					if (this.settings.linkToHeading) {
						const headingsLocations =
							await this.getHeadingsLocationsInFile(path);
						const linkTagLocation =
							await this.getLinkTagLocationInFile(
								activeFileView,
								path,
								tag
							);
						closestHeading = this.determineClosestHeading(
							headingsLocations,
							linkTagLocation
						);
					}

					if (closestHeading) {
						//if there is a closest heading, link to heading
						activeFileView.editor.replaceSelection(
							this.app.fileManager.generateMarkdownLink(
								file,
								activeFileView.file.path,
								"#" + closestHeading,
								(alias = alias)
							) + "\n"
						);
					} else {
						//otherwise just link to note without heading
						activeFileView.editor.replaceSelection(
							this.app.fileManager.generateMarkdownLink(
								file,
								activeFileView.file.path,
								(alias = alias)
							) + "\n"
						);
					}

					addFlag = true;
				}
			}
		}

		if (!addFlag) new Notice("No new links found");
	}

	async getHeadingsLocationsInFile(filePath: string) {
		const file = this.app.vault.getAbstractFileByPath(filePath);

		if (file instanceof TFile) {
			const fileContent = await this.app.vault.read(file);
			const lines = fileContent.split("\n");
			const regXHeader = /#{1,6}\s.+(?=)/g;
			let headings: Array<string> = [];

			lines.forEach((line) => {
				const match = line.match(regXHeader);
				if (match) headings.push(match[0].replace(/#{1,6}\s/g, ""));
				else headings.push("-1");
			});

			return headings;
		}
	}

	async getLinkTagLocationInFile(
		activeFileView: MarkdownView,
		filePath: string,
		tag?: string
	) {
		const file = this.app.vault.getAbstractFileByPath(filePath);

		if (file instanceof TFile) {
			const fileContent = await this.app.vault.read(file);
			const lines = fileContent.split("\n");
			let lineContent: Array<string> = [];
			const activeFileName = activeFileView.file.name.substring(
				0,
				activeFileView.file.name.length - 3
			);

			let toSearch = "";
			if (!tag) {
				toSearch = "[[" + activeFileName + "]]"; // -3 in order to remove ".md" from filepath
			} else toSearch = tag;

			lines.forEach((line) => {
				if (line.includes(toSearch)) lineContent.push(toSearch);
				else lineContent.push("-1");
			});

			return lineContent.indexOf(toSearch);
		}
	}

	determineClosestHeading(
		headingsLocations: Array<string>,
		linkTagLocation: number
	) {
		let distances: Array<number> = [];

		headingsLocations.forEach((item, index) => {
			if (item != "-1") distances.push(Math.abs(index - linkTagLocation));
			else distances.push(-1);
		});

		let minIndex = -1;
		let minValue = Infinity;
		for (let len = distances.length, i = 0; i < len; i += 1) {
			if (distances[i] != -1) {
				if (distances[i] < minValue) {
					minIndex = i;
					minValue = distances[i];
				}
			}
		}

		return headingsLocations[minIndex];
	}

	runAutoMOC(tag?: string) {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);

		if (view != null && view.file.extension === "md") {
			new Notice("Linking mentions");
			const presentLinks = this.getPresentLinks(view.file.path); // links already in the document

			let linkTagMentions: Array<string>;
			if (!tag) {
				linkTagMentions = this.getLinkedMentions(view.file.path); // all linked mentions even those not present
			} else {
				linkTagMentions = this.getTaggedMentions(tag); // tagged mentions are looked up by basename rather than path
			}

			this.addMissingLinks(view, presentLinks, linkTagMentions, tag);
		} else {
			new Notice(
				"Failed to link mentions, file type is not a markdown file"
			);
		}
	}

	async onload() {
		await this.loadSettings();

		if (this.settings.showRibbonButton) {
			const ribbonIconEl = this.addRibbonIcon(
				"sheets-in-box",
				"AutoMOC",
				(evt: MouseEvent) => {
					this.runAutoMOC();
				}
			);
		}

		this.addCommand({
			id: "add-missing-linked-mentions",
			name: "Add missing linked mentions at the cursor position",
			editorCallback: (editor: Editor, view: MarkdownView) => {
				this.runAutoMOC();
			},
		});

		this.addCommand({
			id: "add-missing-notes-by-tag",
			name: "Add missing notes with specific tag at the current cursor location",
			editorCallback: (editor: Editor, view: MarkdownView) => {
				new TagSuggestModal(this.app, this).open();
			},
		});

		this.addSettingTab(new AutoMOCSettingTab(this.app, this));
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class AutoMOCSettingTab extends PluginSettingTab {
	plugin: AutoMOC;

	constructor(app: App, plugin: AutoMOC) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName("Show ribbon button")
			.setDesc(
				"Enable or disable the ribbon button for this plugin. You can still run the plugin with a hotkey (requires restart)"
			)
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.showRibbonButton)
					.onChange((showRibbonButton) => {
						this.plugin.settings.showRibbonButton =
							showRibbonButton;
						this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Link to heading")
			.setDesc(
				"Creates the link to the heading closest to the link/tag. This is performed in a greedy manner"
			)
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.linkToHeading)
					.onChange((linkToHeading) => {
						this.plugin.settings.linkToHeading = linkToHeading;
						this.plugin.saveSettings();
					});
			});
	}
}
