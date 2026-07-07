import { useCallback, useEffect, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Check, MoreHorizontal, Plus, AlertTriangle } from "lucide-react"
import { Button } from "@/components/shadcn-ui/button"
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/shadcn-ui/dialog"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/shadcn-ui/dropdown-menu"
import { Input } from "@/components/shadcn-ui/input"
import { ScrollArea } from "@/components/shadcn-ui/scroll-area"
import { toast } from "sonner"
import type { AudioRecordingGroup } from "@/services/audioRecordings"
import { UNGROUPED_RECORDING_GROUP_ID } from "@/services/audioRecordings/RecordingGroupsConstants"
import { resolveRecordingGroupDisplayName } from "@/services/audioRecordings/resolveRecordingGroupDisplayName"

type GroupNameDialogMode = "create" | "rename" | null

interface RecordingGroupCrudHandlers {
	onCreateGroup: (name: string) => Promise<AudioRecordingGroup | void>
	onRenameGroup: (id: string, name: string) => Promise<void>
	onDeleteGroup: (id: string) => Promise<void>
}

interface UseRecordingGroupCrudStateOptions extends RecordingGroupCrudHandlers {
	open: boolean
	isSubmitting?: boolean
	onCreated?: (group: AudioRecordingGroup) => void
	onDeleted?: (id: string) => void
}

/** Shared CRUD state: name dialog for create/rename, separate dialog for delete confirm */
function useRecordingGroupCrudState({
	open,
	onCreateGroup,
	onRenameGroup,
	onDeleteGroup,
	isSubmitting = false,
	onCreated,
	onDeleted,
}: UseRecordingGroupCrudStateOptions) {
	const { t } = useTranslation(["super", "audioRecordings"])
	const [nameDialogMode, setNameDialogMode] = useState<GroupNameDialogMode>(null)
	const [draftName, setDraftName] = useState("")
	const [activeGroup, setActiveGroup] = useState<AudioRecordingGroup | null>(null)
	const [deleteConfirmGroup, setDeleteConfirmGroup] = useState<AudioRecordingGroup | null>(null)

	useEffect(() => {
		if (!open) return
		setNameDialogMode(null)
		setDraftName("")
		setActiveGroup(null)
		setDeleteConfirmGroup(null)
	}, [open])

	const openCreateDialog = useCallback(() => {
		setDraftName("")
		setActiveGroup(null)
		setNameDialogMode("create")
	}, [])

	const openRenameDialog = useCallback((group: AudioRecordingGroup) => {
		setActiveGroup(group)
		setDraftName(group.name)
		setNameDialogMode("rename")
	}, [])

	const closeNameDialog = useCallback(() => {
		setNameDialogMode(null)
		setDraftName("")
		setActiveGroup(null)
	}, [])

	const handleNameDialogConfirm = useCallback(async () => {
		const name = draftName.trim()
		if (!name) return

		try {
			if (nameDialogMode === "create") {
				const created = await onCreateGroup(name)
				toast.success(t("super:mobile.recordingEntry.groupSheet.createSuccess"))
				if (created) onCreated?.(created)
			} else if (nameDialogMode === "rename" && activeGroup) {
				await onRenameGroup(activeGroup.id, name)
				toast.success(t("audioRecordings:actions.renameSuccess"))
			}
			closeNameDialog()
		} catch {
			if (nameDialogMode === "create") {
				toast.error(t("super:mobile.recordingEntry.groupSheet.createFailed"))
			} else {
				toast.error(t("audioRecordings:actions.renameFailed"))
			}
		}
	}, [
		activeGroup,
		closeNameDialog,
		draftName,
		nameDialogMode,
		onCreateGroup,
		onCreated,
		onRenameGroup,
		t,
	])

	const handleDelete = useCallback(async () => {
		if (!deleteConfirmGroup) return
		try {
			await onDeleteGroup(deleteConfirmGroup.id)
			toast.success(t("audioRecordings:actions.deleteSuccess"))
			onDeleted?.(deleteConfirmGroup.id)
			setDeleteConfirmGroup(null)
		} catch {
			toast.error(t("audioRecordings:actions.deleteFailed"))
		}
	}, [deleteConfirmGroup, onDeleteGroup, onDeleted, t])

	return {
		nameDialogMode,
		draftName,
		setDraftName,
		deleteConfirmGroup,
		setDeleteConfirmGroup,
		isSubmitting,
		openCreateDialog,
		openRenameDialog,
		closeNameDialog,
		handleNameDialogConfirm,
		handleDelete,
	}
}

