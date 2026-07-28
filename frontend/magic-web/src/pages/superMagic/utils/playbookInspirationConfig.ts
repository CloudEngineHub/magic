import { nanoid } from "nanoid"
import type {
	DemoPanelConfig,
	LocaleText,
} from "@/pages/superMagic/components/MainInputContainer/panels/types"
import { CURRENT_DEMO_PANEL_SCHEMA_VERSION } from "@/pages/superMagic/components/MainInputContainer/panels/types"

export const CURRENT_PLAYBOOK_INSPIRATION_SCHEMA_VERSION = CURRENT_DEMO_PANEL_SCHEMA_VERSION

interface NormalizePlaybookInspirationOptions {
	createItemKey?: () => string
}

interface PlaybookSceneConfigs {
	inspiration?: DemoPanelConfig
}

export function createInspirationItemKey(): string {
	return `inspiration_${nanoid()}`
}

function localeTextContains(value: LocaleText, expected: string): boolean {
	if (typeof value === "string") return value === expected
	return Object.values(value).some((text) => text === expected)
}

function hasLocaleTextContent(value: LocaleText | undefined): value is LocaleText {
	if (typeof value === "string") return value.trim().length > 0
	if (!value) return false
	return Object.values(value).some((text) => typeof text === "string" && text.trim().length > 0)
}

function createUniqueItemKey(
	preferredKey: string | undefined,
	usedKeys: Set<string>,
	createItemKey: () => string,
): string {
	const normalizedPreferredKey = preferredKey?.trim()
	if (normalizedPreferredKey && !usedKeys.has(normalizedPreferredKey)) {
		usedKeys.add(normalizedPreferredKey)
		return normalizedPreferredKey
	}

	for (let attempt = 0; attempt < 100; attempt += 1) {
		const generatedKey = createItemKey().trim()
		if (generatedKey && !usedKeys.has(generatedKey)) {
			usedKeys.add(generatedKey)
			return generatedKey
		}
	}

	throw new Error("Unable to create a unique inspiration item key")
}

/**
 * Upgrade persisted playbook inspiration data to the current schema.
 *
 * Before schema v2, the playbook editor stored item identity in `value` and the prompt in
 * `description`. The rollout contract treats an absent version as that legacy schema; all new
 * playbook configs are created as v2, so migration never relies on string shape or item position.
 */
export function normalizePlaybookInspirationConfig(
	config: DemoPanelConfig | undefined,
	options: NormalizePlaybookInspirationOptions = {},
): DemoPanelConfig | undefined {
	if (!config) return undefined

	const createItemKey = options.createItemKey ?? createInspirationItemKey
	const isLegacyConfig = config.schema_version === undefined
	const defaultTemplateKey = config.demo.default_selected_template_key
	const usedKeys = new Set<string>()
	let normalizedDefaultTemplateKey: string | undefined
	let changed = isLegacyConfig

	const groups = config.demo.groups.map((group) => {
		let groupChanged = false
		const children = group.children?.map((item) => {
			const existingItemKey = item.item_key?.trim()
			const legacyItemKey =
				isLegacyConfig && typeof item.value === "string" ? item.value.trim() : undefined
			const itemKey = createUniqueItemKey(
				existingItemKey || legacyItemKey,
				usedKeys,
				createItemKey,
			)

			if (!normalizedDefaultTemplateKey && defaultTemplateKey) {
				const matchesCurrentKey = existingItemKey === defaultTemplateKey
				const matchesLegacyValue =
					isLegacyConfig && localeTextContains(item.value, defaultTemplateKey)

				if (matchesCurrentKey || matchesLegacyValue) {
					normalizedDefaultTemplateKey = itemKey
				}
			}

			if (isLegacyConfig && hasLocaleTextContent(item.description)) {
				const { description, ...restItem } = item
				groupChanged = true
				return {
					...restItem,
					item_key: itemKey,
					value: description,
				}
			}

			if (item.item_key === itemKey) return item

			changed = true
			groupChanged = true
			return { ...item, item_key: itemKey }
		})

		return groupChanged ? { ...group, children } : group
	})

	const nextDefaultTemplateKey = normalizedDefaultTemplateKey ?? defaultTemplateKey
	if (nextDefaultTemplateKey !== defaultTemplateKey) changed = true
	if (!changed) return config

	return {
		...config,
		schema_version: CURRENT_PLAYBOOK_INSPIRATION_SCHEMA_VERSION,
		demo: {
			...config.demo,
			default_selected_template_key: nextDefaultTemplateKey,
			groups,
		},
	}
}

/** Keep playbook scene-config assembly at one seam for list, detail, cache, and save adapters. */
export function normalizePlaybookSceneConfigs<T extends PlaybookSceneConfigs>(
	configs: T | undefined,
	options: NormalizePlaybookInspirationOptions = {},
): T | undefined {
	if (!configs) return undefined

	const inspiration = normalizePlaybookInspirationConfig(configs.inspiration, options)
	return inspiration === configs.inspiration ? configs : { ...configs, inspiration }
}
