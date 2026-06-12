import { useCallback, useState } from "react"
import { Check, X } from "lucide-react"
import { toast } from "sonner"
import { useTranslation } from "react-i18next"
import MagicPopup from "@/components/base-mobile/MagicPopup"
import { Input } from "@/components/shadcn-ui/input"
import type { AudioProjectListItem } from "@/types/audioProject"
import { resolveRecordingDisplayName } from "@/pages/superMagic/pages/AudioRecordings/utils/audio-recordings-utils"

interface MobileRecordingMoreSheetProps {
	isOpen: boolean
	item: AudioProjectListItem | null
	onClose: () => void
	onRename: (projectId: string, name: string) => Promise<boolean>
	onDelete: (projectId: string) => Promise<boolean>
	isSubmittingAction?: boolean
}

type MoreSheetView = "menu" | "rename" | "deleteConfirm"

function MenuItem({
	label,
	danger,
	showDivider,
	dataTestId,
	onClick,
}: {
	label: string
	danger?: boolean
	showDivider?: boolean
	dataTestId?: string
	onClick?: () => void
}) {
	return (
		<>
			<button
				type="button"
				onClick={onClick}
				data-testid={dataTestId}
				className="flex h-12 w-full items-center gap-2 bg-transparent px-[14px] transition-opacity active:opacity-60"
			>
				<span
					className={`flex-1 text-left text-[16px] leading-5 ${danger ? "text-destructive" : "text-foreground"}`}
				>
					{label}
				</span>
			</button>
			{showDivider ? <div className="h-px w-full bg-border" /> : null}
		</>
	)
}

function MenuGroup({ children }: { children: React.ReactNode }) {
	return <div className="w-full shrink-0 overflow-hidden rounded-lg bg-card">{children}</div>
}

/**
 * More-actions sheet aligned with prototype RecordingMoreSheet:
 * full menu groups; only rename and delete are wired — other items show coming-soon toast.
 */
