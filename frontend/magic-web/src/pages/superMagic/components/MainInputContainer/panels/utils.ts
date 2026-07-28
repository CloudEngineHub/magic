import i18n from "i18next"
import type { JSONContent } from "@tiptap/core"
import {
	CURRENT_DEMO_PANEL_SCHEMA_VERSION,
	DEFAULT_LOCALE_KEY,
	OptionViewType,
	type DemoPanelConfig,
	type FieldItem,
	type LocaleText,
	type OptionGroup,
	type OptionItem,
	type OptionItemKeyResolver,
} from "./types"
import {
	isPromptRichTextEmpty,
	maybeResolvePromptRichTextPlainText,
	parsePromptRichText,
	PROMPT_PRESET_VALUE_NODE_NAME,
	PROMPT_PRESET_VALUE_TOKEN,
} from "./promptRichText"

function isNonEmptyLocaleValue(value: string | undefined): value is string {
	return typeof value === "string" && value.length > 0
}

function resolveLocaleTextValue(text: LocaleText | undefined, locale: string): string | undefined {
	if (text == null) return undefined
	if (typeof text === "string") return text

	// exact match: "zh_CN"
	if (isNonEmptyLocaleValue(text[locale])) return text[locale]

	// base language match: "zh_CN" -> "zh"
	const baseLang = locale.split(/[-_]/)[0]
	const baseMatch = Object.keys(text).find(
		(key) => key.startsWith(baseLang) && isNonEmptyLocaleValue(text[key]),
	)
	if (baseMatch) return text[baseMatch]

	// fallback to default, then "en_US", then first available
	if (isNonEmptyLocaleValue(text[DEFAULT_LOCALE_KEY])) return text[DEFAULT_LOCALE_KEY]
	if (isNonEmptyLocaleValue(text["en_US"])) return text["en_US"]
	return Object.values(text).find((value) => isNonEmptyLocaleValue(value))
}

/**
 * Resolve LocaleText to a plain string for the current locale.
 * Falls back in order: exact locale -> base language -> default -> "en_US" -> first available
 */
export function resolveLocaleText(
	text: LocaleText | undefined,
	locale: string,
): string | undefined {
	return maybeResolvePromptRichTextPlainText(resolveLocaleTextValue(text, locale))
}

/**
 * Check if option is OptionGroup
 */
export function isOptionGroup(option: OptionGroup | OptionItem): option is OptionGroup {
	return "group_key" in option && "children" in option
}

/**
 * Check if FieldItem is a complex field (has option_view_type)
 */
export function isComplexField(field: FieldItem): boolean {
	return field.option_view_type === OptionViewType.GRID
}

/**
 * Find the complex field in field_items array
 */
export function findComplexField(fields: FieldItem[]): FieldItem | undefined {
	return fields.find(isComplexField)
}

/**
 * Resolve LocaleText to display string. Handles string or locale map.
 */
export function localeTextToDisplayString(value: LocaleText | undefined): string {
	if (value == null) return ""
	if (typeof value === "string") return value
	return (
		value[DEFAULT_LOCALE_KEY] ??
		value["en_US"] ??
		Object.values(value).find((v) => typeof v === "string" && v.length > 0) ??
		""
	)
}

/** Resolve a localized option value to its configured fallback string. */
export function getOptionValue(option: Pick<OptionItem, "value">): string {
	return localeTextToDisplayString(option.value)
}

function matchesOptionValue(option: OptionItem, value: string): boolean {
	if (getOptionValue(option) === value) return true
	if (typeof option.value === "string") return false

	return Object.values(option.value).some((localizedValue) => localizedValue?.trim() === value)
}

/** Resolve the configured default without letting a prompt value override a persistent v2 key. */
export function findDefaultDemoOption(
	config: DemoPanelConfig,
	options: OptionItem[],
): OptionItem | undefined {
	const itemKey = config.demo.default_selected_template_key
	if (!itemKey) return undefined

	const item = options.find((option) => option.item_key === itemKey)
	if (item || config.schema_version === CURRENT_DEMO_PANEL_SCHEMA_VERSION) return item
	return options.find((option) => matchesOptionValue(option, itemKey))
}

export function resolveOptionItemKey(
	option: OptionItem,
	index: number,
	resolver?: OptionItemKeyResolver,
): string {
	return resolver?.(option, index) ?? option.item_key ?? getOptionValue(option)
}

/** Resolve a localized or rich-text demo value into the string inserted into the editor. */
export function resolveDemoPromptText(option: Pick<OptionItem, "value">, locale: string): string {
	return resolveLocaleText(option.value, locale)?.trim() ?? ""
}

export function isImageIconSource(value: string | undefined): value is string {
	if (!value) return false

	return (
		value.startsWith("http://") ||
		value.startsWith("https://") ||
		value.startsWith("//") ||
		value.startsWith("/") ||
		value.startsWith("data:image/") ||
		value.startsWith("blob:")
	)
}

function getPresetDisplayValue(field: FieldItem, locale: string): string {
	const currentValue = field.current_value
	if (currentValue == null || currentValue === "") return ""

	const selectedOption = flattenFieldOptions(field).find(
		(option) => getOptionValue(option) === currentValue,
	)
	const presetValue = resolveLocaleText(selectedOption?.preset_value, locale)?.trim()

	return presetValue || currentValue
}

