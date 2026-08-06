import { type MouseEvent, useEffect, useMemo, useRef, useState } from "react"
import { Check, ChevronRight, X } from "lucide-react"
import { useTranslation } from "react-i18next"
import CommonPopup from "@/pages/superMagicMobile/components/CommonPopup"
import MobileBottomSearchBar from "@/pages/superMagicMobile/components/MobileBottomSearchBar"
import { DataEmptyState } from "@/pages/superMagicMobile/components/DataEmptyState"
import { ScrollEdgeFadeContainer } from "@/components/base-mobile/ScrollEdgeFade"
import MobilePathBreadcrumb from "@/pages/superMagic/components/MobilePathBreadcrumb"
import { canSetAsDefault } from "@/pages/superMagic/components/Share/FileSelector/utils"
import { MobileAttachmentRowIcon } from "@/pages/superMagic/components/TopicFilesButton/components/MobileAttachmentRowIcon"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks/types"

interface DefaultOpenFilePickerProps {
	open: boolean
	candidateTree: AttachmentItem[]
	selectedFileId?: string
	onClose: () => void
	onSelectFile: (fileId: string) => void
}

interface SearchResult {
	file: AttachmentItem
	pathLabel: string
	parentFolders: AttachmentItem[]
}

/**
 * Reads a stable display name from the mixed attachment payloads used by project and file shares.
 */
function getAttachmentDisplayName(item: AttachmentItem): string {
	return item.name || item.file_name || item.display_filename || item.filename || ""
}

/**
 * Collects search matches only when the picker is open and the query is non-empty.
 */
