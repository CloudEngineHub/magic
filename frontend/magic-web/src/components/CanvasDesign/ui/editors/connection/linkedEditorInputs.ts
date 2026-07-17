import type { Canvas } from "../../../runtime/core/Canvas"
import {
	type CropConfig,
	ElementTypeEnum,
	type ImageElement,
	type TextElement,
	type VideoElement,
} from "../../../runtime/document/types"
import {
	extractPlainTextFromRichText,
	extractPromptTextFromRichText,
} from "../../../runtime/text/richText"
import { getCanvasResourceFileName } from "../../../runtime/shared/path/canvasResourcePath"
import { getLinkedTextPromptText, type LinkedTextConnection } from "./linkedTextPrompt"

export type LinkedEditorTargetKind = "image" | "video"
export type LinkedEditorMediaKind = "image" | "video" | "audio"
export type LinkedEditorMediaStatus = "active" | "inactive"
export type LinkedEditorMediaInactiveReason =
	| "unsupported-type"
	| "unsupported-mode"
	| "over-limit"
	| "missing-resource"
	| "duplicate"

export interface LinkedEditorMediaReference {
	kind: LinkedEditorMediaKind
	path: string
	sourceCrop?: CropConfig
}

export interface LinkedEditorMediaPolicy {
	supportedKinds: LinkedEditorMediaKind[]
	manualReferences?: LinkedEditorMediaReference[]
	maxTotalCount?: number
	maxCountByKind?: Partial<Record<LinkedEditorMediaKind, number>>
	validateActiveReferences?: (
		references: LinkedEditorMediaReference[],
	) => LinkedEditorMediaInactiveReason | null
}

export interface LinkedEditorMediaCandidate {
	connectionId: string
	sourceElementId: string
	kind: LinkedEditorMediaKind
	path?: string
	fileName?: string
	sourceCrop?: CropConfig
}

export interface LinkedEditorMediaItem extends LinkedEditorMediaCandidate {
	status: LinkedEditorMediaStatus
	reason?: LinkedEditorMediaInactiveReason
}

export interface LinkedEditorInputsResolution {
	textConnections: LinkedTextConnection[]
	textPrompt: string
	mediaItems: LinkedEditorMediaItem[]
	activeMediaReferences: LinkedEditorMediaReference[]
}

interface ResolveLinkedEditorInputsOptions {
	canvas: Canvas | null
	targetElementId: string
	targetKind: LinkedEditorTargetKind
	enabled?: boolean
	mediaPolicy?: LinkedEditorMediaPolicy
}

function getFileName(path: string): string {
	return getCanvasResourceFileName(path) || path
}

function getMediaSourceTypeUnsupportedReason(
	targetKind: LinkedEditorTargetKind,
	mediaKind: LinkedEditorMediaKind,
): LinkedEditorMediaInactiveReason | null {
	if (targetKind === "image" && mediaKind !== "image") return "unsupported-type"
	return null
}

function getFiniteLimit(value: number | undefined): number {
	return Number.isFinite(value) ? Math.max(0, Number(value)) : Infinity
}

