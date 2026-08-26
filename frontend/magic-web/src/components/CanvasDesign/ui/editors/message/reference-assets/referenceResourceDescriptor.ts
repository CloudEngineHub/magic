import {
	getCanvasResourceFileName,
	getCanvasResourceReferenceIdentity,
	isOpaqueAssetReference,
	isRemoteOrSpecialPath,
	resolveCanvasStorageResourceReference,
} from "../../../../runtime/shared/path/canvasResourcePath"
import type { ResolveCanvasResourceReference } from "../../../../public/resource-reference"
import type {
	ReferenceResourceAssetType,
	ReferenceResourceDescriptor,
} from "./reference-resource.types"

export interface ReferenceResourceMetadataCandidate {
	path: string
	assetType?: ReferenceResourceAssetType
}

export interface CreateReferenceResourceDescriptorOptions {
	path: string
	src?: string
	fileName?: string
	assetType?: ReferenceResourceAssetType
	resolveResourceReference?: ResolveCanvasResourceReference
}

export function createReferenceResourceDescriptor(
	options: CreateReferenceResourceDescriptorOptions,
): ReferenceResourceDescriptor | null {
	const path = options.path.trim()
	if (!path) return null

	const identity = getCanvasResourceReferenceIdentity(path, options.resolveResourceReference)
	if (!identity) return null

	return {
		path,
		identity,
		resourceKind: resolveResourceKind(path, options.resolveResourceReference),
		fileName: options.fileName || getCanvasResourceFileName(path) || path,
		src: options.src || path,
		...(options.assetType ? { assetType: options.assetType } : {}),
	}
}

/** 显式类型和同身份元数据优先；opaque URI 永不按后缀猜测。 */
export function resolveReferenceResourceAssetType(options: {
	path: string
	explicitAssetType?: ReferenceResourceAssetType
	metadataCandidates?: readonly ReferenceResourceMetadataCandidate[]
	inferFromPath?: (path: string) => ReferenceResourceAssetType | undefined
	resolveResourceReference?: ResolveCanvasResourceReference
}): ReferenceResourceAssetType | undefined {
	if (options.explicitAssetType) return options.explicitAssetType

	const identity = getCanvasResourceReferenceIdentity(
		options.path,
		options.resolveResourceReference,
	)
	const metadataMatch = options.metadataCandidates?.find(
		(candidate) =>
			candidate.assetType &&
			getCanvasResourceReferenceIdentity(candidate.path, options.resolveResourceReference) ===
				identity,
	)
	if (metadataMatch?.assetType) return metadataMatch.assetType

	if (isOpaqueAssetReference(options.path)) return undefined
	return options.inferFromPath?.(options.path)
}

function resolveResourceKind(
	path: string,
	resolveResourceReference?: ResolveCanvasResourceReference,
): ReferenceResourceDescriptor["resourceKind"] {
	if (resolveResourceReference) {
		const resolution = resolveCanvasStorageResourceReference(path, resolveResourceReference)
		if (resolution?.status === "resolved") return resolution.resourceKind
	}
	if (isOpaqueAssetReference(path)) return "opaque-asset"
	if (isRemoteOrSpecialPath(path)) return "external"
	return "workspace-file"
}
