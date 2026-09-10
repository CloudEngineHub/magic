import { useId } from "react"
import type { DesignStyle } from "./catalog"
import CommerceCover from "./cover-components/CommerceCover"
import DashboardCover from "./cover-components/DashboardCover"
import EditorialCover from "./cover-components/EditorialCover"
import LandingCover from "./cover-components/LandingCover"
import { hasFeature } from "./cover-components/types"
import { getSceneTheme } from "./sceneTheme"
import { getStyleProfile } from "./styleProfiles"

export default function DesignStyleCover({ style }: { style: DesignStyle }) {
	const profile = getStyleProfile(style.code)
	const theme = getSceneTheme(style)
	const features = profile?.features ?? []
	const layout = profile?.layout ?? "split"
	const radius = hasFeature(features, "sharp-corners")
		? 0
		: hasFeature(features, "rounded-cards")
			? 22
			: 10
	const gradientId = useId().replace(/:/g, "")
	const context = { layout, features, radius }

	return (
		<svg
			viewBox="0 0 800 500"
			aria-hidden="true"
			focusable="false"
			className="block size-full"
			style={theme.variables}
			preserveAspectRatio="xMidYMid slice"
		>
			<defs>
				<radialGradient id={gradientId} cx="82%" cy="8%" r="75%">
					<stop
						stopColor="var(--scene-primary)"
						stopOpacity={hasFeature(features, "glow") ? 0.42 : 0.16}
					/>
					<stop offset="1" stopColor="var(--scene-bg)" stopOpacity="0" />
				</radialGradient>
			</defs>
			<rect width="800" height="500" fill="var(--scene-bg)" />
			{(hasFeature(features, "glow") || hasFeature(features, "soft-gradient")) && (
				<rect width="800" height="500" fill={`url(#${gradientId})`} />
			)}
			{hasFeature(features, "hairline-grid") && (
				<path
					d="M0 100H800M0 200H800M0 300H800M0 400H800M100 0V500M200 0V500M300 0V500M400 0V500M500 0V500M600 0V500M700 0V500"
					stroke="var(--scene-line)"
					opacity=".5"
				/>
			)}
			{profile?.scene === "dashboard" ? (
				<DashboardCover {...context} />
			) : profile?.scene === "editorial" || profile?.scene === "portfolio" ? (
				<EditorialCover {...context} />
			) : profile?.scene === "commerce" ? (
				<CommerceCover {...context} />
			) : (
				<LandingCover {...context} />
			)}
		</svg>
	)
}
