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

export class HeadingSuggestModel extends FuzzySuggestModal<string> {
	selection: string;
	plugin: AutoMOC;

	constructor(app: App, plugin: AutoMOC) {
		super(app);
		this.plugin = plugin;

		this.modalEl.prepend(
			this.modalEl.createEl("h2", {
				text: "Choose heading to append to link",
			})
		);
	}

	onOpen(): void {
		let { contentEl } = this;

		this.setPlaceholder(
			"Type the heading level desired (i.e. h1, h2, h3, etc.)..."
		);
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
		return this.selection;
	}

	getItems(): string[] {
		const testString = `\n# Clean-er ReactJS Code - Conditional Rendering\n\n## TL;DR\n\nMove render conditions into appropriately named variables. Abstract the condition logic into a function. This makes the render function code a lot easier to understand, refactor, reuse, test, and think about.\n\n## Introduction\n\nConditional rendering is when a logical operator determines what will be rendered. The following code is from the examples in the official ReactJS documentation. It is one of the simplest examples of conditional rendering that I can think of.\n\n`;

		const regXHeader = /#{1,6}(?= )/g;

		console.log(testString.match(regXHeader));

		const options = ["h1", "h2", "h3", "h4", "h5", "h6"];

		return options;
	}

	getItemText(item: string): string {
		return item;
	}

	onChooseItem(item: string, evt: MouseEvent | KeyboardEvent): void {
		this.selection = item;
		this.plugin.runAutoMOC(item, undefined);
	}
}

export class TagSuggestModal extends FuzzySuggestModal<string> {
	selection: string;
	plugin: AutoMOC;

	constructor(app: App, plugin: AutoMOC) {
		super(app);
		this.plugin = plugin;

		this.modalEl.prepend(
			this.modalEl.createEl("h2", {
				text: "Import notes with tags matching",
			})
		);
	}

	onOpen(): void {
		this.setPlaceholder("Type the name of a tag...");
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
			let file = this.app.vault.getAbstractFileByPath(key);
			if (file instanceof TFile) {
				const tags = app.metadataCache.getFileCache(file).tags;
				if (tags) {
					for (const tag of tags) {
						tagsSet.add(tag["tag"]);
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
		this.plugin.runAutoMOC(undefined, item);
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

	getTaggedMentions(currFileName: string) {
		const allFiles = this.app.metadataCache.resolvedLinks;
		let taggedMentions: Array<string> = [];
		const toCompare = currFileName;

		Object.keys(allFiles).forEach((key) => {
			let file = this.app.vault.getAbstractFileByPath(key);
			if (file instanceof TFile) {
				const tags = app.metadataCache.getFileCache(file).tags;
				if (tags) {
					for (const tag of tags) {
						if (tag["tag"] === toCompare) {
							taggedMentions.push(file.path);
						}
					}
				}
			}
		});

		return taggedMentions;
	}

	addMissingLinks(
		activeFileView: MarkdownView,
		presentLinks: Array<string>,
		allLinkedMentions: Array<string>
	) {
		let addFlag = false;

		//checks for missing links and adds them
		for (const path of allLinkedMentions) {
			if (!presentLinks.includes(path)) {
				let found = this.app.vault.getAbstractFileByPath(path);

				if (found instanceof TFile) {
					//check for aliases
					const fileAliases =
						this.app.metadataCache.getFileCache(found).frontmatter;
					let alias = "";

					if (
						fileAliases &&
						Array.isArray(fileAliases["aliases"]) &&
						fileAliases["aliases"].length > 0
					) {
						alias = "|" + fileAliases.aliases[0];
					}

					activeFileView.editor.replaceSelection(
						this.app.fileManager.generateMarkdownLink(
							found,
							activeFileView.file.path,
							(alias = alias)
						) + "\n"
					);
					addFlag = true;
				}
			}
		}

		if (!addFlag) new Notice("No new links found");
	}

	runAutoMOC(heading?: string, tag?: string) {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);

		if (view != null && view.file.extension === "md") {
			console.log(heading);

			new Notice("Linking mentions");
			const presentLinks = this.getPresentLinks(view.file.path); // links already in the document

			let linkedMentions: Array<string>;
			if (!tag) {
				linkedMentions = this.getLinkedMentions(view.file.path); // all linked mentions even those not present
			} else {
				linkedMentions = this.getTaggedMentions(tag); // tagged mentions are looked up by basename rather than path
			}

			this.addMissingLinks(view, presentLinks, linkedMentions);
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
					if (this.settings.linkToHeading)
						new HeadingSuggestModel(this.app, this).open();
					else this.runAutoMOC();
				}
			);
		}

		this.addCommand({
			id: "add-missing-linked-mentions",
			name: "Add missing linked mentions at the cursor position",
			editorCallback: (editor: Editor, view: MarkdownView) => {
				if (this.settings.linkToHeading)
					new HeadingSuggestModel(this.app, this).open();
				else this.runAutoMOC();
			},
		});

		this.addCommand({
			id: "add-missing-notes-by-tag",
			name: "Add missing notes with specific tag at the current cursor location",
			editorCallback: (editor: Editor, view: MarkdownView) => {
				if (this.settings.linkToHeading)
					new HeadingSuggestModel(
						this.app,
						this
					).open(); //FIXME: this doesn't work at secondary level
				else new TagSuggestModal(this.app, this).open();
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
			.setDesc("Allows you to specify which heading to link to")
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
