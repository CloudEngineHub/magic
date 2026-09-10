import type { MouseEvent } from "react"
import { Sparkles } from "lucide-react"
import { useTranslation } from "react-i18next"
import type { DesignStyle } from "./catalog"
import { getStyleProfile } from "./styleProfiles"
import DesignStyleThumbnail from "./DesignStyleThumbnail"

interface DesignStyleCardProps {
	style: DesignStyle
	onSelect: (event: MouseEvent<HTMLButtonElement>) => void
}

export default function DesignStyleCard({ style, onSelect }: DesignStyleCardProps) {
	const { t, i18n } = useTranslation("super")
	const language = (i18n.resolvedLanguage || i18n.language || "en").startsWith("zh") ? "zh" : "en"
	const profile = getStyleProfile(style.code)

	return (
		<article className="group relative w-full overflow-hidden rounded-xl border border-border/70 bg-background text-left transition-[border-color,background-color,box-shadow,transform] duration-150 focus-within:ring-2 focus-within:ring-ring/50 hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-md">
			<DesignStyleThumbnail style={style} />

			<div className="p-2.5">
				<div className="mb-1 flex items-center justify-between gap-2">
					<div className="flex min-w-0 items-center gap-1.5">
						<span className="truncate text-[13px] font-semibold text-foreground">
							{profile?.name[language] ?? style.title}
						</span>
						{style.featured && (
							<Sparkles
								className="size-4 shrink-0 text-amber-500"
								aria-label={t("htmlEditor.designStyle.featured")}
							/>
						)}
					</div>
				</div>
				<div>
					<span className="line-clamp-2 text-[11px] leading-4 text-muted-foreground">
						{profile?.description[language] ?? style.description}
					</span>
				</div>
			</div>
			<button
				type="button"
				aria-label={profile?.name[language] ?? style.title}
				className="absolute inset-0 z-10 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
				onClick={onSelect}
				data-testid={`design-style-card-${style.code}`}
			/>
		</article>
	)
}