export function resolveLinkedMediaItems(
	candidates: LinkedEditorMediaCandidate[],
	options: {
		targetKind: LinkedEditorTargetKind
		mediaPolicy?: LinkedEditorMediaPolicy
	},
): LinkedEditorMediaItem[] {
	const { targetKind, mediaPolicy } = options
	const supportedKindSet = new Set(mediaPolicy?.supportedKinds ?? [])
	const activePathSet = new Set<string>()
	const manualReferences = mediaPolicy?.manualReferences ?? []
	manualReferences.forEach((reference) => activePathSet.add(reference.path))
	const activeReferences = [...manualReferences]

	const totalLimit = getFiniteLimit(mediaPolicy?.maxTotalCount)
	const activeCountByKind: Record<LinkedEditorMediaKind, number> = {
		image: 0,
		video: 0,
		audio: 0,
	}
	manualReferences.forEach((reference) => {
		activeCountByKind[reference.kind] += 1
	})
	const maxCountByKind = mediaPolicy?.maxCountByKind ?? {}

	return candidates.map((candidate) => {
		const targetUnsupportedReason = getMediaSourceTypeUnsupportedReason(
			targetKind,
			candidate.kind,
		)
		if (targetUnsupportedReason) {
			return { ...candidate, status: "inactive", reason: targetUnsupportedReason }
		}
		if (!candidate.path) {
			return { ...candidate, status: "inactive", reason: "missing-resource" }
		}
		if (!supportedKindSet.has(candidate.kind)) {
			return { ...candidate, status: "inactive", reason: "unsupported-mode" }
		}
		if (activePathSet.has(candidate.path)) {
			return { ...candidate, status: "inactive", reason: "duplicate" }
		}
		if (activePathSet.size >= totalLimit) {
			return { ...candidate, status: "inactive", reason: "over-limit" }
		}

		const kindLimit = getFiniteLimit(maxCountByKind[candidate.kind])
		if (activeCountByKind[candidate.kind] >= kindLimit) {
			return { ...candidate, status: "inactive", reason: "over-limit" }
		}

		const nextReference = {
			kind: candidate.kind,
			path: candidate.path,
			sourceCrop: candidate.sourceCrop,
		}
		const validationReason = mediaPolicy?.validateActiveReferences?.([
			...activeReferences,
			nextReference,
		])
		if (validationReason) {
			return { ...candidate, status: "inactive", reason: validationReason }
		}

		activePathSet.add(candidate.path)
		activeReferences.push(nextReference)
		activeCountByKind[candidate.kind] += 1
		return { ...candidate, status: "active" }
	})
}

export function mergeLinkedMediaReferences(
	manualReferences: LinkedEditorMediaReference[],
	linkedReferences: LinkedEditorMediaReference[],
): LinkedEditorMediaReference[] {
	const merged: LinkedEditorMediaReference[] = []
	const seenPathSet = new Set<string>()

	for (const reference of [...manualReferences, ...linkedReferences]) {
		if (!reference.path || seenPathSet.has(reference.path)) continue
		seenPathSet.add(reference.path)
		merged.push(reference)
	}

	return merged
}

export function resolveLinkedEditorInputs(
	options: ResolveLinkedEditorInputsOptions,
): LinkedEditorInputsResolution {
	const { canvas, targetElementId, targetKind, enabled = true, mediaPolicy } = options
	const textConnections: LinkedTextConnection[] = []
	const mediaCandidates: LinkedEditorMediaCandidate[] = []

	if (canvas && enabled) {
		const upstreamConnections = canvas.connectionManager.getUpstreamConnections(targetElementId)
		upstreamConnections.forEach((connection) => {
			const sourceElement = canvas.elementManager.getElementData(connection.sourceElementId)
			if (!sourceElement) return

			if (sourceElement.type === ElementTypeEnum.Text) {
				const content = (sourceElement as TextElement).content
				if (!extractPlainTextFromRichText(content).trim()) return
				textConnections.push({
					connectionId: connection.id,
					sourceElementId: connection.sourceElementId,
					text: extractPromptTextFromRichText(content),
				})
				return
			}

			if (sourceElement.type === ElementTypeEnum.Image) {
				const imageElement = sourceElement as ImageElement
				const path = imageElement.src
				mediaCandidates.push({
					connectionId: connection.id,
					sourceElementId: connection.sourceElementId,
					kind: "image",
					path,
					fileName: path ? getFileName(path) : undefined,
					sourceCrop: imageElement.crop,
				})
				return
			}

			if (sourceElement.type === ElementTypeEnum.Video) {
				const path = (sourceElement as VideoElement).src
				mediaCandidates.push({
					connectionId: connection.id,
					sourceElementId: connection.sourceElementId,
					kind: "video",
					path,
					fileName: path ? getFileName(path) : undefined,
				})
			}
		})
	}

	const mediaItems = resolveLinkedMediaItems(mediaCandidates, {
		targetKind,
		mediaPolicy,
	})
	const activeMediaReferences = mediaItems
		.filter(
			(item): item is LinkedEditorMediaItem & { path: string } => item.status === "active",
		)
		.map((item) => ({
			kind: item.kind,
			path: item.path,
			sourceCrop: item.sourceCrop,
		}))

	return {
		textConnections,
		textPrompt: getLinkedTextPromptText(textConnections),
		mediaItems,
		activeMediaReferences,
	}
}