/** Flatten OptionGroup children and flat OptionItems into a single OptionItem array */
export function flattenFieldOptions(field: FieldItem): OptionItem[] {
	const groups = field.options.filter(isOptionGroup) as OptionGroup[]
	return groups.length
		? groups.flatMap((g) => g.children ?? [])
		: (field.options.filter((o) => !isOptionGroup(o)) as OptionItem[])
}

export function hasSelectableOptions(field: FieldItem | undefined): boolean {
	return Boolean(field && flattenFieldOptions(field).length > 0)
}

function getSelectedOptionLabel(field: FieldItem, locale: string): string {
	const currentVal = field.current_value
	if (currentVal == null || currentVal === "") return ""

	const flat = flattenFieldOptions(field)
	const selected = flat.find((opt) => getOptionValue(opt) === currentVal)
	if (!selected && !field.custom_input) return ""

	const label = resolveLocaleText(field.label, locale)?.trim()
	const value = selected
		? (resolveLocaleText(selected.value, locale)?.trim() ?? "")
		: currentVal.trim()

	if (!label) return value
	if (!value) return label

	return `${label}: ${value}`
}

function createTextNode(text: string): JSONContent | undefined {
	return text ? { type: "text", text } : undefined
}

function buildPlainTextDoc(text: string): JSONContent {
	return {
		type: "doc",
		content: [{ type: "paragraph", content: [{ type: "text", text }] }],
	}
}

function replacePresetValueInText(text: string, presetValue: string): JSONContent[] {
	const parts = text.split(PROMPT_PRESET_VALUE_TOKEN)
	if (parts.length === 1) return [{ type: "text", text }]

	return parts.flatMap((part, index) => {
		const nodes: JSONContent[] = []
		const partNode = createTextNode(part)
		if (partNode) nodes.push(partNode)
		if (index < parts.length - 1) {
			const presetNode = createTextNode(presetValue)
			if (presetNode) nodes.push(presetNode)
		}
		return nodes
	})
}

function replacePresetValueInNode(node: JSONContent, presetValue: string): JSONContent[] {
	if (node.type === "text") {
		return replacePresetValueInText(node.text ?? "", presetValue)
	}

	if (node.type === PROMPT_PRESET_VALUE_NODE_NAME) {
		const presetNode = createTextNode(presetValue)
		return presetNode ? [presetNode] : []
	}

	const nextNode: JSONContent = { ...node }
	if (Array.isArray(node.content)) {
		nextNode.content = node.content.flatMap((child) =>
			replacePresetValueInNode(child, presetValue),
		)
	}
	return [nextNode]
}

function replacePresetValueInDoc(doc: JSONContent, presetValue: string): JSONContent {
	return {
		...doc,
		content: (doc.content ?? []).flatMap((node) => replacePresetValueInNode(node, presetValue)),
	}
}

function appendTextToLastBlock(doc: JSONContent, text: string): JSONContent {
	if (!text) return doc

	const content = [...(doc.content ?? [])]
	const textNode = createTextNode(text)
	if (!textNode) return { ...doc, content }

	const lastBlock = content.at(-1)
	if (!lastBlock) {
		return {
			...doc,
			content: [{ type: "paragraph", content: [textNode] }],
		}
	}

	content[content.length - 1] = {
		...lastBlock,
		content: [...(lastBlock.content ?? []), textNode],
	}

	return { ...doc, content }
}

function joinPresetContentDocs(parts: JSONContent[], comma: string, period: string): JSONContent {
	const canJoinAsInlineContent = parts.every(
		(part) => part.content?.length === 1 && part.content[0]?.type === "paragraph",
	)

	if (canJoinAsInlineContent) {
		const content = parts.flatMap((part, index) => {
			const suffix = index === parts.length - 1 ? period : comma
			return [...(part.content?.[0]?.content ?? []), { type: "text", text: suffix }]
		})

		return { type: "doc", content: [{ type: "paragraph", content }] }
	}

	const content = parts.flatMap((part, index) => {
		const suffix = index === parts.length - 1 ? period : comma
		return appendTextToLastBlock(part, suffix).content ?? []
	})

	return { type: "doc", content }
}

/**
 * Build concatenated preset content from field items.
 * - Per field with preset_content: replaces {preset_value} with the selected option's
 *   preset_value, falling back to current_value.
 * - Per field without preset_content: uses selected option label.
 * - All picked field parts are joined with locale comma and closed with locale period.
 */
export function buildConcatenatedPresetContent(
	fields: FieldItem[],
	locale = i18n.resolvedLanguage ?? i18n.language ?? DEFAULT_LOCALE_KEY,
): JSONContent | undefined {
	const isZh = /^zh(-|_)?/i.test(locale)
	const comma = isZh ? "，" : ", "
	const period = isZh ? "。" : "."
	const parts: JSONContent[] = []

	for (const item of fields) {
		const template = resolveLocaleTextValue(item.preset_content, locale) ?? ""
		if (!isPromptRichTextEmpty(template)) {
			const currentVal = item.current_value
			if (currentVal == null || currentVal === "") continue

			const displayVal = getPresetDisplayValue(item, locale)
			if (!displayVal.trim()) continue

			parts.push(replacePresetValueInDoc(parsePromptRichText(template), displayVal))
			continue
		}

		const label = getSelectedOptionLabel(item, locale).trim()
		if (label) {
			parts.push(buildPlainTextDoc(label))
		}
	}

	if (parts.length === 0) return undefined
	return joinPresetContentDocs(parts, comma, period)
}
