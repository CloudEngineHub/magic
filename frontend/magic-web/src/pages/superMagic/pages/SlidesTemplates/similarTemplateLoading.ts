import type { OptionItem } from "@/pages/superMagic/components/MainInputContainer/panels/types"
import { getTemplateKey } from "./canvasInteraction"

export const SIMILAR_TEMPLATE_PAGE_SIZE = 40
const MIN_SIMILAR_COLOR_TEMPLATE_COUNT = 24
const MAX_SIMILAR_COLOR_LOADS = 3
const MAX_SIMILAR_COLOR_CANDIDATE_COUNT = SIMILAR_TEMPLATE_PAGE_SIZE * (MAX_SIMILAR_COLOR_LOADS + 1)

export function reuseUnchangedTemplateOptions(previous: OptionItem[], next: OptionItem[]) {
	if (
		previous.length === next.length &&
		previous.every((template, index) => template === next[index])
	) {
		return previous
	}
	return next
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

export function shouldLoadMoreSimilarColorTemplates({
	loadCount,
	hasMore,
	isLoading,
	isLoadingMore,
	isRefreshing,
	loadedTemplateCount,
	similarTemplateCount,
}: {
	loadCount: number
	hasMore: boolean
	isLoading: boolean
	isLoadingMore: boolean
	isRefreshing: boolean
	loadedTemplateCount: number
	similarTemplateCount: number
}) {
	return (
		similarTemplateCount < MIN_SIMILAR_COLOR_TEMPLATE_COUNT &&
		hasMore &&
		!isLoading &&
		!isLoadingMore &&
		!isRefreshing &&
		loadedTemplateCount < MAX_SIMILAR_COLOR_CANDIDATE_COUNT &&
		loadCount < MAX_SIMILAR_COLOR_LOADS
	)
}
