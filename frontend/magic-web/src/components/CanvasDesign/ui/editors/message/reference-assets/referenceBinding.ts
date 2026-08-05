import {
	parsePromptPlaceholderTokenMatches,
	type PromptPlaceholderTokenConfig,
	type PromptPlaceholderTokenKind,
} from "./promptPlaceholderTokenConfig"
import {
	getCanvasResourceFileName,
	getCanvasResourceReferenceIdentity,
} from "../../../../runtime/shared/path/canvasResourcePath"
import type { ResolveCanvasResourceReference } from "../../../../public/resource-reference"
import { getMatchablePathsFromValue } from "../tiptap/contentUtils"

export type ReferenceBindingMode = "prompt-linked" | "detached-legacy" | "mixed"

export interface ReferenceBindingResourceInfo {
	path: string
	fileName?: string
	assetType?: PromptPlaceholderTokenKind
}

export interface ReferenceBindingState {
	mode: ReferenceBindingMode
	explicitPromptReferencePaths: string[]
	protectedReferencePaths: string[]
}

function resolveAssetType(info: ReferenceBindingResourceInfo): PromptPlaceholderTokenKind {
	return info.assetType ?? "image"
}

function buildPromptMatchableItems(referenceFileInfos: ReferenceBindingResourceInfo[]) {
	return referenceFileInfos.map((info) => ({
		name: info.fileName || getCanvasResourceFileName(info.path) || info.path,
		path: info.path,
	}))
}

export function areOrderedPathsEqual(
	left: string[],
	right: string[],
	resolveResourceReference?: ResolveCanvasResourceReference,
): boolean {
	if (left === right) return true
	if (left.length !== right.length) return false
	for (let index = 0; index < left.length; index += 1) {
		if (
			getCanvasResourceReferenceIdentity(left[index], resolveResourceReference) !==
			getCanvasResourceReferenceIdentity(right[index], resolveResourceReference)
		) {
			return false
		}
	}
	return true
}

/**
 * Reference binding standard shared by image and video editors:
 * - Placeholder tokens and parsed @mentions are explicit prompt bindings.
 * - Restored references that are not explicitly bound in the prompt are protected legacy references.
 * - Protected references must survive normal prompt edits; only explicit deletion or a new mention
 *   for the same path moves them back into the prompt-bound lifecycle.
 */
export function resolveExplicitPromptReferencePaths(params: {
	prompt: string
	referenceFileInfos: ReferenceBindingResourceInfo[]
	tokenConfig: PromptPlaceholderTokenConfig
	resolveResourceReference?: ResolveCanvasResourceReference
}): string[] {
	const { prompt, referenceFileInfos, tokenConfig, resolveResourceReference } = params
	if (!prompt || referenceFileInfos.length === 0) return []

	const explicitPathIdentities = new Set<string>()
	const placeholderMatches = parsePromptPlaceholderTokenMatches(prompt, tokenConfig)
	for (const match of placeholderMatches) {
		const matchingResources = referenceFileInfos.filter(
			(info) => resolveAssetType(info) === match.kind,
		)
		const referencedInfo = matchingResources[match.index - 1]
		if (referencedInfo?.path) {
			explicitPathIdentities.add(
				getCanvasResourceReferenceIdentity(referencedInfo.path, resolveResourceReference),
			)
		}
	}

	const mentionPaths = getMatchablePathsFromValue(
		prompt,
		buildPromptMatchableItems(referenceFileInfos),
	)
	for (const path of mentionPaths) {
		explicitPathIdentities.add(
			getCanvasResourceReferenceIdentity(path, resolveResourceReference),
		)
	}

	return referenceFileInfos
		.map((info) => info.path)
		.filter(
			(path) =>
				path &&
				explicitPathIdentities.has(
					getCanvasResourceReferenceIdentity(path, resolveResourceReference),
				),
		)
}

export function resolveReferenceBindingState(params: {
	prompt: string
	referenceFileInfos: ReferenceBindingResourceInfo[]
	tokenConfig: PromptPlaceholderTokenConfig
	resolveResourceReference?: ResolveCanvasResourceReference
}): ReferenceBindingState {
	const { prompt, referenceFileInfos, tokenConfig, resolveResourceReference } = params
	const explicitPromptReferencePaths = resolveExplicitPromptReferencePaths({
		prompt,
		referenceFileInfos,
		tokenConfig,
		resolveResourceReference,
	})
	const explicitPathIdentities = new Set(
		explicitPromptReferencePaths.map((path) =>
			getCanvasResourceReferenceIdentity(path, resolveResourceReference),
		),
	)
	const protectedReferencePaths = referenceFileInfos
		.map((info) => info.path)
		.filter(
			(path) =>
				path &&
				!explicitPathIdentities.has(
					getCanvasResourceReferenceIdentity(path, resolveResourceReference),
				),
		)

	if (protectedReferencePaths.length === 0) {
		return {
			mode: "prompt-linked",
			explicitPromptReferencePaths,
			protectedReferencePaths,
		}
	}

	if (explicitPromptReferencePaths.length === 0) {
		return {
			mode: "detached-legacy",
			explicitPromptReferencePaths,
			protectedReferencePaths,
		}
	}

	return {
		mode: "mixed",
		explicitPromptReferencePaths,
		protectedReferencePaths,
	}
}

export function pruneProtectedReferencePaths(
	currentReferencePaths: string[],
	protectedReferencePaths: string[],
	resolveResourceReference?: ResolveCanvasResourceReference,
): string[] {
	const currentPathIdentities = new Set(
		currentReferencePaths.map((path) =>
			getCanvasResourceReferenceIdentity(path, resolveResourceReference),
		),
	)
	return protectedReferencePaths.filter((path) =>
		currentPathIdentities.has(
			getCanvasResourceReferenceIdentity(path, resolveResourceReference),
		),
	)
}

export function unprotectPromptBoundReferencePaths(
	protectedReferencePaths: string[],
	explicitPromptReferencePaths: string[],
	resolveResourceReference?: ResolveCanvasResourceReference,
): string[] {
	if (protectedReferencePaths.length === 0 || explicitPromptReferencePaths.length === 0) {
		return protectedReferencePaths
	}
	const explicitPathIdentities = new Set(
		explicitPromptReferencePaths.map((path) =>
			getCanvasResourceReferenceIdentity(path, resolveResourceReference),
		),
	)
	return protectedReferencePaths.filter(
		(path) =>
			!explicitPathIdentities.has(
				getCanvasResourceReferenceIdentity(path, resolveResourceReference),
			),
	)
}
