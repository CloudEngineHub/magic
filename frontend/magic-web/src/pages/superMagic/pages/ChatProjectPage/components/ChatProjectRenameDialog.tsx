import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import magicToast from "@/components/base/MagicToaster/utils"
import { Button } from "@/components/shadcn-ui/button"
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/shadcn-ui/dialog"
import { Input } from "@/components/shadcn-ui/input"
import SuperMagicService from "@/pages/superMagic/services"
import type { ProjectListItem, Topic } from "@/pages/superMagic/pages/Workspace/types"
import { shouldSuppressInputAutoFocusInMagicApp } from "@/utils/inputFocusPolicy"

interface ChatProjectRenameDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	project: ProjectListItem | null
	/** Keep topic title in sync when renaming the active chat conversation. */
	selectedTopic?: Topic | null
	onRenamed?: () => Promise<void> | void
}

/**
 * Desktop rename dialog for chat projects; mirrors WorkspaceRenameDialog interaction.
 */
export function ChatProjectRenameDialog({
	open,
	onOpenChange,
	project,
	selectedTopic,
	onRenamed,
}: ChatProjectRenameDialogProps) {
	const { t } = useTranslation("super")
	const [renameLoading, setRenameLoading] = useState(false)
	const [projectNameInput, setProjectNameInput] = useState("")
	const shouldAutoFocusInput = !shouldSuppressInputAutoFocusInMagicApp()

	useEffect(() => {
		if (open && project) {
			setProjectNameInput(project.project_name || "")
		}
	}, [open, project])

	/** Persist the edited chat title and optionally sync the active topic name. */
	async function handleRenameProject() {
		if (!project?.id || !project.workspace_id) return

		const nextName = projectNameInput.trim()
		if (!nextName || nextName === project.project_name) {
			onOpenChange(false)
			return
		}

		setRenameLoading(true)
		try {
			await SuperMagicService.project.renameProject(
				project.id,
				nextName,
				project.workspace_id,
				selectedTopic?.project_id === project.id
					? { topicId: selectedTopic.id }
					: undefined,
			)
			magicToast.success(t("chat.renameChatSuccess"))
			await onRenamed?.()
			onOpenChange(false)
		} catch (error) {
			console.log("Failed to rename chat project:", error)
		} finally {
			setRenameLoading(false)
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				className="sm:max-w-[425px]"
				data-testid="chat-project-rename-dialog"
				onOpenAutoFocus={(event) => {
					if (!shouldAutoFocusInput) {
						// Radix focuses the first field by default; block it in Magic App WebView.
						event.preventDefault()
					}
				}}
				onCloseAutoFocus={(event) => {
					event.preventDefault()
				}}
			>
				<DialogHeader>
					<DialogTitle>{t("chat.renameChat")}</DialogTitle>
				</DialogHeader>
				<div className="flex flex-col gap-2">
					<span className="text-sm text-muted-foreground">
						{t("chat.chatNameFieldLabel")}
					</span>
					<Input
						// Keep desktop rename efficient while avoiding iPad WebView keyboard occlusion.
						autoFocus={shouldAutoFocusInput}
						maxLength={100}
						value={projectNameInput}
						placeholder={t("chat.inputChatName")}
						onChange={(event) => setProjectNameInput(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter") {
								void handleRenameProject()
							}
						}}
						data-testid="chat-project-rename-input"
					/>
				</div>
				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						{t("common.cancel")}
					</Button>
					<Button
						onClick={() => void handleRenameProject()}
						disabled={renameLoading || !projectNameInput.trim()}
						data-testid="chat-project-rename-confirm"
					>
						{renameLoading ? t("common.loading") : t("common.confirm")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
