import { AlertTriangle } from "lucide-react"
import { memo } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/shadcn-ui/dialog"

interface MemoryEditConflictDialogProps {
	open: boolean
	loading: boolean
	onCancel: () => void
	onUseLatest: () => void
	onMerge: () => void
	onOverwrite: () => void
}

/** 长期记忆并发编辑冲突处理弹窗。 */
export const MemoryEditConflictDialog = memo(function MemoryEditConflictDialog({
	open,
	loading,
	onCancel,
	onUseLatest,
	onMerge,
	onOverwrite,
}: MemoryEditConflictDialogProps) {
	const { t } = useTranslation("super/longMemory")

	return (
		<Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && !loading && onCancel()}>
			<DialogContent className="sm:max-w-[560px]" showCloseButton={!loading}>
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<AlertTriangle className="size-5 text-amber-500" />
						{t("globalEditor.conflict.title")}
					</DialogTitle>
					<DialogDescription className="text-left leading-6">
						{t("globalEditor.conflict.description")}
					</DialogDescription>
				</DialogHeader>
				<div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
					{t("globalEditor.conflict.mergeDescription")}
				</div>
				<DialogFooter className="sm:flex-wrap">
					<Button variant="ghost" disabled={loading} onClick={onCancel}>
						{t("cancel")}
					</Button>
					<Button variant="outline" disabled={loading} onClick={onUseLatest}>
						{t("globalEditor.conflict.useLatest")}
					</Button>
					<Button variant="secondary" disabled={loading} onClick={onMerge}>
						{t("globalEditor.conflict.merge")}
					</Button>
					<Button variant="destructive" disabled={loading} onClick={onOverwrite}>
						{t("globalEditor.conflict.overwrite")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
})
