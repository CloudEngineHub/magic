import { type MouseEvent, useMemo } from "react"
import { Check, ChevronRight, Minus } from "lucide-react"
import { useTranslation } from "react-i18next"
import { DataEmptyState } from "@/pages/superMagicMobile/components/DataEmptyState"
import MobilePathBreadcrumb from "@/pages/superMagic/components/MobilePathBreadcrumb"
import { canSetAsDefault } from "@/pages/superMagic/components/Share/FileSelector/utils"
import { MobileAttachmentRowIcon } from "@/pages/superMagic/components/TopicFilesButton/components/MobileAttachmentRowIcon"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks/types"
import {
	getAttachmentDisplayName,
	MobileAttachmentPickerShell,
	useMobileAttachmentBrowser,
} from "@/pages/superMagicMobile/components/MobileAttachmentPicker"

interface DefaultOpenFilePickerProps {
	open: boolean
	candidateTree: AttachmentItem[]
	selectedFileId?: string
	onClose: () => void
	onSelectFile: (fileId: string) => void
}

type FolderCheckState = "checked" | "unchecked" | "indeterminate"

interface SelectionCoverage {
	totalNodeCount: number
	selectedNodeCount: number
}

/** Builds every folder state in one tree pass so row rendering only performs map lookups. */
function buildFolderCheckStateMap(
	nodes: AttachmentItem[],
	selectedFileId?: string,
): Map<string, FolderCheckState> {
	const folderStates = new Map<string, FolderCheckState>()
	if (!selectedFileId) return folderStates

	/** Returns subtree coverage while recording the current folder's visual state. */
	const visitNode = (node: AttachmentItem): SelectionCoverage => {
		let descendantNodeCount = 0
		let selectedDescendantCount = 0

		for (const child of node.children || []) {
			const childCoverage = visitNode(child)
			descendantNodeCount += childCoverage.totalNodeCount
			selectedDescendantCount += childCoverage.selectedNodeCount
		}

		const nodeId = node.file_id
		const isSelectedNode = nodeId === selectedFileId
		const ownNodeCount = nodeId ? 1 : 0
		const totalNodeCount = ownNodeCount + descendantNodeCount
		const selectedNodeCount = isSelectedNode ? totalNodeCount : selectedDescendantCount

		if (node.is_directory && nodeId) {
			if (
				isSelectedNode ||
				(descendantNodeCount > 0 && selectedDescendantCount === descendantNodeCount)
			) {
				folderStates.set(nodeId, "checked")
			} else if (selectedDescendantCount > 0) {
				folderStates.set(nodeId, "indeterminate")
			} else {
				folderStates.set(nodeId, "unchecked")
			}
		}

		return { totalNodeCount, selectedNodeCount }
	}

	for (const node of nodes) visitNode(node)
	return folderStates
}

/**
 * Renders the mobile default-open file picker used by both project and file shares.
 */
