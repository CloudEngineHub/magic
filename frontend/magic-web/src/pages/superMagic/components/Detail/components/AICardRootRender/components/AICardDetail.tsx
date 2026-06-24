import { memo } from "react"
import { motion } from "framer-motion"
import { useTranslation } from "react-i18next"
import { ChevronLeft, ChevronRight } from "lucide-react"
import AICardIframe from "./AICardIframe"
import type { AICardEntry } from "../types"

interface AICardDetailProps {
	card: AICardEntry
	/** Override file to display (e.g. history entry). Falls back to card.latestHtmlFileId */
	htmlFileId?: string
	attachmentList?: any[]
	canGoToPreviousVersion?: boolean
	canGoToNextVersion?: boolean
	onOpenPreviousVersion?: () => void
	onOpenNextVersion?: () => void
	onBack: () => void
}

function AICardDetail({
	card,
	htmlFileId,
	attachmentList,
	canGoToPreviousVersion = false,
	canGoToNextVersion = false,
	onOpenPreviousVersion,
	onOpenNextVersion,
	onBack,
}: AICardDetailProps) {
	const { t } = useTranslation("super")
	const fileId = htmlFileId || card.latestHtmlFileId
	const showVersionControls = Boolean(onOpenPreviousVersion || onOpenNextVersion)
	const previousVersionLabel = t("detail.aiCard.detail.previousVersion")
	const nextVersionLabel = t("detail.aiCard.detail.nextVersion")
	const previousVersionTitle = canGoToPreviousVersion
		? previousVersionLabel
		: t("detail.aiCard.detail.previousVersionDisabled")
	const nextVersionTitle = canGoToNextVersion
		? nextVersionLabel
		: t("detail.aiCard.detail.nextVersionDisabled")
	const versionButtonClassName =
		"inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground shadow-sm transition-colors hover:border-border/80 hover:bg-muted/80 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:border-border disabled:bg-muted/40 disabled:text-muted-foreground disabled:opacity-45 disabled:shadow-none disabled:hover:border-border disabled:hover:bg-muted/40 disabled:hover:text-muted-foreground"

	return (
		<motion.div
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			exit={{ opacity: 0 }}
			transition={{ duration: 0.25 }}
			className="flex h-full flex-col"
		>
			{/* Header toolbar */}
			<motion.div
				initial={{ opacity: 0, y: -10 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ delay: 0.1, duration: 0.2 }}
				className="flex items-center justify-between border-b border-border px-4 py-3"
			>
				<div className="flex min-w-0 items-center gap-3">
					<button
						type="button"
						onClick={onBack}
						className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
					>
						<svg
							width="16"
							height="16"
							viewBox="0 0 16 16"
							fill="none"
							xmlns="http://www.w3.org/2000/svg"
						>
							<path
								d="M10 12L6 8L10 4"
								stroke="currentColor"
								strokeWidth="1.5"
								strokeLinecap="round"
								strokeLinejoin="round"
							/>
						</svg>
						{t("detail.aiCard.detail.back")}
					</button>
					<div className="h-4 w-px shrink-0 bg-border" />
					<h2 className="truncate text-sm font-semibold text-foreground">{card.name}</h2>
				</div>
				<div className="flex shrink-0 items-center gap-2">
					{card.lastUpdated && (
						<span className="hidden text-xs text-muted-foreground sm:inline">
							{new Date(card.lastUpdated).toLocaleString(undefined, {
								month: "short",
								day: "numeric",
								hour: "2-digit",
								minute: "2-digit",
							})}
						</span>
					)}
					{showVersionControls && (
						<div
							className="flex items-center gap-1"
							data-testid="ai-card-detail-version-controls"
						>
							<button
								type="button"
								aria-label={previousVersionLabel}
								title={previousVersionTitle}
								disabled={!canGoToPreviousVersion}
								onClick={onOpenPreviousVersion}
								className={versionButtonClassName}
							>
								<ChevronLeft size={16} aria-hidden="true" />
							</button>
							<button
								type="button"
								aria-label={nextVersionLabel}
								title={nextVersionTitle}
								disabled={!canGoToNextVersion}
								onClick={onOpenNextVersion}
								className={versionButtonClassName}
							>
								<ChevronRight size={16} aria-hidden="true" />
							</button>
						</div>
					)}
				</div>
			</motion.div>

			{/* Card content */}
			<motion.div layoutId={`ai-card-tile-${card.id}`} className="flex-1 overflow-auto">
				{fileId ? (
					<AICardIframe
						fileId={fileId}
						attachmentList={attachmentList}
						className="h-full w-full"
						style={{ height: "100%" }}
					/>
				) : (
					<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
						{t("detail.aiCard.detail.noContent")}
					</div>
				)}
			</motion.div>
		</motion.div>
	)
}

export default memo(AICardDetail)