interface RecordingGroupNameDialogProps {
	mode: GroupNameDialogMode
	draftName: string
	onDraftNameChange: (value: string) => void
	onOpenChange: (open: boolean) => void
	onConfirm: () => void
	isSubmitting?: boolean
	createTitle: string
	renameTitle: string
	nameLabel: string
	placeholder: string
	cancelLabel: string
	confirmLabel: string
}

/** Modal for creating or renaming a group (mirrors mobile create/rename sheet views) */
function RecordingGroupNameDialog({
	mode,
	draftName,
	onDraftNameChange,
	onOpenChange,
	onConfirm,
	isSubmitting = false,
	createTitle,
	renameTitle,
	nameLabel,
	placeholder,
	cancelLabel,
	confirmLabel,
}: RecordingGroupNameDialogProps) {
	return (
		<Dialog open={mode != null} onOpenChange={onOpenChange}>
			<DialogContent
				className="sm:max-w-[400px]"
				data-testid="audio-recording-group-name-dialog"
			>
				<DialogHeader>
					<DialogTitle>{mode === "create" ? createTitle : renameTitle}</DialogTitle>
				</DialogHeader>
				<div className="flex flex-col gap-2">
					<p className="text-sm text-muted-foreground">{nameLabel}</p>
					<Input
						maxLength={50}
						value={draftName}
						onChange={(e) => onDraftNameChange(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") void onConfirm()
						}}
						placeholder={placeholder}
						autoFocus
						disabled={isSubmitting}
						data-testid="audio-recording-group-name-input"
					/>
				</div>
				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={isSubmitting}
					>
						{cancelLabel}
					</Button>
					<Button
						onClick={() => void onConfirm()}
						disabled={isSubmitting || !draftName.trim()}
						data-testid="audio-recording-group-name-confirm-btn"
					>
						{confirmLabel}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

interface RecordingGroupDeleteConfirmDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	onConfirm: () => void
	isSubmitting?: boolean
	cancelLabel: string
	confirmLabel: string
	deleteTitle: string
	deleteConfirm: string
}

/** Delete confirmation dialog for group management flows */
function RecordingGroupDeleteConfirmDialog({
	open,
	onOpenChange,
	onConfirm,
	isSubmitting = false,
	cancelLabel,
	confirmLabel,
	deleteTitle,
	deleteConfirm,
}: RecordingGroupDeleteConfirmDialogProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				className="sm:max-w-[400px]"
				data-testid="audio-recording-group-delete-dialog"
			>
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2 font-semibold text-destructive">
						<AlertTriangle className="h-5 w-5" />
						<span>{deleteTitle}</span>
					</DialogTitle>
				</DialogHeader>
				<div className="py-2 text-sm text-muted-foreground">{deleteConfirm}</div>
				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={isSubmitting}
					>
						{cancelLabel}
					</Button>
					<Button
						variant="destructive"
						onClick={() => void onConfirm()}
						disabled={isSubmitting}
						data-testid="audio-recording-group-delete-confirm-btn"
					>
						{confirmLabel}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

interface RecordingGroupListRowProps {
	label: string
	count?: number
	selected?: boolean
	onSelect?: () => void
	onRename?: () => void
	onDelete?: () => void
	showMoreActions?: boolean
	renameLabel: string
	deleteLabel: string
	moreAriaLabel?: string
	dataTestId?: string
	moreTestId?: string
}

/**
 * Mobile-aligned row: leading check slot, inline count, trailing more-menu for CRUD.
 */
function RecordingGroupListRow({
	label,
	count,
	selected = false,
	onSelect,
	onRename,
	onDelete,
	showMoreActions = false,
	renameLabel,
	deleteLabel,
	moreAriaLabel,
	dataTestId,
	moreTestId,
}: RecordingGroupListRowProps) {
	const hasMoreMenu = showMoreActions && onRename && onDelete

	return (
		<div
			className="flex h-10 w-full min-w-0 items-center overflow-hidden"
			data-testid={dataTestId}
		>
			<button
				type="button"
				onClick={onSelect}
				disabled={!onSelect}
				// Radix Dialog auto-focuses the first tabbable row on open; suppress ring, keep subtle bg for keyboard users.
				className={`flex h-full min-w-0 flex-1 items-center gap-2 overflow-hidden bg-transparent pl-3 pr-2 text-left outline-none transition-colors focus:outline-none focus-visible:bg-accent/40 focus-visible:outline-none focus-visible:ring-0 ${
					onSelect ? "cursor-pointer hover:opacity-80" : "cursor-default"
				}`}
			>
				<span
					className="flex size-4 shrink-0 items-center justify-center"
					aria-hidden="true"
				>
					{selected ? <Check className="size-4 text-primary" strokeWidth={2.5} /> : null}
				</span>
				<span className="min-w-0 flex-1 truncate text-sm text-foreground" title={label}>
					{label}
				</span>
				{count != null ? (
					<span className="shrink-0 text-xs tabular-nums text-muted-foreground">
						{count}
					</span>
				) : null}
			</button>

			{hasMoreMenu ? (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							type="button"
							variant="ghost"
							size="icon"
							className="mr-1 size-8 shrink-0 text-muted-foreground"
							data-testid={moreTestId}
							aria-label={moreAriaLabel}
							onClick={(event) => event.stopPropagation()}
						>
							<MoreHorizontal className="size-4" strokeWidth={2} />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="min-w-[120px]">
						<DropdownMenuItem
							data-testid="audio-recording-group-rename-menu-item"
							onClick={onRename}
						>
							{renameLabel}
						</DropdownMenuItem>
						<DropdownMenuItem
							variant="destructive"
							data-testid="audio-recording-group-delete-menu-item"
							onClick={onDelete}
						>
							{deleteLabel}
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			) : (
				<span className="mr-1 size-8 shrink-0" aria-hidden="true" />
			)}
		</div>
	)
}

interface RecordingGroupBorderedListProps {
	children: ReactNode
	emptyMessage?: string
	isEmpty?: boolean
}

/** Bordered card list container aligned with mobile group sheet */
function RecordingGroupBorderedList({
	children,
	emptyMessage,
	isEmpty = false,
}: RecordingGroupBorderedListProps) {
	return (
		<ScrollArea
			className="my-2 max-h-[min(280px,50vh)] w-full min-w-0 overflow-hidden rounded-lg border bg-card pr-2 shadow-sm [&_[data-slot='scroll-area-viewport']>div]:!block [&_[data-slot='scroll-area-viewport']>div]:!w-full [&_[data-slot='scroll-area-viewport']>div]:!min-w-0"
			viewportClassName="focus-visible:outline-none focus-visible:ring-0"
			data-testid="audio-recording-group-bordered-list"
		>
			<div className="flex w-full min-w-0 flex-col overflow-hidden">
				{isEmpty && emptyMessage ? (
					<p className="py-8 text-center text-xs text-muted-foreground">{emptyMessage}</p>
				) : (
					children
				)}
			</div>
		</ScrollArea>
	)
}

/** Renders a divider between group rows inside the bordered list */
function RecordingGroupRowDivider() {
	return <div className="h-px w-full bg-border" />
}

interface RecordingGroupDialogFooterProps {
	newGroupLabel: string
	onNewGroup: () => void
	isSubmitting?: boolean
	showNewGroup?: boolean
	children?: ReactNode
}

/** Footer with new-group action pinned to the left; optional right-side actions */
function RecordingGroupDialogFooter({
	newGroupLabel,
	onNewGroup,
	isSubmitting = false,
	showNewGroup = true,
	children,
}: RecordingGroupDialogFooterProps) {
	return (
		<DialogFooter className="flex-row items-center justify-between gap-2 sm:justify-between">
			{showNewGroup ? (
				<Button
					type="button"
					variant="outline"
					className="gap-1.5"
					onClick={onNewGroup}
					disabled={isSubmitting}
					data-testid="audio-recording-group-create-trigger"
				>
					<Plus className="size-4" />
					{newGroupLabel}
				</Button>
			) : (
				<span />
			)}
			{children ? <div className="flex items-center gap-2">{children}</div> : null}
		</DialogFooter>
	)
}

interface AudioRecordingGroupManageDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	groups: AudioRecordingGroup[]
	onCreateGroup: (name: string) => Promise<AudioRecordingGroup | void>
	onRenameGroup: (id: string, name: string) => Promise<void>
	onDeleteGroup: (id: string) => Promise<void>
	isSubmitting?: boolean
}

/** Manage dialog for creating, renaming, and deleting custom recording groups */
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
	const unnamedGroupLabel = t("super:mobile.recordingEntry.groupSheet.unnamedGroup")
	const crud = useRecordingGroupCrudState({
		open,
		onCreateGroup,
		onRenameGroup,
		onDeleteGroup,
		isSubmitting,
	})

	const deleteConfirmMessage = crud.deleteConfirmGroup
		? t("super:mobile.recordingEntry.groupSheet.deleteConfirm", {
				name: resolveRecordingGroupDisplayName(
					crud.deleteConfirmGroup.name,
					unnamedGroupLabel,
				),
			})
		: t("super:mobile.recordingEntry.groupSheet.deleteConfirm")

	return (
		<>
			<Dialog open={open} onOpenChange={onOpenChange}>
				<DialogContent
					className="sm:max-w-[420px]"
					data-testid="audio-recording-group-manage-dialog"
				>
					<DialogHeader>
						<DialogTitle>
							{t("super:mobile.recordingEntry.groupSheet.manageTitle")}
						</DialogTitle>
					</DialogHeader>

					<RecordingGroupBorderedList
						isEmpty={groups.length === 0}
						emptyMessage={t("audioRecordings:empty.noCustomGroups")}
					>
						{groups.map((group, index) => (
							<div key={group.id}>
								{index > 0 ? <RecordingGroupRowDivider /> : null}
								<RecordingGroupListRow
									label={resolveRecordingGroupDisplayName(
										group.name,
										unnamedGroupLabel,
									)}
									count={group.projectCount}
									onRename={() => crud.openRenameDialog(group)}
									onDelete={() => crud.setDeleteConfirmGroup(group)}
									showMoreActions
									renameLabel={t("super:mobile.recordingEntry.groupSheet.rename")}
									deleteLabel={t(
										"super:mobile.recordingEntry.groupSheet.deleteGroup",
									)}
									moreAriaLabel={t(
										"super:mobile.recordingEntry.groupSheet.moreGroupAria",
										{
											name: resolveRecordingGroupDisplayName(
												group.name,
												unnamedGroupLabel,
											),
										},
									)}
									moreTestId={`audio-recording-group-more-${group.id}`}
									dataTestId={`group-item-${group.id}`}
								/>
							</div>
						))}
					</RecordingGroupBorderedList>

					<RecordingGroupDialogFooter
						newGroupLabel={t("super:mobile.recordingEntry.groupSheet.newGroup")}
						onNewGroup={crud.openCreateDialog}
						isSubmitting={crud.isSubmitting}
					/>
				</DialogContent>
			</Dialog>

			<RecordingGroupNameDialog
				mode={crud.nameDialogMode}
				draftName={crud.draftName}
				onDraftNameChange={crud.setDraftName}
				onOpenChange={(nextOpen) => {
					if (!nextOpen) crud.closeNameDialog()
				}}
				onConfirm={crud.handleNameDialogConfirm}
				isSubmitting={crud.isSubmitting}
				createTitle={t("super:mobile.recordingEntry.groupSheet.createTitle")}
				renameTitle={t("super:mobile.recordingEntry.groupSheet.renameTitle")}
				nameLabel={
					crud.nameDialogMode === "rename"
						? t("super:mobile.recordingEntry.groupSheet.renameLabel")
						: t("super:mobile.recordingEntry.groupSheet.groupNameLabel")
				}
				placeholder={
					crud.nameDialogMode === "rename"
						? t("super:mobile.recordingEntry.groupSheet.renamePlaceholder")
						: t("super:mobile.recordingEntry.groupSheet.groupNamePlaceholder")
				}
				cancelLabel={t("audioRecordings:actions.cancel")}
				confirmLabel={t("audioRecordings:actions.confirm")}
			/>

			<RecordingGroupDeleteConfirmDialog
				open={crud.deleteConfirmGroup != null}
				onOpenChange={(nextOpen) => {
					if (!nextOpen) crud.setDeleteConfirmGroup(null)
				}}
				onConfirm={() => void crud.handleDelete()}
				isSubmitting={crud.isSubmitting}
				cancelLabel={t("audioRecordings:actions.cancel")}
				confirmLabel={t("audioRecordings:actions.confirm")}
				deleteTitle={t("super:mobile.recordingEntry.groupSheet.deleteTitle")}
				deleteConfirm={deleteConfirmMessage}
			/>
		</>
	)
}

interface AudioRecordingMoveGroupDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	groups: AudioRecordingGroup[]
	selectedGroupId: string
	ungroupedCount?: number
	onSelect: (groupId: string) => Promise<void>
	onCreateGroup?: (name: string) => Promise<AudioRecordingGroup | void>
	onRenameGroup?: (id: string, name: string) => Promise<void>
	onDeleteGroup?: (id: string) => Promise<void>
	isSubmitting?: boolean
}

/** Move-target dialog with mobile-aligned list and footer new-group action */
export function AudioRecordingMoveGroupDialog({
	open,
	onOpenChange,
	groups,
	selectedGroupId,
	ungroupedCount,
	onSelect,
	onCreateGroup,
	onRenameGroup,
	onDeleteGroup,
	isSubmitting = false,
}: AudioRecordingMoveGroupDialogProps) {
	const { t } = useTranslation(["super", "audioRecordings"])
	const unnamedGroupLabel = t("super:mobile.recordingEntry.groupSheet.unnamedGroup")
	const [activeGroupId, setActiveGroupId] = useState(selectedGroupId)
	const canManageGroups = Boolean(onCreateGroup && onRenameGroup && onDeleteGroup)

	useEffect(() => {
		if (!open) return
		setActiveGroupId(selectedGroupId)
	}, [open, selectedGroupId])

	const crud = useRecordingGroupCrudState({
		open,
		onCreateGroup: onCreateGroup ?? (async () => undefined),
		onRenameGroup: onRenameGroup ?? (async () => undefined),
		onDeleteGroup: onDeleteGroup ?? (async () => undefined),
		isSubmitting,
		onCreated: (group) => setActiveGroupId(group.id),
		onDeleted: (id) => {
			setActiveGroupId((current) => (current === id ? UNGROUPED_RECORDING_GROUP_ID : current))
		},
	})

	const handleConfirm = async () => {
		try {
			await onSelect(activeGroupId)
			onOpenChange(false)
		} catch {
			// Toast handled on outer container level
		}
	}

	const deleteConfirmMessage = crud.deleteConfirmGroup
		? t("super:mobile.recordingEntry.groupSheet.deleteConfirm", {
				name: resolveRecordingGroupDisplayName(
					crud.deleteConfirmGroup.name,
					unnamedGroupLabel,
				),
			})
		: t("super:mobile.recordingEntry.groupSheet.deleteConfirm")

	return (
		<>
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

					<RecordingGroupBorderedList>
						<RecordingGroupListRow
							label={t("super:mobile.recordingEntry.groupSheet.ungrouped")}
							count={ungroupedCount}
							selected={activeGroupId === UNGROUPED_RECORDING_GROUP_ID}
							onSelect={() => setActiveGroupId(UNGROUPED_RECORDING_GROUP_ID)}
							renameLabel={t("super:mobile.recordingEntry.groupSheet.rename")}
							deleteLabel={t("super:mobile.recordingEntry.groupSheet.deleteGroup")}
							dataTestId="audio-recording-move-group-option-ungrouped"
						/>

						{groups.map((group) => (
							<div key={group.id}>
								<RecordingGroupRowDivider />
								<RecordingGroupListRow
									label={resolveRecordingGroupDisplayName(
										group.name,
										unnamedGroupLabel,
									)}
									count={group.projectCount}
									selected={activeGroupId === group.id}
									onSelect={() => setActiveGroupId(group.id)}
									onRename={
										canManageGroups
											? () => crud.openRenameDialog(group)
											: undefined
									}
									onDelete={
										canManageGroups
											? () => crud.setDeleteConfirmGroup(group)
											: undefined
									}
									showMoreActions={canManageGroups}
									renameLabel={t("super:mobile.recordingEntry.groupSheet.rename")}
									deleteLabel={t(
										"super:mobile.recordingEntry.groupSheet.deleteGroup",
									)}
									moreAriaLabel={t(
										"super:mobile.recordingEntry.groupSheet.moreGroupAria",
										{
											name: resolveRecordingGroupDisplayName(
												group.name,
												unnamedGroupLabel,
											),
										},
									)}
									moreTestId={`audio-recording-group-more-${group.id}`}
									dataTestId={`audio-recording-move-group-option-${group.id}`}
								/>
							</div>
						))}
					</RecordingGroupBorderedList>

					<RecordingGroupDialogFooter
						newGroupLabel={t("super:mobile.recordingEntry.groupSheet.newGroup")}
						onNewGroup={crud.openCreateDialog}
						isSubmitting={isSubmitting}
						showNewGroup={canManageGroups}
					>
						<Button
							variant="outline"
							onClick={() => onOpenChange(false)}
							disabled={isSubmitting}
						>
							{t("audioRecordings:actions.cancel")}
						</Button>
						<Button
							onClick={() => void handleConfirm()}
							disabled={isSubmitting}
							data-testid="audio-recording-move-group-confirm-btn"
						>
							{isSubmitting
								? t("audioRecordings:actions.submitting")
								: t("audioRecordings:actions.confirm")}
						</Button>
					</RecordingGroupDialogFooter>
				</DialogContent>
			</Dialog>

			{canManageGroups ? (
				<>
					<RecordingGroupNameDialog
						mode={crud.nameDialogMode}
						draftName={crud.draftName}
						onDraftNameChange={crud.setDraftName}
						onOpenChange={(nextOpen) => {
							if (!nextOpen) crud.closeNameDialog()
						}}
						onConfirm={crud.handleNameDialogConfirm}
						isSubmitting={crud.isSubmitting}
						createTitle={t("super:mobile.recordingEntry.groupSheet.createTitle")}
						renameTitle={t("super:mobile.recordingEntry.groupSheet.renameTitle")}
						nameLabel={
							crud.nameDialogMode === "rename"
								? t("super:mobile.recordingEntry.groupSheet.renameLabel")
								: t("super:mobile.recordingEntry.groupSheet.groupNameLabel")
						}
						placeholder={
							crud.nameDialogMode === "rename"
								? t("super:mobile.recordingEntry.groupSheet.renamePlaceholder")
								: t("super:mobile.recordingEntry.groupSheet.groupNamePlaceholder")
						}
						cancelLabel={t("audioRecordings:actions.cancel")}
						confirmLabel={t("audioRecordings:actions.confirm")}
					/>

					<RecordingGroupDeleteConfirmDialog
						open={crud.deleteConfirmGroup != null}
						onOpenChange={(nextOpen) => {
							if (!nextOpen) crud.setDeleteConfirmGroup(null)
						}}
						onConfirm={() => void crud.handleDelete()}
						isSubmitting={crud.isSubmitting}
						cancelLabel={t("audioRecordings:actions.cancel")}
						confirmLabel={t("audioRecordings:actions.confirm")}
						deleteTitle={t("super:mobile.recordingEntry.groupSheet.deleteTitle")}
						deleteConfirm={deleteConfirmMessage}
					/>
				</>
			) : null}
		</>
	)
}
