import type {
	DemoPanelConfig,
	LocaleText,
} from "@/pages/superMagic/components/MainInputContainer/panels/types"

function hasLocaleTextContent(value: LocaleText | undefined): value is LocaleText {
	if (typeof value === "string") return value.trim().length > 0
	if (!value) return false
	return Object.values(value).some((text) => typeof text === "string" && text.trim().length > 0)
}

/**
 * Older playbook editors stored the insertion prompt in description and generated a random value.
 * The current playbook editor has no display-description input, so a non-empty description at
 * this playbook-only read boundary is treated as legacy prompt data. Built-in demo configs must
 * not call this transform.
 */
export function normalizeLegacyInspirationConfig(
	config: DemoPanelConfig | undefined,
): DemoPanelConfig | undefined {
	if (!config) return undefined

	let changed = false
	const groups = config.demo.groups.map((group) => ({
		...group,
		children: group.children?.map((item) => {
			if (!hasLocaleTextContent(item.description)) return item

			changed = true
			const { description, ...restItem } = item
			return {
				...restItem,
				value: description,
			}
		}),
	}))

	if (!changed) return config
	return {
		...config,
		demo: {
			...config.demo,
			groups,
		},
	}
}
