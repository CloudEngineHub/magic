import type { CanvasDesignMethods, MagicConfig } from "../../public/magic-types"
import type { CanvasResourceReferenceResolverSnapshot } from "../../public/resource-reference"
import type { Canvas } from "./Canvas"

function normalizeResolverSnapshot(
	methods: CanvasDesignMethods | undefined,
): CanvasResourceReferenceResolverSnapshot | undefined {
	if (!methods) return undefined

	const explicitSnapshot = methods.resourceReferenceResolverSnapshot
	if (explicitSnapshot) {
		if (typeof explicitSnapshot.resolve !== "function") {
			throw new Error(
				"MagicConfigManager: resourceReferenceResolverSnapshot.resolve must be a function.",
			)
		}
		if (methods.resolveResourceReference !== explicitSnapshot.resolve) {
			throw new Error(
				"MagicConfigManager: resolveResourceReference must match resourceReferenceResolverSnapshot.resolve.",
			)
		}
		if (
			methods.resourceReferenceResolverVersion !== undefined &&
			methods.resourceReferenceResolverVersion !== explicitSnapshot.revision
		) {
			throw new Error(
				"MagicConfigManager: resourceReferenceResolverVersion must match resourceReferenceResolverSnapshot.revision.",
			)
		}
		return explicitSnapshot
	}

	if (methods.resourceReferenceResolverVersion === undefined) return undefined
	return {
		revision: methods.resourceReferenceResolverVersion,
		resolve: methods.resolveResourceReference,
	}
}

/**
 * MagicConfigManager
 * 统一管理 magic 相关配置(methods 和 permissions)
 */
export class MagicConfigManager {
	public config?: MagicConfig

	constructor(options: { canvas: Canvas; config?: MagicConfig }) {
		const { config } = options
		this.update(config)
	}

	update(config?: MagicConfig): { resourceReferenceResolverChanged: boolean } {
		const methods = config?.methods
		if (methods != null && typeof methods.resolveResourceReference !== "function") {
			throw new Error(
				"MagicConfigManager: methods.resolveResourceReference is required when methods is provided.",
			)
		}
		const previousMethods = this.config?.methods
		const previousSnapshot = previousMethods?.resourceReferenceResolverSnapshot
		const nextSnapshot = normalizeResolverSnapshot(methods)
		const resourceReferenceResolverChanged =
			previousSnapshot || nextSnapshot
				? previousSnapshot?.revision !== nextSnapshot?.revision
				: previousMethods?.resolveResourceReference !== methods?.resolveResourceReference

		this.config =
			config && methods && nextSnapshot
				? {
						...config,
						methods: {
							...methods,
							resolveResourceReference: nextSnapshot.resolve,
							resourceReferenceResolverSnapshot: nextSnapshot,
							resourceReferenceResolverVersion: nextSnapshot.revision,
						},
					}
				: config
		return { resourceReferenceResolverChanged }
	}
}
