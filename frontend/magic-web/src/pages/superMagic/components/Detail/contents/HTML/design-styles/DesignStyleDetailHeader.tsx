import { ArrowLeft, FileText, Palette } from "lucide-react"
import type { Ref } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"
import { DialogDescription, DialogTitle } from "@/components/shadcn-ui/dialog"
import type { DesignStyle } from "./catalog"
import { getStyleProfile } from "./styleProfiles"

export type DesignStyleDetailMode = "details" | "raw"

interface DesignStyleDetailHeaderProps {
	style: DesignStyle
	mode: DesignStyleDetailMode
	onModeChange: (mode: DesignStyleDetailMode) => void
	onBack: () => void
	backButtonRef?: Ref<HTMLButtonElement>
}

export default function DesignStyleDetailHeader({
	style,
	mode,
	onModeChange,
	onBack,
	backButtonRef,
}: DesignStyleDetailHeaderProps) {
	const { t, i18n } = useTranslation("super")
	const profile = getStyleProfile(style.code)
	const language = (i18n.resolvedLanguage || i18n.language || "en").startsWith("zh") ? "zh" : "en"
	const name = profile?.name[language] ?? style.title
	const description = profile?.description[language] ?? style.description

	return (
		<div
			className="flex flex-wrap items-end justify-between gap-3"
			data-testid="design-style-detail-header"
		>
			<div className="min-w-0 max-w-3xl">
				<div className="flex min-w-0 items-center gap-2">
					<Button
						ref={backButtonRef}
						variant="ghost"
						size="icon"
						className="size-7 shrink-0 rounded-lg"
						onClick={onBack}
						aria-label={t("htmlEditor.designStyle.gallery.back")}
						data-testid="design-style-back"
					>
						<ArrowLeft className="size-4" aria-hidden="true" />
					</Button>
					<DialogTitle className="text-xl font-semibold tracking-[-0.03em] text-foreground [text-wrap:balance]">
						{name}
					</DialogTitle>
				</div>
				<DialogDescription className="mt-1 max-w-[72ch] text-[11px] leading-4 [text-wrap:pretty]">
					{description}
				</DialogDescription>
			</div>
			<div
				className="flex rounded-lg border border-border/70 bg-background p-1"
				role="tablist"
				aria-label={t("htmlEditor.designStyle.detailSectionsLabel")}
			>
				{[
					{
						value: "details" as const,
						label: t("htmlEditor.designStyle.tokenDetails"),
						Icon: Palette,
					},
					{
						value: "raw" as const,
						label: t("htmlEditor.designStyle.rawMode"),
						Icon: FileText,
					},
				].map(({ value, label, Icon }) => (
					<button
						key={value}
						type="button"
						role="tab"
						aria-selected={mode === value}
						className={`flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-[color,background-color,transform] active:scale-[0.96] ${mode === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
						onClick={() => onModeChange(value)}
					>
						<Icon
							className="size-4"
							strokeWidth={mode === value ? 2 : 1.5}
							aria-hidden="true"
						/>
						{label}
					</button>
				))}
			</div>
		</div>
	)
}
