import { type MouseEvent, useEffect, useMemo, useState } from "react"
import { Check, ChevronRight, Minus } from "lucide-react"
import { useTranslation } from "react-i18next"
import { DataEmptyState } from "@/pages/superMagicMobile/components/DataEmptyState"
import MobilePathBreadcrumb from "@/pages/superMagic/components/MobilePathBreadcrumb"
import { MobileAttachmentRowIcon } from "@/pages/superMagic/components/TopicFilesButton/components/MobileAttachmentRowIcon"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks/types"
import type { AttachmentIndex } from "@/pages/superMagic/components/TopicFilesButton/utils/attachmentIndex"
import magicToast from "@/components/base/MagicToaster/utils"
import { Button } from "@/components/shadcn-ui/button"
import {
	getAttachmentDisplayName,
	getAttachmentId,
	MobileAttachmentPickerShell,
	useMobileAttachmentBrowser,
} from "@/pages/superMagicMobile/components/MobileAttachmentPicker"

interface ProjectShareFilePickerProps {
	open: boolean
	attachments: AttachmentItem[]
	selectedFileIds: string[]
	defaultOpenFileId?: string
	onClose: () => void
	onConfirm: (fileIds: string[]) => void
}

type NodeCheckState = "checked" | "unchecked" | "indeterminate"

interface SelectionCoverage {
	totalNodeCount: number
	selectedNodeCount: number
}

/** Builds all row check states in one tree pass so rendering only performs map lookups. */
function buildNodeCheckStateMap(
	nodes: AttachmentItem[],
	selectedFileIds: string[],
): Map<string, NodeCheckState> {
	const checkStateMap = new Map<string, NodeCheckState>()
	const selectedIdSet = new Set(selectedFileIds)

	/** Returns subtree coverage while recording the current node's visual selection state. */
	const visitNode = (node: AttachmentItem, ancestorSelected: boolean): SelectionCoverage => {
		const nodeId = getAttachmentId(node)
		const directlySelected = Boolean(nodeId && selectedIdSet.has(nodeId))
		const effectivelySelected = ancestorSelected || directlySelected
		let descendantNodeCount = 0
		let selectedDescendantCount = 0

		for (const child of node.children || []) {
			const childCoverage = visitNode(child, effectivelySelected)
			descendantNodeCount += childCoverage.totalNodeCount
			selectedDescendantCount += childCoverage.selectedNodeCount
		}

		const ownNodeCount = nodeId ? 1 : 0
		const totalNodeCount = ownNodeCount + descendantNodeCount
		const selectedNodeCount = effectivelySelected ? totalNodeCount : selectedDescendantCount

		if (nodeId) {
			if (!node.is_directory) {
				checkStateMap.set(nodeId, effectivelySelected ? "checked" : "unchecked")
			} else if (!node.children?.length || descendantNodeCount === 0) {
				// Preserve the existing empty-folder behavior, which only reflects direct selection.
				checkStateMap.set(nodeId, directlySelected ? "checked" : "unchecked")
			} else if (selectedDescendantCount === 0) {
				checkStateMap.set(nodeId, "unchecked")
			} else if (selectedDescendantCount === descendantNodeCount) {
				checkStateMap.set(nodeId, "checked")
			} else {
				checkStateMap.set(nodeId, "indeterminate")
			}
		}

		return { totalNodeCount, selectedNodeCount }
	}

	for (const node of nodes) visitNode(node, false)
	return checkStateMap
}

/** Returns ancestor IDs from the nearest parent using the shared tree index. */
function getAncestorIds(fileId: string, index: AttachmentIndex): string[] {
	return index
		.getParentItemsById(fileId)
		.reverse()
		.map(getAttachmentId)
		.filter((ancestorId): ancestorId is string => Boolean(ancestorId))
}

