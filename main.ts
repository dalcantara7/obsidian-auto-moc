import {
	App,
	Editor,
	MarkdownView,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
} from "obsidian";

// interface AutoMOCSettings {
// 	mySetting: string;
// }

// const DEFAULT_SETTINGS: AutoMOCSettings = {
// 	mySetting: "Uncategorized",
// };

export default class AutoMOC extends Plugin {
	// settings: AutoMOCSettings;

	async onload() {
		// await this.loadSettings();

		const ribbonIconEl = this.addRibbonIcon(
			"sheets-in-box",
			"AutoMOC",
			(evt: MouseEvent) => {
				runAutoMOC();
			}
		);

		this.addCommand({
			id: "add-missing-linked-mentions",
			name: "Add missing linked mentions at cursor position",
			checkCallback: (checking: boolean) => {
				// Conditions to check
				const markdownView =
					this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView) {
					// If checking is true, we're simply "checking" if the command can be run.
					// If checking is false, then we want to actually perform the operation.
					if (!checking) {
						runAutoMOC();
					}

					// This command will only show up in Command Palette when the check function returns true
					return true;
				}
			},
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		// this.addSettingTab(new AutoMOCSettingTab(this.app, this));

		// If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
		// Using this function will automatically remove the event listener when this plugin is disabled.
		// this.registerDomEvent(document, "click", (evt: MouseEvent) => {
		// 	console.log("click", evt);
		// });

		// When registering intervals, this function will automatically clear the interval when the plugin is disabled.
		this.registerInterval(
			window.setInterval(() => console.log("setInterval"), 5 * 60 * 1000)
		);
	}

	onunload() {}

	// async loadSettings() {
	// 	this.settings = Object.assign(
	// 		{},
	// 		DEFAULT_SETTINGS,
	// 		await this.loadData()
	// 	);
	// }

	// async saveSettings() {
	// 	await this.saveData(this.settings);
	// }
}

function getPresentLinks() {
	const file = this.app.workspace.getActiveFile();
	const path = file.path;
	const linksStruct = this.app.metadataCache.getCache(path).links;

	let links = [];
	for (const link of linksStruct) {
		links.push(link["link"]);
	}

	return links;
}

function getLinkedMentions() {
	//gets the linked mentions from the backlinks panel
	const workspaceContainer = this.app.workspace.containerEl;
	const activePane = workspaceContainer.getElementsByClassName(
		"workspace-leaf mod-active"
	)[0];
	const backlinkPane = activePane.getElementsByClassName("backlink-pane")[0];
	const linkedMentionsContainer = backlinkPane.children[1]; //0th element is "Linked Mentions", 1st is the actual linked mentions container, 2nd is "Unlinked Mentions", 3rd is the actual unlinked mentions container
	const linkedMentions = linkedMentionsContainer.children[0].children;

	let linkNamesList = [];
	for (let i = 0; i < linkedMentions.length; i++) {
		let inner = linkedMentions[i].children;
		if (inner.length > 0) {
			let linkName = inner[0].innerText
				.slice(0, -1)
				.replace(/(\r\n|\n|\r)/gm, "");
			linkNamesList.push(linkName);
		}
	}

	return linkNamesList;
}

function addMissingLinks(presentLinks, allLinkedMentions) {
	//checks for missing links and adds them
	let addFlag = false;
	for (const name of allLinkedMentions) {
		if (!presentLinks.includes(name)) {
			addFlag = true;
			let view = this.app.workspace.getActiveViewOfType(MarkdownView);
			view.editor.replaceSelection("[[" + name + "]]\n");
		}
	}

	if (!addFlag) new Notice("No new links found");
}

function runAutoMOC() {
	new Notice("Linking mentions");
	const presentLinks = getPresentLinks(); // links already in the document
	const linkedMentions = getLinkedMentions(); // all linked mentions even those not present

	addMissingLinks(presentLinks, linkedMentions);
}

// class AutoMOCSettingTab extends PluginSettingTab {
// 	plugin: AutoMOC;

// 	constructor(app: App, plugin: AutoMOC) {
// 		super(app, plugin);
// 		this.plugin = plugin;
// 	}

// 	display(): void {
// 		const { containerEl } = this;

// 		containerEl.empty();

// 		new Setting(containerEl)
// 			.setName("Link Location")
// 			.setDesc(
// 				"The keyword under which your unlinked mentions will be added"
// 			)
// 			.addText((text) =>
// 				text
// 					.setPlaceholder("Uncategorized")
// 					// .setValue(this.plugin.settings.mySetting)
// 					.onChange(async (value) => {
// 						if (!value) value = "Uncategorized"; //revert to default if no value set
// 						this.plugin.settings.mySetting = value;
// 						await this.plugin.saveSettings();
// 						console.log("Link keyword: " + value);
// 					})
// 			);
// 	}
// }
