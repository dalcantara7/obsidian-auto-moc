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
}

const DEFAULT_SETTINGS: AutoMOCSettings = {
	showRibbonButton: true,
};

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
					const fileAliases =
						this.app.metadataCache.getFileCache(found).frontmatter;
					let alias = "";

					if (fileAliases) alias = "|" + fileAliases.aliases[0];

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

	runAutoMOC(tag?: string) {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);

		if (view != null && view.file.extension === "md") {
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
			name: "Add missing notes that are tagged as the current note at the cursor position",
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
	}
}