export function MobileRecordingMoreSheet({
	isOpen,
	item,
	onClose,
	onRename,
	onDelete,
	isSubmittingAction = false,
}: MobileRecordingMoreSheetProps) {
	const { t } = useTranslation(["super", "audioRecordings"])
	const recordingName = item
		? resolveRecordingDisplayName(item.project_name, item.created_at)
		: t("super:mobile.recordingEntry.moreSheet.untitled")
	const hasSummary = item?.card_status === "summarized"

	const [view, setView] = useState<MoreSheetView>("menu")
	const [renameValue, setRenameValue] = useState("")

	const resetState = useCallback(() => {
		setView("menu")
		setRenameValue("")
	}, [])

	const handleSheetOpenChange = useCallback(
		(open: boolean) => {
			if (!open) {
				resetState()
				onClose()
			}
		},
		[onClose, resetState],
	)

	const handleClose = useCallback(() => {
		resetState()
		onClose()
	}, [onClose, resetState])

	const handleComingSoon = useCallback(() => {
		toast.info(t("super:mobile.recordingEntry.moreSheet.comingSoon"))
	}, [t])

	const handleRenamePress = useCallback(() => {
		if (!item) return
		setRenameValue(resolveRecordingDisplayName(item.project_name, item.created_at))
		setView("rename")
	}, [item])

	const handleRenameConfirm = useCallback(async () => {
		const name = renameValue.trim()
		if (!name || !item) return
		const success = await onRename(item.id, name)
		if (success) handleClose()
	}, [renameValue, item, onRename, handleClose])

	const handleDeleteConfirm = useCallback(async () => {
		if (!item) return
		const success = await onDelete(item.id)
		if (success) handleClose()
	}, [item, onDelete, handleClose])

	function resolveHeaderTitle() {
		if (view === "rename") return t("super:mobile.recordingEntry.moreSheet.rename")
		if (view === "deleteConfirm") return t("super:mobile.recordingEntry.moreSheet.deleteTitle")
		return recordingName
	}

	function resolveLeadingAction() {
		if (view === "menu") {
			return {
				icon: <X />,
				ariaLabel: t("super:mobile.recordingEntry.moreSheet.closeAria"),
				onClick: handleClose,
				testId: "mobile-recording-more-close",
			}
		}

		return {
			icon: <X />,
			ariaLabel: t("super:mobile.recordingEntry.moreSheet.backAria"),
			onClick: () => setView("menu"),
			testId: "mobile-recording-more-back",
		}
	}

	function resolveTrailingAction() {
		if (view === "rename") {
			return {
				icon: <Check />,
				ariaLabel: t("super:mobile.recordingEntry.moreSheet.confirmAria"),
				onClick: () => {
					void handleRenameConfirm()
				},
				disabled: !renameValue.trim() || isSubmittingAction,
				tone: "primary" as const,
				testId: "mobile-recording-rename-confirm",
			}
		}

		if (view === "deleteConfirm") {
			return {
				icon: <Check />,
				ariaLabel: t("super:mobile.recordingEntry.moreSheet.confirmAria"),
				onClick: () => {
					void handleDeleteConfirm()
				},
				disabled: isSubmittingAction,
				tone: "destructive" as const,
				testId: "mobile-recording-delete-confirm",
			}
		}

		return undefined
	}

	return (
		<MagicPopup
			visible={isOpen}
			onOpenChange={handleSheetOpenChange}
			onClose={handleClose}
			position="bottom"
			title={resolveHeaderTitle()}
			headerVariant="actionHeader"
			headerTitle={resolveHeaderTitle()}
			headerLeadingAction={resolveLeadingAction()}
			headerTrailingAction={resolveTrailingAction()}
			className="flex flex-col overflow-hidden rounded-t-[14px] border-0 bg-muted p-0"
			bodyClassName="no-scrollbar flex flex-col gap-2.5 overflow-y-auto px-[14px] py-[10px]"
			style={{ boxShadow: "0 -4px 24px rgba(0,0,0,0.08)" }}
			data-testid="mobile-recording-more-sheet"
		>
			{view === "menu" ? (
				<>
					<MenuGroup>
						<MenuItem
							label={t("super:mobile.recordingEntry.moreSheet.rename")}
							dataTestId="mobile-recording-more-rename"
							showDivider
							onClick={handleRenamePress}
						/>
						<MenuItem
							label={t("super:mobile.recordingEntry.moreSheet.moveToGroup")}
							dataTestId="mobile-recording-more-move-to-group"
							onClick={handleComingSoon}
						/>
					</MenuGroup>

					<MenuGroup>
						<MenuItem
							label={
								hasSummary
									? t("super:mobile.recordingEntry.moreSheet.regenerateSummary")
									: t("super:mobile.recordingEntry.moreSheet.generateSummary")
							}
							dataTestId="mobile-recording-more-generate-summary"
							showDivider
							onClick={handleComingSoon}
						/>
						<MenuItem
							label={t("super:mobile.recordingEntry.moreSheet.share")}
							dataTestId="mobile-recording-more-share"
							onClick={handleComingSoon}
						/>
					</MenuGroup>

					<MenuGroup>
						<MenuItem
							label={t("super:mobile.recordingEntry.moreSheet.delete")}
							danger
							dataTestId="mobile-recording-more-delete"
							onClick={() => setView("deleteConfirm")}
						/>
					</MenuGroup>
				</>
			) : null}

			{view === "rename" ? (
				<div className="flex flex-col gap-2">
					<p className="px-[14px] text-[14px] leading-5 text-muted-foreground">
						{t("super:mobile.recordingEntry.moreSheet.renameLabel")}
					</p>
					<MenuGroup>
						<Input
							type="text"
							value={renameValue}
							onChange={(event) => setRenameValue(event.target.value)}
							placeholder={t(
								"super:mobile.recordingEntry.moreSheet.renamePlaceholder",
							)}
							autoFocus
							disabled={isSubmittingAction}
							className="h-12 rounded-none border-0 bg-transparent px-[14px] py-0 text-[16px] text-foreground shadow-none focus-visible:border-0 focus-visible:ring-0 dark:bg-transparent"
							onKeyDown={(event) => {
								if (event.key === "Enter") void handleRenameConfirm()
								if (event.key === "Escape") setView("menu")
							}}
							data-testid="mobile-recording-rename-input"
						/>
					</MenuGroup>
				</div>
			) : null}

			{view === "deleteConfirm" ? (
				<div className="flex flex-col items-center px-4 pt-6">
					<p
						className="pb-6 text-center text-[16px] leading-6 text-foreground"
						data-testid="mobile-recording-delete-message"
					>
						{t("super:mobile.recordingEntry.moreSheet.deleteConfirm", {
							name: recordingName,
						})}
					</p>
				</div>
			) : null}
		</MagicPopup>
	)
}