export default function DefaultOpenFilePicker({
	open,
	candidateTree,
	selectedFileId,
	onClose,
	onSelectFile,
}: DefaultOpenFilePickerProps) {
	const { t } = useTranslation("super")
	const includeDefaultCandidate = useMemo(() => canSetAsDefault, [])
	const {
		pathStack,
		currentNodes,
		searchQuery,
		setSearchQuery,
		isSearching,
		searchResults,
		scrollPortRef,
		openFolder,
		openSearchFolder,
		navigateTo,
		resetBrowser,
	} = useMobileAttachmentBrowser(open, candidateTree, includeDefaultCandidate)
	const folderCheckStates = useMemo(
		() => buildFolderCheckStateMap(candidateTree, selectedFileId),
		[candidateTree, selectedFileId],
	)

	const resetAndClose = () => {
		resetBrowser()
		onClose()
	}

	const handleSelect = (fileId: string) => {
		onSelectFile(fileId)
		resetBrowser()
	}

	/**
	 * Keeps folder selection scoped to the trailing control so the row body can keep drilling in.
	 */
	const handleFolderSelect = (event: MouseEvent<HTMLButtonElement>, folder: AttachmentItem) => {
		event.stopPropagation()
		if (!folder.file_id) return
		handleSelect(folder.file_id)
	}

	/**
	 * Navigates within the selected folder stack while keeping the same breadcrumb behavior as topic files.
	 */
	const handleNavigateTo = (index: number) => {
		navigateTo(index)
	}

	const renderFileRow = (file: AttachmentItem, secondaryText?: string) => {
		const isSelected = selectedFileId === file.file_id
		const displayName = getAttachmentDisplayName(file)

		return (
			<button
				key={file.file_id}
				type="button"
				className="flex min-h-[56px] w-full items-center gap-3 rounded-xl bg-white px-3.5 py-2.5 text-left active:opacity-75"
				onClick={() => file.file_id && handleSelect(file.file_id)}
				data-testid="project-share-default-file-picker-row"
			>
				<MobileAttachmentRowIcon
					item={file}
					attachments={candidateTree}
					size={20}
					className="block size-5 shrink-0 object-contain"
					dataTestId="project-share-default-file-picker-icon"
				/>
				<div className="min-w-0 flex-1">
					<div className="truncate text-[16px] leading-5 text-foreground">
						{displayName}
					</div>
					{secondaryText ? (
						<div className="mt-1 truncate text-[13px] leading-4 text-[#8A8A8A]">
							{secondaryText}
						</div>
					) : null}
				</div>
				{isSelected ? (
					<span className="flex size-[22px] shrink-0 items-center justify-center rounded-full bg-foreground">
						<Check className="size-3.5 text-white" strokeWidth={2.4} />
					</span>
				) : (
					<span className="size-[22px] shrink-0 rounded-full border-2 border-[#D0D0D0]" />
				)}
			</button>
		)
	}

	const renderFolderRow = (folder: AttachmentItem, options: { onOpen?: () => void } = {}) => {
		const displayName = getAttachmentDisplayName(folder)
		const selectable = canSetAsDefault(folder)
		const folderCheckState = folder.file_id
			? (folderCheckStates.get(folder.file_id) ?? "unchecked")
			: "unchecked"
		const isFolderChecked = folderCheckState === "checked"
		const isFolderIndeterminate = folderCheckState === "indeterminate"

		return (
			<div
				key={folder.file_id}
				className="flex min-h-[56px] items-center gap-3 rounded-xl bg-white px-3.5 py-2.5"
				data-testid="project-share-default-file-picker-folder-row"
			>
				<button
					type="button"
					className="flex min-w-0 flex-1 items-center gap-3 text-left active:opacity-75"
					onClick={() => {
						if (options.onOpen) {
							options.onOpen()
							return
						}
						openFolder(folder)
					}}
					data-testid="project-share-default-file-picker-folder-primary"
				>
					<MobileAttachmentRowIcon
						item={folder}
						attachments={candidateTree}
						size={20}
						className="block size-5 shrink-0 object-contain"
						dataTestId="project-share-default-file-picker-folder-icon"
					/>
					<span className="min-w-0 flex-1 truncate text-[16px] leading-5 text-foreground">
						{displayName}
					</span>
				</button>
				{selectable ? (
					<button
						type="button"
						className={
							isFolderChecked || isFolderIndeterminate
								? "flex size-[22px] shrink-0 items-center justify-center rounded-full bg-foreground active:opacity-75"
								: "size-[22px] shrink-0 rounded-full border-2 border-[#D0D0D0] active:opacity-75"
						}
						disabled={!folder.file_id}
						onClick={(event) => handleFolderSelect(event, folder)}
						aria-label={t("projectShare.defaultOpenFileLabel")}
						aria-pressed={isFolderIndeterminate ? "mixed" : isFolderChecked}
						data-testid="project-share-default-file-picker-folder-select"
					>
						{isFolderChecked ? (
							<Check className="size-3.5 text-white" strokeWidth={2.4} />
						) : isFolderIndeterminate ? (
							<Minus className="size-3.5 text-white" strokeWidth={2.4} />
						) : null}
					</button>
				) : null}
				{!selectable && folder.children?.length ? (
					<>
						<button
							type="button"
							className="flex size-8 shrink-0 items-center justify-center rounded-full active:bg-[#F0F0F0]"
							onClick={() => openFolder(folder)}
							data-testid="project-share-default-file-picker-folder-open"
						>
							<ChevronRight className="size-[18px] text-[#8A8A8A]" />
						</button>
						{isFolderChecked || isFolderIndeterminate ? (
							<span
								className="flex size-[22px] shrink-0 items-center justify-center rounded-full bg-foreground"
								aria-hidden="true"
								data-testid={`project-share-default-file-picker-folder-state-${folder.file_id}`}
							>
								{isFolderChecked ? (
									<Check className="size-3.5 text-white" strokeWidth={2.4} />
								) : (
									<Minus className="size-3.5 text-white" strokeWidth={2.4} />
								)}
							</span>
						) : null}
					</>
				) : null}
			</div>
		)
	}

	/**
	 * Keeps picker empty states visually aligned with the mobile topic file list.
	 */
	const renderEmptyState = () => (
		<DataEmptyState
			variant={isSearching ? "chatFilesSearch" : "files"}
			compact
			className="min-h-full py-12"
			testId="project-share-default-file-picker-empty"
		/>
	)

	return (
		<MobileAttachmentPickerShell
			open={open}
			testId="project-share-default-file-picker"
			closeTestId="project-share-default-file-picker-close"
			searchTestIdPrefix="project-share-default-file-picker-search"
			title={t("projectShare.defaultOpenFileLabel")}
			closeAriaLabel={t("common.close")}
			searchPlaceholder={t("projectShare.defaultOpenFileSearchPlaceholder")}
			clearSearchLabel={t("projectDetail.clearSearch")}
			searchQuery={searchQuery}
			showBreadcrumb={!isSearching}
			scrollPortRef={scrollPortRef}
			contentDeps={[
				candidateTree.length,
				currentNodes.length,
				searchResults.length,
				searchQuery,
			]}
			onClose={resetAndClose}
			onSearchQueryChange={setSearchQuery}
			breadcrumb={
				<div
					className="shrink-0 pr-[14px]"
					data-testid="project-share-default-file-picker-breadcrumb"
				>
					<MobilePathBreadcrumb
						className="px-[10px] py-2"
						segments={pathStack.map((item, index) => ({
							key: item.file_id || `${index}-${getAttachmentDisplayName(item)}`,
							label: getAttachmentDisplayName(item),
							onClick: () => handleNavigateTo(index),
						}))}
						canBack={pathStack.length > 0}
						onBack={() => handleNavigateTo(pathStack.length - 2)}
						onGoHome={() => handleNavigateTo(-1)}
						backLabel={t("back")}
						homeLabel={t("home")}
						backButtonTestId="project-share-default-file-picker-back-button"
						homeButtonTestId="project-share-default-file-picker-home-button"
						scrollTestId="project-share-default-file-picker-breadcrumb-scroll"
						homeIconClassName="h-4.5 w-4.5"
						separatorClassName="h-4 w-4 text-muted-foreground/60"
						segmentButtonClassName="px-2 text-base leading-6"
					/>
				</div>
			}
		>
			<div
				className="min-h-full space-y-2 px-3 pb-2"
				data-testid="project-share-default-file-picker-list"
			>
				{candidateTree.length === 0
					? renderEmptyState()
					: isSearching
						? searchResults.length > 0
							? searchResults.map((result) =>
									result.item.is_directory
										? renderFolderRow(result.item, {
												onOpen: () =>
													openSearchFolder(result.pathItems, result.item),
											})
										: renderFileRow(result.item, result.pathLabel || undefined),
								)
							: renderEmptyState()
						: currentNodes.map((node) =>
								node.is_directory ? renderFolderRow(node) : renderFileRow(node),
							)}
			</div>
		</MobileAttachmentPickerShell>
	)
}
