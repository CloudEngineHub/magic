import { ElementTypeEnum } from "../../document/types"
import { getContentState } from "../../document/elementContent"
import type {
	ContentSnapshot,
	ElementToolContext,
	ElementToolResolution,
	ElementToolSurface,
} from "../model/ElementToolTypes"
import {
	COMMON_ELEMENT_TOOL_DEFINITIONS,
	GENERATION_TOOL_DEFINITIONS,
	SHAPE_TOOL_DEFINITIONS,
	TEXT_TOOL_DEFINITIONS,
	VERSION_TOOL_DEFINITIONS,
} from "../catalog"

export const ELEMENT_TOOL_DEFINITIONS = [
	...COMMON_ELEMENT_TOOL_DEFINITIONS,
	...GENERATION_TOOL_DEFINITIONS,
	...TEXT_TOOL_DEFINITIONS,
	...SHAPE_TOOL_DEFINITIONS,
	...VERSION_TOOL_DEFINITIONS,
] as const

export function resolveElementTools(
	context: ElementToolContext,
	surface: ElementToolSurface,
): ElementToolResolution[] {
	const activeSession = context.selection.activeToolSession
	const hasExclusiveToolSession =
		activeSession?.elementId === context.element.id &&
		activeSession.contentId === context.content.activeContentId
	if (surface === "top" && hasExclusiveToolSession && activeSession) {
		const definition = ELEMENT_TOOL_DEFINITIONS.find(
			(candidate) => candidate.id === activeSession.toolId,
		)
		if (definition?.surfaces.top && definition.isApplicable(context)) {
			const resolution = definition.resolve(context)
			if (
				resolution.target.contentId === activeSession.contentId &&
				resolution.visibility !== "hidden"
			) {
				return [
					{
						...resolution,
						execution: definition.execution,
						execute:
							definition.execution === "display-only"
								? undefined
								: resolution.execute,
						target: {
							...resolution.target,
							operationId: activeSession.operationId,
						},
					},
				]
			}
		}
		return []
	}
	if (surface === "bottom" && (context.interaction.isEditing || hasExclusiveToolSession)) {
		if (hasExclusiveToolSession) return []
		if (
			context.element.type !== ElementTypeEnum.Image &&
			context.element.type !== ElementTypeEnum.Video
		) {
			return []
		}
	}
	if (
		context.selection.elements.some((element) => element.locked) ||
		context.interaction.isReplacing ||
		context.interaction.isCropping ||
		context.interaction.isExtending ||
		context.interaction.isErasing ||
		context.interaction.isFullscreenPreviewOpen ||
		context.selection.isSelecting ||
		(context.selection.isDragging &&
			(!context.selection.isSingleElement || context.element.type !== ElementTypeEnum.Text))
	) {
		return []
	}
	const seen = new Set<string>()
	const isMediaEditor =
		surface === "bottom" &&
		context.interaction.isEditing &&
		(context.element.type === ElementTypeEnum.Image ||
			context.element.type === ElementTypeEnum.Video)
	return ELEMENT_TOOL_DEFINITIONS.filter((definition) => Boolean(definition.surfaces[surface]))
		.filter((definition) => !isMediaEditor || definition.scope === "version-set")
		.filter((definition) => definition.isApplicable(context))
		.map((definition) => {
			const resolved = definition.resolve(context)
			const resolution = {
				...resolved,
				execution: definition.execution,
				execute: definition.execution === "display-only" ? undefined : resolved.execute,
			}
			if (
				activeSession &&
				activeSession.elementId === context.element.id &&
				activeSession.toolId === definition.id &&
				activeSession.contentId === resolution.target.contentId
			) {
				return {
					...resolution,
					target: { ...resolution.target, operationId: activeSession.operationId },
				}
			}
			return resolution
		})
		.filter((resolution) => {
			if (resolution.visibility === "hidden" || seen.has(resolution.id)) return false
			seen.add(resolution.id)
			return true
		})
		.sort((left, right) => {
			const groupOrder = left.presentation.group.localeCompare(right.presentation.group)
			return groupOrder || left.presentation.order - right.presentation.order
		})
}

export function createContentIndex(element: {
	contents?: readonly ContentSnapshot[]
	activeContentId?: string | null
	mainContentId?: string | null
}) {
	const contents = element.contents ?? []
	const byId = new Map(contents.map((content) => [content.contentId, content]))
	const states = new Map(contents.map((content) => [content.contentId, getContentState(content)]))
	const firstContentId = contents[0]?.contentId
	const activeContentId =
		element.activeContentId && byId.has(element.activeContentId)
			? element.activeContentId
			: firstContentId
	const mainContentId =
		element.mainContentId && byId.has(element.mainContentId)
			? element.mainContentId
			: firstContentId
	return {
		activeContentId,
		mainContentId,
		active: activeContentId ? byId.get(activeContentId) : undefined,
		byId,
		states,
	}
}
