import type { OptionItem } from "@/pages/superMagic/components/MainInputContainer/panels/types"
import { getTemplateCoverUrl, getTemplateKey } from "./canvasInteraction"
import {
	getTemplateColorDistance,
	getTemplateColorFamily,
	normalizeTemplateColors,
} from "./templateColors"
import { getExtractedTemplateColors } from "./templateColorExtractionStore"

export function getAvailableTemplateColors(template: OptionItem, extractionVersion?: number) {
	// extractionVersion 用于在 Worker 发布新缓存后重新派生匹配结果。
	void extractionVersion
	const backendColors = normalizeTemplateColors(template.colors)
	if (backendColors.length > 0) return backendColors
	return getExtractedTemplateColors(getTemplateCoverUrl(template))
}

export function getSimilarTemplateOptions(
	source: OptionItem,
	candidates: OptionItem[],
	extractionVersion?: number,
) {
	const sourceKey = getTemplateKey(source)
	const sourceColors = getAvailableTemplateColors(source, extractionVersion)
	const sourcePrimaryColor = sourceColors[0]
	const sourcePrimaryFamily = getTemplateColorFamily(sourcePrimaryColor)

	return candidates
		.map((template, originalIndex) => {
			if (getTemplateKey(template) === sourceKey) {
				return { distance: -1, isMatch: true, originalIndex, template }
			}

			const templateColors = getAvailableTemplateColors(template, extractionVersion)
			const templatePrimaryColor = templateColors[0]
			const templatePrimaryFamily = getTemplateColorFamily(templatePrimaryColor)
			const isPrimaryFamilyMatch = Boolean(
				sourcePrimaryFamily && sourcePrimaryFamily === templatePrimaryFamily,
			)

			return {
				distance: getTemplateColorDistance(sourcePrimaryColor, templatePrimaryColor),
				isMatch: isPrimaryFamilyMatch,
				originalIndex,
				template,
			}
		})
		.filter(({ isMatch }) => isMatch)
		.sort((left, right) => {
			if (left.distance !== right.distance) return left.distance - right.distance
			const sortDifference = (right.template.sort ?? 0) - (left.template.sort ?? 0)
			return sortDifference || left.originalIndex - right.originalIndex
		})
		.map(({ template }) => template)
}

export function preserveExistingTemplateOrder(previous: OptionItem[], next: OptionItem[]) {
	const nextTemplateByKey = new Map(next.map((template) => [getTemplateKey(template), template]))
	const retainedTemplates = previous.flatMap((template) => {
		const nextTemplate = nextTemplateByKey.get(getTemplateKey(template))
		return nextTemplate ? [nextTemplate] : []
	})
	const retainedKeys = new Set(retainedTemplates.map(getTemplateKey))
	return [
		...retainedTemplates,
		...next.filter((template) => !retainedKeys.has(getTemplateKey(template))),
	]
}

export function reuseUnchangedTemplateOptions(previous: OptionItem[], next: OptionItem[]) {
	if (
		previous.length === next.length &&
		previous.every((template, index) => template === next[index])
	) {
		return previous
	}
	return next
}
