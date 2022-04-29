import {
	App,
	Editor,
	MarkdownView,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
} from "obsidian";

interface AutoMOCSettings {
	showRibbonButton: boolean;
}

const DEFAULT_SETTINGS: AutoMOCSettings = {
	showRibbonButton: true,
};

export default class AutoMOC extends Plugin {
	settings: AutoMOCSettings;

	getPresentLinks(currFilePath: string) {
		const allLinks = this.app.metadataCache.resolvedLinks;
		const presentLinks = Object.keys(allLinks[currFilePath]);

		return presentLinks;
	}

	getLinkedMentions(currFilePath: string) {
		const allLinks = this.app.metadataCache.resolvedLinks;
		let linkedMentions: Array<string> = [];
		Object.keys(allLinks).forEach((key) => {
			if (currFilePath in allLinks[key]) {
				linkedMentions.push(key);
			}
		});

		return linkedMentions;
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
					activeFileView.editor.replaceSelection(
						this.app.fileManager.generateMarkdownLink(
							found,
							activeFileView.file.path
						) + "\n"
					);
					addFlag = true;
				}
			}
		}

		if (!addFlag) new Notice("No new links found");
	}

	runAutoMOC() {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);

		if (view != null && view.file.extension === "md") {
			new Notice("Linking mentions");
			const presentLinks = this.getPresentLinks(view.file.path); // links already in the document
			const linkedMentions = this.getLinkedMentions(view.file.path); // all linked mentions even those not present

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
			name: "Add missing linked mentions at cursor position",
			editorCallback: (editor: Editor, view: MarkdownView) => {
				this.runAutoMOC();
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
