import type { Plugin, UserConfig } from "vite"

export interface PublicOverlayLayerOption {
	name: string
	rootPath: string
	publicDir?: string | false
}

export interface PublicOverlayPlan {
	config: UserConfig
	plugins: Plugin[]
}

export function createPublicOverlayPlan({
	layers: _layers,
}: {
	projectRoot: string
	layers: PublicOverlayLayerOption[]
}): PublicOverlayPlan {
	// Public overlay has a dedicated planner so future `public/` precedence can
	// be added without coupling static-asset behavior to the src/html resolvers.
	return { config: {}, plugins: [] }
}
