import { useEffect, type CSSProperties } from "react"
import { useTranslation } from "react-i18next"
import type { DesignStyle } from "./catalog"
import DesignStyleArtwork from "./DesignStyleArtwork"
import { loadGoogleFonts } from "./googleFontLoader"
import { getSceneTheme } from "./sceneTheme"
import { getStyleProfile } from "./styleProfiles"
import { useSceneCopy } from "./useSceneCopy"

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
	const { t, i18n } = useTranslation("super")
	const copy = useSceneCopy()
	const profile = getStyleProfile(style.code)
	const scene = profile?.scene ?? "landing"
	const layout = profile?.layout ?? "split"
	const theme = getSceneTheme(style)
	const narrow = viewport === "mobile"
	const language = (i18n.resolvedLanguage || i18n.language || "en").startsWith("zh") ? "zh" : "en"
	const [title, description] = {
		dashboard: [copy.dashboardTitle, copy.dashboardDescription],
		editorial: [copy.editorialTitle, copy.editorialDescription],
		portfolio: [copy.portfolioTitle, copy.portfolioDescription],
		commerce: [copy.commerceTitle, copy.commerceDescription],
		terminal: [copy.terminalTitle, copy.terminalDescription],
		landing: [copy.landingTitle, copy.landingDescription],
	}[scene]
	useEffect(() => {
		void loadGoogleFonts(theme.font)
	}, [theme.font])
	return (
		<div
			style={{ ...theme.variables, containerType: "inline-size" } as CSSProperties}
			data-testid={`design-style-scene-${style.code}`}
			data-scene={scene}
			data-layout={layout}
			data-viewport={viewport}
			className={`overflow-hidden bg-[var(--scene-bg)] text-[var(--scene-ink)] ${compact ? "pointer-events-none select-none" : ""}`}
		>
			<div className="flex items-center justify-between gap-4 border-b border-[var(--scene-line)] px-6 py-4 text-xs">
				<span className="min-w-0 truncate">{profile?.name[language] ?? style.title}</span>
				<span className="shrink-0 text-[var(--scene-muted)]">
					{t("htmlEditor.designStyle.gallery.styleExample")}
				</span>
			</div>
			<div
				className={`grid items-center gap-8 p-6 [@container(min-width:600px)]:p-10 ${narrow || layout === "stacked" ? "grid-cols-1" : "grid-cols-1 [@container(min-width:540px)]:grid-cols-[minmax(0,1.2fr)_minmax(0,.8fr)]"}`}
			>
				<div className="min-w-0">
					<h2 className="max-w-[18ch] whitespace-pre-line break-words text-[clamp(28px,5.5cqw,48px)] leading-[1.35] tracking-[-0.03em] [font-weight:var(--scene-weight)]">
						{title}
					</h2>
					<p className="mt-5 max-w-[40ch] text-sm leading-7 text-[var(--scene-muted)]">
						{description}
					</p>
					<span className="mt-6 inline-block bg-[var(--scene-primary)] px-4 py-2.5 text-sm text-[var(--scene-on-primary)] [border-radius:var(--scene-radius)]">
						{copy.explore} ↗
					</span>
				</div>
				<svg
					viewBox="0 0 300 300"
					aria-hidden="true"
					className={`mx-auto w-full ${narrow ? "max-h-48" : "max-h-72"} ${layout === "magazine" && !narrow ? "[@container(min-width:540px)]:-order-1" : ""}`}
				>
					<DesignStyleArtwork profile={profile} />
				</svg>
			</div>
		</div>
	)
}
