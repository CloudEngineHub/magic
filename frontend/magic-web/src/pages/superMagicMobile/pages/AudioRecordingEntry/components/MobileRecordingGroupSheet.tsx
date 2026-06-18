import { useCallback, useState } from "react"
import { Check, ChevronRight, Plus, Settings2, Trash2, X } from "lucide-react"
import { useTranslation } from "react-i18next"
import MagicPopup from "@/components/base-mobile/MagicPopup"
import { Input } from "@/components/shadcn-ui/input"
import {
	ALL_RECORDING_GROUP_ID,
	UNGROUPED_RECORDING_GROUP_ID,
} from "@/services/audioRecordings/RecordingGroupsConstants"
import { resolveRecordingGroupDisplayName } from "@/services/audioRecordings/resolveRecordingGroupDisplayName"

export { ALL_RECORDING_GROUP_ID, UNGROUPED_RECORDING_GROUP_ID }

export interface MobileRecordingGroup {
	id: string
	name: string
	projectCount: number
	isVirtual: boolean
	workspaceType?: string
}

interface MobileRecordingGroupSheetProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	groups: MobileRecordingGroup[]
	selectedGroupId: string
	totalCount: number
	ungroupedCount: number
	onSelect: (groupId: string) => void
	onCreateGroup: (name: string) => Promise<void> | void
	onRenameGroup: (id: string, name: string) => Promise<void> | void
	onDeleteGroup: (id: string) => Promise<void> | void
	isSubmitting?: boolean
}

type GroupSheetView = "menu" | "create" | "manage" | "rename"

/** Single selectable group row shared by menu and move-target sheets */
function GroupRow({
	label,
	count,
	selected,
	dataTestId,
	onClick,
}: {
	label: string
	count: number
	selected?: boolean
	dataTestId: string
	onClick: () => void
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			data-testid={dataTestId}
			className="flex h-12 w-full items-center gap-2 bg-transparent px-[14px] transition-opacity active:opacity-60"
		>
			<span className="flex-1 truncate text-left text-[16px] leading-5 text-foreground">
				{label}
			</span>
			<span className="text-[13px] tabular-nums text-muted-foreground">{count}</span>
			{selected ? <Check className="size-4 shrink-0 text-primary" strokeWidth={2.5} /> : null}
		</button>
	)
}

/** Menu action row with a leading icon and chevron */
function ActionRow({
	icon,
	label,
	dataTestId,
	showDivider,
	onClick,
}: {
	icon: React.ReactNode
	label: string
	dataTestId: string
	showDivider?: boolean
	onClick: () => void
}) {
	return (
		<>
			<button
				type="button"
				onClick={onClick}
				data-testid={dataTestId}
				className="flex h-12 w-full items-center gap-2 bg-transparent px-[14px] transition-opacity active:opacity-60"
			>
				{icon}
				<span className="flex-1 truncate text-left text-[16px] leading-5 text-foreground">
					{label}
				</span>
				<ChevronRight className="size-4 text-muted-foreground" />
			</button>
			{showDivider ? <div className="h-px w-full bg-border" /> : null}
		</>
	)
}

/** Computes the localized title for each internal sheet view */
function resolveGroupSheetTitle(view: GroupSheetView, t: (key: string) => string): string {
	if (view === "create") return t("super:mobile.recordingEntry.groupSheet.createTitle")
	if (view === "manage") return t("super:mobile.recordingEntry.groupSheet.manageTitle")
	if (view === "rename") return t("super:mobile.recordingEntry.groupSheet.renameTitle")
	return t("super:mobile.recordingEntry.groupSheet.title")
}

/**
 * Prototype-aligned group sheet for selecting, creating, renaming, and deleting
 * real audio workspace groups.
 */