function collectSearchResults(
	nodes: AttachmentItem[],
	query: string,
	pathParts: string[] = [],
	parentFolders: AttachmentItem[] = [],
): SearchResult[] {
	const normalizedQuery = query.trim().toLowerCase()
	if (!normalizedQuery) return []

	const results: SearchResult[] = []
	nodes.forEach((node) => {
		const name = getAttachmentDisplayName(node)
		const extension = node.file_extension || ""
		const nextPathParts = node.is_directory ? [...pathParts, name] : pathParts
		const nextParentFolders = node.is_directory ? [...parentFolders, node] : parentFolders

		if (
			canSetAsDefault(node) &&
			(name.toLowerCase().includes(normalizedQuery) ||
				extension.toLowerCase().includes(normalizedQuery))
		) {
			results.push({
				file: node,
				pathLabel: pathParts.join(" / "),
				parentFolders,
			})
		}

		if (node.children?.length) {
			results.push(
				...collectSearchResults(node.children, query, nextPathParts, nextParentFolders),
			)
		}
	})

	return results
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
	const [pathStack, setPathStack] = useState<AttachmentItem[]>([])
	const [searchQuery, setSearchQuery] = useState("")
	const scrollPortRef = useRef<HTMLDivElement | null>(null)
	const currentNodes =
		pathStack.length === 0 ? candidateTree : (pathStack[pathStack.length - 1].children ?? [])
	const searchResults = useMemo(
		() => collectSearchResults(candidateTree, searchQuery),
		[candidateTree, searchQuery],
	)
	const isSearching = searchQuery.trim().length > 0

	useEffect(() => {
		// Search and folder navigation replace the list contents; reset stale long-list offsets.
		const resetScrollOffsets = () => {
			if (scrollPortRef.current) {
				scrollPortRef.current.scrollTop = 0
				const dialog = scrollPortRef.current.closest('[role="dialog"]')
				if (dialog instanceof HTMLElement) {
					dialog.scrollTop = 0
				}
			}
		}

		resetScrollOffsets()
		const frame = window.requestAnimationFrame(resetScrollOffsets)

		return () => window.cancelAnimationFrame(frame)
	}, [candidateTree.length, currentNodes.length, isSearching, pathStack.length, searchQuery])

	const resetAndClose = () => {
		setPathStack([])
		setSearchQuery("")
		onClose()
	}

	const handleSelect = (fileId: string) => {
		onSelectFile(fileId)
		setPathStack([])
		setSearchQuery("")
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
		if (index < 0) {
			setPathStack([])
			return
		}
		setPathStack((previous) => previous.slice(0, index + 1))
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
						setPathStack((previous) => [...previous, folder])
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
							selectedFileId === folder.file_id
								? "flex size-[22px] shrink-0 items-center justify-center rounded-full bg-foreground active:opacity-75"
								: "size-[22px] shrink-0 rounded-full border-2 border-[#D0D0D0] active:opacity-75"
						}
						disabled={!folder.file_id}
						onClick={(event) => handleFolderSelect(event, folder)}
						aria-label={t("projectShare.defaultOpenFileLabel")}
						data-testid="project-share-default-file-picker-folder-select"
					>
						{selectedFileId === folder.file_id ? (
							<Check className="size-3.5 text-white" strokeWidth={2.4} />
						) : null}
					</button>
				) : null}
				{!selectable && folder.children?.length ? (
					<button
						type="button"
						className="flex size-8 shrink-0 items-center justify-center rounded-full active:bg-[#F0F0F0]"
						onClick={() => setPathStack((previous) => [...previous, folder])}
						data-testid="project-share-default-file-picker-folder-open"
					>
						<ChevronRight className="size-[18px] text-[#8A8A8A]" />
					</button>
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
		<CommonPopup
			title=""
			hideHeader
			showHeader={false}
			popupProps={{
				visible: open,
				onClose: resetAndClose,
				onMaskClick: resetAndClose,
				showCloseButton: false,
				bodyClassName:
					"flex h-[95dvh] max-h-[calc(100dvh-8px)] min-h-0 flex-col !overflow-hidden p-0",
				className: "rounded-t-[14px] border-0 bg-[#F7F7F6]",
				bodyStyle: {
					background: "#F7F7F6",
					borderRadius: "14px 14px 0 0",
					height: "95dvh",
					overflow: "hidden",
				},
			}}
			wrapperStyle={{
				height: "100%",
				maxHeight: "100%",
				minHeight: 0,
			}}
		>
			<div
				className="flex h-full min-h-0 flex-col bg-[#F7F7F6]"
				data-testid="project-share-default-file-picker"
			>
				<div className="relative flex h-14 shrink-0 items-center justify-center px-16">
					{/* Match the project share sheet action size so mobile close targets stay consistent. */}
					<button
						type="button"
						className="absolute left-2.5 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white shadow-[0_8px_25px_rgba(0,0,0,0.10)] active:opacity-70"
						onClick={resetAndClose}
						aria-label={t("common.close")}
						data-testid="project-share-default-file-picker-close"
					>
						<X className="h-[22px] w-[22px] text-foreground" strokeWidth={2} />
					</button>
					<div className="truncate text-[18px] font-semibold leading-6 text-foreground">
						{t("projectShare.defaultOpenFileLabel")}
					</div>
				</div>
				{!isSearching ? (
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
				) : null}
				<ScrollEdgeFadeContainer
					fadeColor="mobile-background"
					className="min-h-0 flex-1"
					scrollClassName="scrollbar-y-thin"
					scrollPortRef={scrollPortRef}
					contentDeps={[
						candidateTree.length,
						currentNodes.length,
						searchResults.length,
						searchQuery,
					]}
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
											result.file.is_directory
												? renderFolderRow(result.file, {
														onOpen: () => {
															setPathStack([
																...result.parentFolders,
																result.file,
															])
															setSearchQuery("")
														},
													})
												: renderFileRow(
														result.file,
														result.pathLabel || undefined,
													),
										)
									: renderEmptyState()
								: currentNodes.map((node) =>
										node.is_directory
											? renderFolderRow(node)
											: renderFileRow(node),
									)}
					</div>
				</ScrollEdgeFadeContainer>
				<div className="relative z-10 shrink-0 bg-[#F7F7F6]">
					{/* Match the topic file sheet: search stays docked at the bottom so filtering never changes sheet height. */}
					<MobileBottomSearchBar
						value={searchQuery}
						placeholder={t("projectShare.defaultOpenFileSearchPlaceholder")}
						clearAriaLabel={t("projectDetail.clearSearch")}
						onValueChange={setSearchQuery}
						testIdPrefix="project-share-default-file-picker-search"
						className="bg-[#F7F7F6] pb-[max(var(--safe-area-inset-bottom),24px)] pt-2.5"
					/>
				</div>
			</div>
		</CommonPopup>
	)
}