/** Returns sibling IDs without scanning or flattening the attachment tree. */
function getSiblingIds(fileId: string, index: AttachmentIndex): string[] {
	const entry = index.getEntryById(fileId)
	if (!entry) return []
	const siblingKeys = entry.parentKey
		? index.getChildKeysByKey(entry.parentKey)
		: [...index.rootKeys]

	return siblingKeys
		.map((key) => index.getItemByKey(key))
		.filter((item): item is AttachmentItem => Boolean(item))
		.map(getAttachmentId)
		.filter((siblingId): siblingId is string => Boolean(siblingId && siblingId !== fileId))
}

/** Returns every descendant ID from the shared index in display order. */
function getDescendantIds(fileId: string, index: AttachmentIndex): string[] {
	return index
		.getDescendantKeysById(fileId)
		.map((key) => index.getItemByKey(key))
		.filter((item): item is AttachmentItem => Boolean(item))
		.map(getAttachmentId)
		.filter((descendantId): descendantId is string => Boolean(descendantId))
}

/** Checks whether the compressed selection contains an openable file or special folder. */
function hasValidSelectionForShare(fileIds: string[], index: AttachmentIndex): boolean {
	return fileIds.some((fileId) => {
		const item = index.getItemById(fileId)
		if (!item) return false
		if (!item.is_directory || item.display_config?.type) return true

		return index.getDescendantKeysById(fileId).some((key) => {
			const descendant = index.getItemByKey(key)
			return Boolean(
				descendant && (!descendant.is_directory || descendant.display_config?.type),
			)
		})
	})
}

/** Splits a selected ancestor into sibling selections when a nested item is deselected. */
function splitSelectedAncestor(
	fileId: string,
	selectedAncestorId: string,
	selectedFileIds: string[],
	index: AttachmentIndex,
): string[] {
	const nextFileIds = selectedFileIds.filter((id) => id !== selectedAncestorId)
	let currentId = fileId

	for (const ancestorId of getAncestorIds(fileId, index)) {
		nextFileIds.push(...getSiblingIds(currentId, index))
		if (ancestorId === selectedAncestorId) break
		currentId = ancestorId
	}

	return [...new Set(nextFileIds)]
}

