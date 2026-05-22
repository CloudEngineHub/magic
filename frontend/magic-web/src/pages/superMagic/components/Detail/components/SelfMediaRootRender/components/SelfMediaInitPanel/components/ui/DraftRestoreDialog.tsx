import { FileClock } from "lucide-react"
import { useTranslation } from "react-i18next"

interface DraftRestoreDialogProps {
	open: boolean
	onRestore: () => void
	onDiscard: () => void
	onBackHome?: () => void
}

export default function DraftRestoreDialog({
	open,
	onRestore,
	onDiscard,
	onBackHome,
}: DraftRestoreDialogProps) {
	const { t } = useTranslation("super")
	if (!open) return null

	return (
		<div className="fixed inset-0 z-modal flex items-center justify-center bg-black/10 px-4 backdrop-blur-sm">
			<div
				role="dialog"
				aria-modal="true"
				className="grid w-full max-w-sm gap-4 rounded-xl bg-background p-4 ring-1 ring-foreground/10"
				data-testid="self-media-draft-restore-dialog"
			>
				<div className="grid place-items-center gap-2 text-center">
					<div className="mb-1 inline-flex size-10 items-center justify-center rounded-md bg-muted">
						<FileClock className="size-5" />
					</div>
					<h2 className="text-base font-medium">
						{t("detail.selfMedia.initPanel.draft.detected")}
					</h2>
					<p className="text-balance text-sm text-muted-foreground">
						{t("detail.selfMedia.initPanel.draft.confirmDescription")}
					</p>
				</div>
				<div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
					{onBackHome ? (
						<button
							type="button"
							className="inline-flex cursor-pointer items-center justify-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
							onClick={onBackHome}
							data-testid="self-media-draft-restore-back-button"
						>
							{t("detail.selfMedia.initPanel.draft.backHome")}
						</button>
					) : null}
					<button
						type="button"
						className="inline-flex cursor-pointer items-center justify-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
						onClick={onDiscard}
						data-testid="self-media-draft-restore-clear-button"
					>
						{t("detail.selfMedia.initPanel.draft.clear")}
					</button>
					<button
						type="button"
						className="inline-flex cursor-pointer items-center justify-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
						onClick={onRestore}
						data-testid="self-media-draft-restore-load-button"
					>
						{t("detail.selfMedia.initPanel.draft.load")}
					</button>
				</div>
			</div>
		</div>
	)
}
