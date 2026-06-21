import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Check, FolderClosed, Plus, Trash2, X, AlertTriangle } from "lucide-react"
import { Button } from "@/components/shadcn-ui/button"
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/shadcn-ui/dialog"
import { Input } from "@/components/shadcn-ui/input"
import { ScrollArea } from "@/components/shadcn-ui/scroll-area"
import { toast } from "sonner"
import type { AudioRecordingGroup } from "@/services/audioRecordings"
import { resolveRecordingGroupDisplayName } from "@/services/audioRecordings/resolveRecordingGroupDisplayName"

interface AudioRecordingGroupManageDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	groups: AudioRecordingGroup[]
	onCreateGroup: (name: string) => Promise<void>
	onRenameGroup: (id: string, name: string) => Promise<void>
	onDeleteGroup: (id: string) => Promise<void>
	isSubmitting?: boolean
}

/** Component representing the unified group settings modal (Create, Edit, Delete) */
export function AudioRecordingGroupManageDialog({
	open,
	onOpenChange,
	groups,
	onCreateGroup,
	onRenameGroup,
	onDeleteGroup,
	isSubmitting = false,
}: AudioRecordingGroupManageDialogProps) {
	const { t } = useTranslation(["super", "audioRecordings"])
	const [newGroupName, setNewGroupName] = useState("")
	const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
	const [editingName, setEditingName] = useState("")
	const [deleteConfirmGroupId, setDeleteConfirmGroupId] = useState<string | null>(null)

	// Clean up inputs on reopen
	useEffect(() => {
		if (open) {
			setNewGroupName("")
			setEditingGroupId(null)
			setEditingName("")
			setDeleteConfirmGroupId(null)
		}
	}, [open])

	const handleCreate = async () => {
		const name = newGroupName.trim()
		if (!name) return
		try {
			await onCreateGroup(name)
			setNewGroupName("")
			toast.success(t("super:mobile.recordingEntry.groupSheet.createSuccess"))
		} catch {
			toast.error(t("super:mobile.recordingEntry.groupSheet.createFailed"))
		}
	}

	const handleStartEdit = (group: AudioRecordingGroup) => {
		setEditingGroupId(group.id)
		setEditingName(group.name)
	}

	const handleSaveEdit = async (id: string) => {
		const name = editingName.trim()
		if (!name) return
		try {
			await onRenameGroup(id, name)
			setEditingGroupId(null)
			toast.success(t("audioRecordings:actions.renameSuccess"))
		} catch {
			toast.error(t("audioRecordings:actions.renameFailed"))
		}
	}

	const handleDelete = async (id: string) => {
		try {
			await onDeleteGroup(id)
			setDeleteConfirmGroupId(null)
			toast.success(t("audioRecordings:actions.deleteSuccess"))
		} catch {
			toast.error(t("audioRecordings:actions.deleteFailed"))
		}
	}

	return (
		<>
			<Dialog open={open} onOpenChange={onOpenChange}>
				<DialogContent
					className="sm:max-w-[480px]"
					data-testid="audio-recording-group-manage-dialog"
				>
					<DialogHeader>
						<DialogTitle>
							{t("super:mobile.recordingEntry.groupSheet.manageTitle")}
						</DialogTitle>
					</DialogHeader>

					{/* Create new group section */}
					<div className="flex items-center gap-2 border-b pb-4">
						<Input
							maxLength={50}
							value={newGroupName}
							placeholder={t(
								"super:mobile.recordingEntry.groupSheet.groupNamePlaceholder",
							)}
							onChange={(e) => setNewGroupName(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") void handleCreate()
							}}
							className="h-9 flex-1"
							data-testid="audio-recording-group-create-input"
						/>
						<Button
							type="button"
							size="sm"
							onClick={handleCreate}
							disabled={isSubmitting || !newGroupName.trim()}
							className="h-9 gap-1"
							data-testid="audio-recording-group-create-btn"
						>
							<Plus className="h-4 w-4" />
							{t("audioRecordings:actions.confirm")}
						</Button>
					</div>

					{/* Group list scroll area */}
					<ScrollArea className="max-h-[300px] pr-4">
						<div className="flex flex-col gap-1.5 py-2">
							{groups.length === 0 ? (
								<p className="py-6 text-center text-xs text-muted-foreground">
									{t("audioRecordings:empty.noCustomGroups")}
								</p>
							) : (
								groups.map((group) => {
									const isEditing = editingGroupId === group.id
									return (
										<div
											key={group.id}
											className="flex h-10 items-center justify-between gap-3 rounded-lg px-2 hover:bg-muted/40"
											data-testid={`group-item-${group.id}`}
										>
											<div className="flex flex-1 items-center gap-2">
												<FolderClosed className="h-4 w-4 text-muted-foreground" />
												{isEditing ? (
													<Input
														maxLength={50}
														value={editingName}
														onChange={(e) =>
															setEditingName(e.target.value)
														}
														onKeyDown={(e) => {
															if (e.key === "Enter")
																void handleSaveEdit(group.id)
														}}
														className="h-8 flex-1 py-1 text-sm"
														autoFocus
													/>
												) : (
													<span className="max-w-[260px] truncate text-sm font-medium text-foreground">
														{resolveRecordingGroupDisplayName(
															group.name,
															t(
																"super:mobile.recordingEntry.groupSheet.unnamedGroup",
															),
														)}
													</span>
												)}
											</div>

											{/* Action button row */}
											<div className="flex items-center gap-1.5">
												{isEditing ? (
													<>
														<Button
															variant="ghost"
															size="icon"
															className="h-7 w-7 text-primary"
															onClick={() =>
																void handleSaveEdit(group.id)
															}
														>
															<Check className="h-4 w-4" />
														</Button>
														<Button
															variant="ghost"
															size="icon"
															className="h-7 w-7 text-muted-foreground"
															onClick={() => setEditingGroupId(null)}
														>
															<X className="h-4 w-4" />
														</Button>
													</>
												) : (
													<>
														<Button
															variant="ghost"
															size="sm"
															className="h-7 px-2 text-xs font-normal"
															onClick={() => handleStartEdit(group)}
														>
															{t(
																"super:mobile.recordingEntry.moreSheet.rename",
															)}
														</Button>
														<Button
															variant="ghost"
															size="icon"
															className="h-7 w-7 text-destructive hover:text-destructive"
															onClick={() =>
																setDeleteConfirmGroupId(group.id)
															}
														>
															<Trash2 className="h-4 w-4" />
														</Button>
													</>
												)}
											</div>
										</div>
									)
								})
							)}
						</div>
					</ScrollArea>
				</DialogContent>
			</Dialog>

			{/* Delete double-confirmation Dialog */}
			<Dialog
				open={deleteConfirmGroupId != null}
				onOpenChange={(open) => {
					if (!open) setDeleteConfirmGroupId(null)
				}}
			>
				<DialogContent className="sm:max-w-[400px]">
					<DialogHeader>
						<div className="flex items-center gap-2 font-semibold text-destructive">
							<AlertTriangle className="h-5 w-5" />
							<span>{t("super:mobile.recordingEntry.groupSheet.deleteTitle")}</span>
						</div>
					</DialogHeader>
					<div className="py-2 text-sm text-muted-foreground">
						{t("super:mobile.recordingEntry.groupSheet.deleteConfirm")}
					</div>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setDeleteConfirmGroupId(null)}
							disabled={isSubmitting}
						>
							{t("audioRecordings:actions.cancel")}
						</Button>
						<Button
							variant="destructive"
							onClick={() =>
								deleteConfirmGroupId && void handleDelete(deleteConfirmGroupId)
							}
							disabled={isSubmitting}
						>
							{t("audioRecordings:actions.confirm")}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	)
}

interface AudioRecordingMoveGroupDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	groups: AudioRecordingGroup[]
	selectedGroupId: string
	onSelect: (groupId: string) => Promise<void>
	isSubmitting?: boolean
}

/** Component modal allowing user to re-locate a project under a customized folder */
export function AudioRecordingMoveGroupDialog({
	open,
	onOpenChange,
	groups,
	selectedGroupId,
	onSelect,
	isSubmitting = false,
}: AudioRecordingMoveGroupDialogProps) {
	const { t } = useTranslation(["super", "audioRecordings"])
	const [activeGroupId, setActiveGroupId] = useState(selectedGroupId)

	useEffect(() => {
		if (open) {
			setActiveGroupId(selectedGroupId)
		}
	}, [open, selectedGroupId])

	const handleConfirm = async () => {
		try {
			await onSelect(activeGroupId)
			onOpenChange(false)
		} catch {
			// Toast handled on outer container level
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				className="sm:max-w-[420px]"
				data-testid="audio-recording-move-group-dialog"
			>
				<DialogHeader>
					<DialogTitle>
						{t("super:mobile.recordingEntry.moveGroupSheet.title")}
					</DialogTitle>
				</DialogHeader>

				<ScrollArea className="my-2 max-h-[260px] rounded-lg border pr-2">
					<div className="flex flex-col p-1">
						{/* Virtual Ungrouped Item */}
						<button
							type="button"
							onClick={() => setActiveGroupId("ungrouped")}
							className={`flex h-9 w-full items-center justify-between rounded-md px-3 text-sm transition-colors hover:bg-muted/50 ${
								activeGroupId === "ungrouped"
									? "bg-muted font-medium text-foreground"
									: "text-muted-foreground"
							}`}
						>
							<span>{t("super:mobile.recordingEntry.groupSheet.ungrouped")}</span>
							{activeGroupId === "ungrouped" && (
								<Check className="h-4 w-4 text-primary" />
							)}
						</button>

						{/* Customized Real Groups */}
						{groups.map((group) => (
							<button
								key={group.id}
								type="button"
								onClick={() => setActiveGroupId(group.id)}
								className={`flex h-9 w-full items-center justify-between rounded-md px-3 text-sm transition-colors hover:bg-muted/50 ${
									activeGroupId === group.id
										? "bg-muted font-medium text-foreground"
										: "text-muted-foreground"
								}`}
							>
								<span className="max-w-[280px] truncate">
									{resolveRecordingGroupDisplayName(
										group.name,
										t("super:mobile.recordingEntry.groupSheet.unnamedGroup"),
									)}
								</span>
								{activeGroupId === group.id && (
									<Check className="h-4 w-4 text-primary" />
								)}
							</button>
						))}
					</div>
				</ScrollArea>

				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={isSubmitting}
					>
						{t("audioRecordings:actions.cancel")}
					</Button>
					<Button onClick={() => void handleConfirm()} disabled={isSubmitting}>
						{isSubmitting
							? t("audioRecordings:actions.submitting")
							: t("audioRecordings:actions.confirm")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
