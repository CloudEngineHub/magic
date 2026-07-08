"use client"

import { useTranslation } from "react-i18next"
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/shadcn-ui/alert-dialog"

export function RestoreModal({
	open,
	onOpenChange,
	title,
	statusMessage,
	confirmDisabled,
	secondaryActionText,
	onSecondaryAction,
	secondaryActionDisabled,
	onConfirm,
}: RestoreModalProps) {
	const { t } = useTranslation("super")
	const statusLines = statusMessage
		?.split("\n")
		.map((line) => line.trim())
		.filter(Boolean)

	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent
				className="gap-4 rounded-[10px] border border-border bg-card p-6 shadow-lg"
				data-testid="recycle-bin-restore-modal"
			>
				<AlertDialogHeader className="gap-2 text-left">
					<AlertDialogTitle className="text-lg font-semibold leading-normal text-foreground">
						{title}
					</AlertDialogTitle>
					{statusMessage ? (
						<div
							className="text-sm font-normal leading-normal text-muted-foreground"
							data-testid="recycle-bin-restore-status"
						>
							{statusLines && statusLines.length > 1 ? (
								<ul className="list-disc space-y-1.5 pl-5">
									{statusLines.map((line) => (
										<li key={line}>{line}</li>
									))}
								</ul>
							) : (
								<span>{statusMessage}</span>
							)}
						</div>
					) : null}
				</AlertDialogHeader>

				<AlertDialogFooter className="flex-row justify-end gap-2">
					<AlertDialogCancel
						className="h-9 rounded-lg px-4 shadow-sm"
						data-testid="recycle-bin-restore-cancel"
					>
						{t("recycleBin.restoreModal.cancel")}
					</AlertDialogCancel>
					{secondaryActionText && onSecondaryAction ? (
						<button
							type="button"
							className="h-9 rounded-lg border border-border px-4 text-sm text-foreground shadow-sm hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
							onClick={onSecondaryAction}
							disabled={secondaryActionDisabled}
							data-testid="recycle-bin-restore-secondary"
						>
							{secondaryActionText}
						</button>
					) : null}
					<AlertDialogAction
						className="h-9 rounded-lg bg-primary px-4 text-primary-foreground shadow-sm hover:bg-primary/90"
						onClick={onConfirm}
						disabled={confirmDisabled}
						data-testid="recycle-bin-restore-confirm"
					>
						{t("recycleBin.restoreModal.confirm")}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}

interface RestoreModalProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	title: string
	statusMessage?: string
	confirmDisabled?: boolean
	secondaryActionText?: string
	onSecondaryAction?: () => void
	secondaryActionDisabled?: boolean
	onConfirm: () => void
}