export function MobileRecordingGroupSheet({
	open,
	onOpenChange,
	groups = [],
	selectedGroupId,
	totalCount,
	ungroupedCount,
	onSelect,
	onCreateGroup,
	onRenameGroup,
	onDeleteGroup,
	isSubmitting = false,
}: MobileRecordingGroupSheetProps) {
	const { t } = useTranslation(["super", "audioRecordings"])
	const unnamedGroupLabel = t("super:mobile.recordingEntry.groupSheet.unnamedGroup")
	const [view, setView] = useState<GroupSheetView>("menu")
	const [draftName, setDraftName] = useState("")
	const [renamingGroup, setRenamingGroup] = useState<MobileRecordingGroup | null>(null)

	const resetState = useCallback(() => {
		setView("menu")
		setDraftName("")
		setRenamingGroup(null)
	}, [])

	const handleClose = useCallback(() => {
		resetState()
		onOpenChange(false)
	}, [onOpenChange, resetState])

	const handleSelect = useCallback(
		(groupId: string) => {
			onSelect(groupId)
			handleClose()
		},
		[handleClose, onSelect],
	)

	const handleCreateConfirm = useCallback(async () => {
		const name = draftName.trim()
		if (!name) return
		await onCreateGroup(name)
		setDraftName("")
		setView("menu")
	}, [draftName, onCreateGroup])

	const handleRenameConfirm = useCallback(async () => {
		const name = draftName.trim()
		if (!name || !renamingGroup) return
		await onRenameGroup(renamingGroup.id, name)
		setDraftName("")
		setRenamingGroup(null)
		setView("manage")
	}, [draftName, onRenameGroup, renamingGroup])

	const leadingAction = {
		icon: <X />,
		ariaLabel:
			view === "menu"
				? t("super:mobile.recordingEntry.groupSheet.closeAria")
				: t("super:mobile.recordingEntry.groupSheet.backAria"),
		onClick:
			view === "menu" ? handleClose : () => setView(view === "rename" ? "manage" : "menu"),
		testId:
			view === "menu"
				? "mobile-recording-group-sheet-close"
				: "mobile-recording-group-sheet-back",
	}

	const trailingAction =
		view === "create" || view === "rename"
			? {
					icon: <Check />,
					ariaLabel: t("super:mobile.recordingEntry.groupSheet.confirmAria"),
					onClick: () => {
						void (view === "create" ? handleCreateConfirm() : handleRenameConfirm())
					},
					disabled: !draftName.trim() || isSubmitting,
					tone: "primary" as const,
					testId:
						view === "create"
							? "mobile-recording-group-create-confirm"
							: "mobile-recording-group-rename-confirm",
				}
			: undefined

	return (
		<MagicPopup
			visible={open}
			onOpenChange={(nextOpen) => {
				if (!nextOpen) handleClose()
			}}
			onClose={handleClose}
			position="bottom"
			title={resolveGroupSheetTitle(view, t)}
			headerVariant="actionHeader"
			headerTitle={resolveGroupSheetTitle(view, t)}
			headerLeadingAction={leadingAction}
			headerTrailingAction={trailingAction}
			className="max-h-[78vh] gap-0 rounded-t-[14px] border-0 bg-muted p-0"
			bodyClassName="no-scrollbar flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-[14px] py-[10px]"
			style={{ boxShadow: "0 -4px 24px rgba(0,0,0,0.08)" }}
			data-testid="mobile-recording-group-sheet"
		>
			{view === "menu" ? (
				<>
					<div className="w-full shrink-0 overflow-hidden rounded-lg bg-card">
						<GroupRow
							label={t("super:mobile.recordingEntry.groupSheet.all")}
							count={totalCount}
							selected={selectedGroupId === ALL_RECORDING_GROUP_ID}
							dataTestId="mobile-recording-group-option-all"
							onClick={() => handleSelect(ALL_RECORDING_GROUP_ID)}
						/>
						<div className="h-px w-full bg-border" />
						{groups.map((group) => (
							<div key={group.id}>
								<GroupRow
									label={resolveRecordingGroupDisplayName(
										group.name,
										unnamedGroupLabel,
									)}
									count={group.projectCount}
									selected={selectedGroupId === group.id}
									dataTestId="mobile-recording-group-option"
									onClick={() => handleSelect(group.id)}
								/>
								<div className="h-px w-full bg-border" />
							</div>
						))}
						<GroupRow
							label={t("super:mobile.recordingEntry.groupSheet.ungrouped")}
							count={ungroupedCount}
							selected={selectedGroupId === UNGROUPED_RECORDING_GROUP_ID}
							dataTestId="mobile-recording-group-option-ungrouped"
							onClick={() => handleSelect(UNGROUPED_RECORDING_GROUP_ID)}
						/>
					</div>

					<div className="w-full shrink-0 overflow-hidden rounded-lg bg-card">
						<ActionRow
							icon={<Plus className="size-[18px] text-foreground" />}
							label={t("super:mobile.recordingEntry.groupSheet.newGroup")}
							dataTestId="mobile-recording-group-create-trigger"
							showDivider
							onClick={() => {
								setDraftName("")
								setView("create")
							}}
						/>
						<ActionRow
							icon={<Settings2 className="size-[18px] text-foreground" />}
							label={t("super:mobile.recordingEntry.groupSheet.manageGroups")}
							dataTestId="mobile-recording-group-manage-trigger"
							onClick={() => setView("manage")}
						/>
					</div>
				</>
			) : null}

			{view === "create" || view === "rename" ? (
				<div className="flex flex-col gap-2">
					<p className="px-[14px] text-[14px] leading-5 text-muted-foreground">
						{t("super:mobile.recordingEntry.groupSheet.groupNameLabel")}
					</p>
					<div className="w-full shrink-0 overflow-hidden rounded-lg bg-card">
						<Input
							type="text"
							value={draftName}
							onChange={(event) => setDraftName(event.target.value)}
							placeholder={t(
								"super:mobile.recordingEntry.groupSheet.groupNamePlaceholder",
							)}
							autoFocus
							disabled={isSubmitting}
							className="h-12 rounded-none border-0 bg-transparent px-[14px] py-0 text-[16px] text-foreground shadow-none focus-visible:border-0 focus-visible:ring-0 dark:bg-transparent"
							data-testid={
								view === "create"
									? "mobile-recording-group-create-input"
									: "mobile-recording-group-rename-input"
							}
							onKeyDown={(event) => {
								if (event.key === "Enter") {
									void (view === "create"
										? handleCreateConfirm()
										: handleRenameConfirm())
								}
								if (event.key === "Escape")
									setView(view === "rename" ? "manage" : "menu")
							}}
						/>
					</div>
				</div>
			) : null}

			{view === "manage" ? (
				<div
					className="w-full shrink-0 overflow-hidden rounded-lg bg-card"
					data-testid="mobile-recording-group-manage-list"
				>
					{groups.map((group, index) => (
						<div key={group.id} data-testid="mobile-recording-group-manage-row">
							<div className="flex h-12 items-center gap-2 px-[14px]">
								<button
									type="button"
									className="min-w-0 flex-1 truncate text-left text-[16px] leading-5 text-foreground"
									data-testid="mobile-recording-group-rename-trigger"
									onClick={() => {
										setRenamingGroup(group)
										setDraftName(group.name)
										setView("rename")
									}}
								>
									{resolveRecordingGroupDisplayName(
										group.name,
										unnamedGroupLabel,
									)}
								</button>
								<span className="text-[13px] tabular-nums text-muted-foreground">
									{group.projectCount}
								</span>
								<button
									type="button"
									className="flex size-8 items-center justify-center rounded-full active:bg-foreground/[0.06]"
									aria-label={t(
										"super:mobile.recordingEntry.groupSheet.deleteGroupAria",
									)}
									data-testid="mobile-recording-group-delete-button"
									disabled={isSubmitting}
									onClick={() => {
										void onDeleteGroup(group.id)
									}}
								>
									<Trash2 className="size-4 text-destructive" />
								</button>
							</div>
							{index < groups.length - 1 ? (
								<div className="h-px w-full bg-border" />
							) : null}
						</div>
					))}
				</div>
			) : null}
		</MagicPopup>
	)
}
