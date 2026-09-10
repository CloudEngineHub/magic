import { useEffect, type CSSProperties } from "react"
import type { DesignStyle } from "./catalog"
import { loadGoogleFonts } from "./googleFontLoader"
import DashboardScene from "./scene-components/DashboardScene"
import { CommerceScene, EditorialScene, LandingScene } from "./scene-components/MarketingScenes"
import { getSceneTheme } from "./sceneTheme"
import { getStyleProfile } from "./styleProfiles"

export type SceneViewport = "desktop" | "tablet" | "mobile"

interface DesignStyleSceneProps {
	style: DesignStyle
	viewport?: SceneViewport
	compact?: boolean
}

export default function DesignStyleScene({
	style,
	viewport = "desktop",
	compact = false,
}: DesignStyleSceneProps) {
	const profile = getStyleProfile(style.code)
	const scene = profile?.scene ?? "landing"
	const layout = profile?.layout ?? "split"
	const theme = getSceneTheme(style)
	const narrow = viewport === "mobile"
	const sceneStyle = {
		...theme.variables,
		"--scene-title-size": narrow ? "2.5rem" : "clamp(2.25rem, 6cqw, 3.75rem)",
		// Scene typography follows the preview frame width, not the surrounding dialog viewport.
		containerType: "inline-size",
	} as CSSProperties

	useEffect(() => {
		void loadGoogleFonts(theme.font)
	}, [theme.font])

	// Preview artwork is clipped to its selected device frame and remains non-interactive in cards.
	return (
		<div
			style={sceneStyle}
			data-testid={`design-style-scene-${style.code}`}
			data-scene={scene}
			data-layout={layout}
			data-viewport={viewport}
			className={`h-full min-h-full overflow-hidden bg-[var(--scene-bg)] text-[var(--scene-ink)] ${compact ? "pointer-events-none select-none" : ""}`}
		>
			{scene === "dashboard" ? (
				<DashboardScene compact={compact} narrow={narrow} layout={layout} />
			) : scene === "editorial" || scene === "portfolio" ? (
				<EditorialScene scene={scene} compact={compact} narrow={narrow} layout={layout} />
			) : scene === "commerce" ? (
				<CommerceScene compact={compact} narrow={narrow} layout={layout} />
			) : (
				<LandingScene scene={scene} compact={compact} narrow={narrow} layout={layout} />
			)}
		</div>
	)
}
