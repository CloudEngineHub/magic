import type {
	DemoPanelConfig,
	LocaleText,
} from "@/pages/superMagic/components/MainInputContainer/panels/types"

interface PlaybookSceneConfigs {
	inspiration?: DemoPanelConfig
}

function hasPromptContent(value: LocaleText | undefined): value is LocaleText {
	if (typeof value === "string") return value.trim().length > 0
	if (!value) return false
	return Object.values(value).some((text) => typeof text === "string" && text.trim().length > 0)
}

/** Move the legacy inspiration prompt from description to prompt without changing value identity. */
export function migratePlaybookInspirationPrompt(
	config: DemoPanelConfig | undefined,
): DemoPanelConfig | undefined {
	if (!config) return undefined

	const sourceGroups = config.demo.groups ?? []
	if (sourceGroups.length === 0) return config

	let changed = false
	const groups = sourceGroups.map((group) => {
		let groupChanged = false
		const children = group.children?.map((item) => {
			if (hasPromptContent(item.prompt) || !hasPromptContent(item.description)) return item

			const { description, ...restItem } = item
			changed = true
			groupChanged = true
			return { ...restItem, prompt: description }
		})

		return groupChanged ? { ...group, children } : group
	})

	return changed ? { ...config, demo: { ...config.demo, groups } } : config
}

/** Apply prompt migration only to the persisted playbook inspiration branch. */
export function migratePlaybookSceneInspirationPrompts<T extends PlaybookSceneConfigs>(
	configs: T | undefined,
): T | undefined {
	if (!configs) return undefined

	const inspiration = migratePlaybookInspirationPrompt(configs.inspiration)
	return inspiration === configs.inspiration ? configs : { ...configs, inspiration }
}