/** Renders the mobile multi-select picker with the same navigation shell as default-file picking. */
export default function ProjectShareFilePicker({
	open,
	attachments,
	selectedFileIds,
	defaultOpenFileId,
	onClose,
	onConfirm,
}: ProjectShareFilePickerProps) {
	const { t } = useTranslation("super")
	const [draftFileIds, setDraftFileIds] = useState(selectedFileIds)
	const includeShareCandidate = useMemo(() => () => true, [])
	const {
		index: selectionIndex,
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
	} = useMobileAttachmentBrowser(open, attachments, includeShareCandidate)
	const nodeCheckStateMap = useMemo(
		() => buildNodeCheckStateMap(attachments, draftFileIds),
		[attachments, draftFileIds],
	)
	useEffect(() => {
		if (open) {
			setDraftFileIds(selectedFileIds)
		}
	}, [open, selectedFileIds])

	/** Discards the current picker draft and returns to the edit form. */
	const resetAndClose = () => {
		setDraftFileIds(selectedFileIds)
		resetBrowser()
		onClose()
	}

	/** Commits the staged selection only after the user presses the bottom save action. */
	const handleConfirm = () => {
		onConfirm(draftFileIds)
		resetBrowser()
	}

	/** Navigates to a folder while keeping the picker path aligned with the shared breadcrumb. */
	const navigateIntoFolder = (folder: AttachmentItem) => {
		openFolder(folder)
	}

	/** Replaces the current folder path with a breadcrumb-selected ancestor. */
	const handleNavigateTo = (index: number) => {
		navigateTo(index)
	}

	/** Toggles a file or folder while preserving the selector's parent/descendant semantics. */
	const handleToggle = (fileId: string) => {
		const node = selectionIndex.getItemById(fileId)
		if (!node) return

		const checkState = nodeCheckStateMap.get(fileId) ?? "unchecked"
		let nextFileIds: string[]
		if (checkState === "unchecked") {
			nextFileIds = [...draftFileIds, fileId]
		} else if (checkState === "indeterminate") {
			const descendantIdSet = new Set(getDescendantIds(fileId, selectionIndex))
			nextFileIds = draftFileIds.filter((id) => !descendantIdSet.has(id)).concat(fileId)
		} else if (draftFileIds.includes(fileId)) {
			nextFileIds = draftFileIds.filter((id) => id !== fileId)
		} else {
			const selectedAncestorId = getAncestorIds(fileId, selectionIndex).find((id) =>
				draftFileIds.includes(id),
			)
			if (selectedAncestorId) {
				nextFileIds = splitSelectedAncestor(
					fileId,
					selectedAncestorId,
					draftFileIds,
					selectionIndex,
				)
			} else if (node.is_directory) {
				const descendantIdSet = new Set(getDescendantIds(fileId, selectionIndex))
				nextFileIds = draftFileIds.filter((id) => !descendantIdSet.has(id))
			} else {
				nextFileIds = draftFileIds
			}
		}

		if (!hasValidSelectionForShare(nextFileIds, selectionIndex)) {
			magicToast.warning(t("share.atLeastOneFileRequired"))
			return
		}

		setDraftFileIds(nextFileIds)
	}

	/** Handles row navigation for folders and selection toggling for leaf files. */
	const handleRowClick = (item: AttachmentItem) => {
		const fileId = getAttachmentId(item)
		if (!fileId) return

		if (item.is_directory && item.children?.length) {
			navigateIntoFolder(item)
			return
		}

		handleToggle(fileId)
	}

	/** Prevents a checkbox click from also opening its parent folder. */
	const handleToggleClick = (event: MouseEvent<HTMLButtonElement>, item: AttachmentItem) => {
		event.stopPropagation()
		const fileId = getAttachmentId(item)
		if (fileId) handleToggle(fileId)
	}

	/** Clears the current search text and keeps the input focus behavior consistent with other mobile lists. */
	const clearSearchLabel = t("projectDetail.clearSearch")

	/** Renders a selectable attachment row and its optional folder navigation affordance. */
	const renderRow = (item: AttachmentItem, secondaryText?: string, onOpenFolder?: () => void) => {
		const fileId = getAttachmentId(item)
		if (!fileId) return null

		const displayName = getAttachmentDisplayName(item)
		const checkState = nodeCheckStateMap.get(fileId) ?? "unchecked"
		const isDefaultOpenFile = defaultOpenFileId === fileId
		const hasChildren = Boolean(item.is_directory && item.children?.length)

		return (
			<div
				key={fileId}
				className="flex min-h-[56px] items-center gap-2 rounded-xl bg-white px-3.5 py-2.5"
				data-testid={`project-share-file-picker-row-${fileId}`}
			>
				<button
					type="button"
					className="flex min-w-0 flex-1 items-center gap-3 text-left active:opacity-75"
					onClick={() => {
						if (item.is_directory && onOpenFolder) {
							onOpenFolder()
							return
						}
						handleRowClick(item)
					}}
					data-testid={`project-share-file-picker-primary-${fileId}`}
				>
					<MobileAttachmentRowIcon
						item={item}
						attachments={attachments}
						size={20}
						className="block size-5 shrink-0 object-contain"
						dataTestId="project-share-file-picker-icon"
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
				</button>
				{hasChildren ? (
					<button
						type="button"
						className="flex size-8 shrink-0 items-center justify-center rounded-full active:bg-[#F0F0F0]"
						onClick={() => (onOpenFolder ? onOpenFolder() : navigateIntoFolder(item))}
						aria-label={`${displayName} ${t("filenameValidator.type.folder")}`}
						data-testid={`project-share-file-picker-folder-open-${fileId}`}
					>
						<ChevronRight className="size-[18px] text-[#8A8A8A]" />
					</button>
				) : null}
				<button
					type="button"
					className={
						checkState === "checked"
							? "flex size-[22px] shrink-0 items-center justify-center rounded-full bg-foreground active:opacity-75"
							: checkState === "indeterminate"
								? "flex size-[22px] shrink-0 items-center justify-center rounded-full bg-foreground active:opacity-75"
								: "size-[22px] shrink-0 rounded-full border-2 border-[#D0D0D0] active:opacity-75"
					}
					onClick={(event) => handleToggleClick(event, item)}
					aria-label={`${displayName}${isDefaultOpenFile ? ` ${t("projectShare.defaultOpenFileLabel")}` : ""}`}
					aria-pressed={checkState === "checked"}
					data-testid={`project-share-file-picker-toggle-${fileId}`}
				>
					{checkState === "checked" ? (
						<Check className="size-3.5 text-white" strokeWidth={2.4} />
					) : checkState === "indeterminate" ? (
						<Minus className="size-3.5 text-white" strokeWidth={2.4} />
					) : null}
				</button>
			</div>
		)
	}

	/** Renders the empty state using the same mobile list treatment as default-file picking. */
	const renderEmptyState = () => (
		<DataEmptyState
			variant={isSearching ? "chatFilesSearch" : "files"}
			compact
			className="min-h-full py-12"
			testId="project-share-file-picker-empty"
		/>
	)

	return (
		<MobileAttachmentPickerShell
			open={open}
			testId="project-share-file-picker"
			closeTestId="project-share-file-picker-close"
			searchTestIdPrefix="project-share-file-picker-search"
			title={t("share.selectShareFiles")}
			closeAriaLabel={t("common.close")}
			searchPlaceholder={t("projectShare.defaultOpenFileSearchPlaceholder")}
			clearSearchLabel={clearSearchLabel}
			searchQuery={searchQuery}
			showBreadcrumb={!isSearching}
			scrollPortRef={scrollPortRef}
			contentDeps={[
				attachments.length,
				currentNodes.length,
				searchResults.length,
				searchQuery,
			]}
			onClose={resetAndClose}
			onSearchQueryChange={setSearchQuery}
			headerAction={
				<Button
					type="button"
					variant="ghost"
					className="absolute right-2.5 top-1/2 flex size-12 -translate-y-1/2 items-center justify-center rounded-full bg-foreground px-0 text-background shadow-[0_8px_25px_rgba(0,0,0,0.10)] hover:bg-foreground active:opacity-70 disabled:opacity-40"
					disabled={draftFileIds.length === 0}
					onClick={handleConfirm}
					aria-label={t("common.save")}
					data-testid="project-share-file-picker-confirm"
				>
					<Check className="size-[22px]" strokeWidth={2} />
				</Button>
			}
			breadcrumb={
				<div
					className="shrink-0 pr-[14px]"
					data-testid="project-share-file-picker-breadcrumb"
				>
					<MobilePathBreadcrumb
						className="px-[10px] py-2"
						segments={pathStack.map((item, index) => ({
							key:
								getAttachmentId(item) ||
								`${index}-${getAttachmentDisplayName(item)}`,
							label: getAttachmentDisplayName(item),
							onClick: () => handleNavigateTo(index),
						}))}
						canBack={pathStack.length > 0}
						onBack={() => handleNavigateTo(pathStack.length - 2)}
						onGoHome={() => handleNavigateTo(-1)}
						backLabel={t("back")}
						homeLabel={t("home")}
						backButtonTestId="project-share-file-picker-back"
						homeButtonTestId="project-share-file-picker-home"
						scrollTestId="project-share-file-picker-breadcrumb-scroll"
						homeIconClassName="h-4.5 w-4.5"
						separatorClassName="h-4 w-4 text-muted-foreground/60"
						segmentButtonClassName="px-2 text-base leading-6"
					/>
				</div>
			}
		>
			<div
				className="min-h-full space-y-2 px-3 pb-2"
				data-testid="project-share-file-picker-list"
			>
				{attachments.length === 0
					? renderEmptyState()
					: isSearching
						? searchResults.length > 0
							? searchResults.map((result) =>
									renderRow(
										result.item,
										result.pathLabel || undefined,
										result.item.is_directory
											? () => openSearchFolder(result.pathItems, result.item)
											: undefined,
									),
								)
							: renderEmptyState()
						: currentNodes.map((node) => renderRow(node))}
			</div>
		</MobileAttachmentPickerShell>
	)
}
