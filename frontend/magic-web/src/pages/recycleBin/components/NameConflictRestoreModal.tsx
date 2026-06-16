"use client"

import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/shadcn-ui/alert-dialog"
import { Checkbox } from "@/components/shadcn-ui/checkbox"

export function NameConflictRestoreModal({
	open,
	fileName,
	pendingCount,
	isResolvingAll,
	onCancel,
	onReplace,
	onSkip,
}: NameConflictRestoreModalProps) {
	const { t } = useTranslation("super")
	const [applyToRemaining, setApplyToRemaining] = useState(false)

	useEffect(() => {
		if (!open) {
			setApplyToRemaining(false)
		}
	}, [open, fileName])

	return (
		<AlertDialog open={open} onOpenChange={(nextOpen) => !nextOpen && onCancel()}>
			<AlertDialogContent
				className="w-[560px] max-w-[calc(100%-2rem)] gap-4 rounded-[10px] border border-border bg-card p-6 shadow-lg"
				data-testid="recycle-bin-name-conflict-modal"
			>
				<AlertDialogHeader className="gap-2 text-left">
					<AlertDialogTitle className="break-all text-lg font-semibold leading-normal text-foreground">
						{t("recycleBin.restoreCheck.nameConflictDialogTitle", { fileName })}
					</AlertDialogTitle>
					<AlertDialogDescription className="text-sm font-normal leading-normal text-muted-foreground">
						{t("topicFiles.duplicateFile.message", { fileName })}
					</AlertDialogDescription>
					{pendingCount > 1 ? (
						<div className="mt-2 flex items-center gap-2">
							<Checkbox
								checked={applyToRemaining}
								disabled={isResolvingAll}
								onCheckedChange={(checked) => setApplyToRemaining(checked === true)}
								data-testid="recycle-bin-name-conflict-apply-remaining"
							/>
							<button
								type="button"
								className="text-sm font-normal leading-normal text-muted-foreground"
								onClick={() => setApplyToRemaining((prev) => !prev)}
								disabled={isResolvingAll}
							>
								{t("recycleBin.restoreCheck.applySameActionToRemaining", {
									count: pendingCount - 1,
								})}
							</button>
						</div>
					) : null}
				</AlertDialogHeader>

				<AlertDialogFooter className="flex-row justify-end gap-2">
					<AlertDialogCancel
						disabled={isResolvingAll}
						className="h-9 rounded-lg px-4 shadow-sm"
						data-testid="recycle-bin-name-conflict-cancel"
					>
						{t("topicFiles.duplicateFile.cancel")}
					</AlertDialogCancel>
					<AlertDialogAction
						disabled={isResolvingAll}
						className="h-9 rounded-lg border border-border bg-background px-4 text-foreground shadow-sm hover:bg-accent"
						onClick={() => onSkip(applyToRemaining)}
						data-testid="recycle-bin-name-conflict-skip"
					>
						{t("recycleBin.restoreCheck.skipNameConflict")}
					</AlertDialogAction>
					<AlertDialogAction
						disabled={isResolvingAll}
						className="h-9 rounded-lg bg-primary px-4 text-primary-foreground shadow-sm hover:bg-primary/90"
						onClick={() => onReplace(applyToRemaining)}
						data-testid="recycle-bin-name-conflict-replace"
					>
						{isResolvingAll
							? t("recycleBin.restoreCheck.processingAllNameConflicts")
							: t("topicFiles.duplicateFile.replace")}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}

interface NameConflictRestoreModalProps {
	open: boolean
	fileName: string
	pendingCount: number
	isResolvingAll: boolean
	onCancel: () => void
	onReplace: (applyToRemaining: boolean) => void
	onSkip: (applyToRemaining: boolean) => void
}
