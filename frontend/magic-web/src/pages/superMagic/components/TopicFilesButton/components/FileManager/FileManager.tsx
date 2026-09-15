import { useEffect, useMemo, useRef, useDeferredValue, useState, lazy, Suspense } from "react"
import { flushSync } from "react-dom"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/shadcn-ui/button"
import { cn } from "@/utils/cn"
import { useTranslation } from "react-i18next"
import { useMemoizedFn } from "ahooks"
import { buildAttachmentIndex } from "../../utils/attachmentIndex"
import {
	getFilePresentationIndex,
	resolveFilePresentation,
	type FilePresentation,
} from "../../utils/file-presentation"
import { useTreeUI } from "../../hooks/useTreeUI"
import { useVisibleTreeRows } from "../../hooks/useVisibleTreeRows"
import {
	useFileManagerColumns,
	getFileManagerColumnText,
	getFileManagerColumnValue,
} from "../../hooks/useFileManagerColumns"
import { useFileManagerNavigation } from "../../hooks/useFileManagerNavigation"
import { useFileManagerSelection } from "../../hooks/useFileManagerSelection"
import { useFileManagerOperations } from "../../hooks/useFileManagerOperations"
import { useFileManagerCommands } from "../../hooks/useFileManagerCommands"
import { useFileManagerGestures } from "../../hooks/useFileManagerGestures"
import { fileManagerTransfer } from "../../utils/file-manager-transfer"
import type { AttachmentItem } from "../../hooks/types"
import { FileManagerToolbar } from "./FileManagerToolbar"
import { FileManagerPlaces } from "./FileManagerPlaces"
import { FileManagerContent } from "./FileManagerContent"
import { FileManagerDragPreview } from "./FileManagerDragPreview"
import { FileManagerDialogs } from "./FileManagerDialogs"
import type { FileManagerProps, FileManagerSort } from "./types"
import type { FileManagerLocationSnapshot } from "@/models/config/repositories/SuperProjectStateTypes"
import magicToast from "@/components/base/MagicToaster/utils"

const RecycleBinContent = lazy(() =>
	import("@/pages/recycleBin/components/RecycleBinContent").then((module) => ({
		default: module.RecycleBinContent,
	})),
)

const noExpandedKeys: React.Key[] = []

/** 完整管理器负责桌面交互；附件索引仍由原文件数据提供，不另建 store。 */
export function FileManager(props: FileManagerProps) {
	const { t, i18n } = useTranslation("super")
	const initialState = useRef(props.initialState).current
	const initialDirectoryId =
		props.initialDirectoryId ?? (initialState?.directoryId || props.rootId)
	const locating =
		props.initialDirectoryId !== undefined &&
		props.initialDirectoryId !== (initialState?.directoryId || props.rootId)
	const [recycle, setRecycle] = useState(!locating && initialState?.area === "recycle")
	const interacted = useRef(false)
	const places = useRef(
		initialState?.places ?? { expandedIds: [], rootExpanded: true, scrollTop: 0 },
	)
	const [recycleCount, setRecycleCount] = useState(0)
	const activeProps = { ...props, isActive: props.isActive && !recycle }
	const container = useRef<HTMLDivElement>(null)
	const dragPreview = useRef<HTMLDivElement>(null)
	const [dragPreviewIds, setDragPreviewIds] = useState<string[]>([])
	const viewport = useRef<HTMLDivElement>(null)
	const listColumns = useFileManagerColumns(initialState?.columns)
	const getColumnText = useMemoizedFn((file: FilePresentation, column: FileManagerSort) =>
		getFileManagerColumnText(file, column, i18n.language, props.rootName),
	)
	const navigation = useFileManagerNavigation(
		initialDirectoryId,
		props.defaultView,
		locating && initialState
			? {
					...initialState,
					query: "",
					selectedIds: [],
					focusedId: null,
					anchorId: null,
					scrollTop: 0,
					scrollLeft: 0,
				}
			: initialState,
	)
	const { location } = navigation
	const index = useMemo(() => buildAttachmentIndex(props.attachments), [props.attachments])
	const presentationIndex = useMemo(
		() => getFilePresentationIndex(props.attachments),
		[props.attachments],
	)
	const directory =
		location.directoryId === props.rootId ? undefined : index.getItemById(location.directoryId)
	const query = useDeferredValue(
		location.query.trim().toLocaleLowerCase(i18n.language.replaceAll("_", "-")),
	)
	const missing =
		props.dataReady !== false &&
		location.directoryId !== props.rootId &&
		!directory &&
		!props.loading
	const error = Boolean(props.error || missing || directory?.directoryLoadState === "error")
	const loading = Boolean(
		props.dataReady === false ||
		props.loading ||
		directory?.directoryLoadState === "loading" ||
		directory?.directoryLoadState === "unloaded",
	)
	const [expandedKeys, setExpandedKeys] = useState<React.Key[]>(initialState?.expandedIds ?? [])
	const listTree = useTreeUI({
		enableCache: false,
		expandedKeys,
		onExpandedKeysChange: setExpandedKeys,
	})
	const contentLoading =
		loading ||
		expandedKeys.some((id) => {
			const state = index.getItemById(String(id))?.directoryLoadState
			return state === "unloaded" || state === "loading"
		})
	const navigate = navigation.navigate
	const expandedError = expandedKeys.some(
		(id) => index.getItemById(String(id))?.directoryLoadState === "error",
	)
	useEffect(() => {
		if (!missing || props.context.kind !== "project" || props.error) return
		const ancestor = [...(initialState?.ancestorIds ?? [])]
			.reverse()
			.find((id) => index.getItemById(id)?.is_directory)
		navigate(ancestor ?? props.rootId)
		magicToast.info(t("fileManager.restoredDirectoryUnavailable"))
	}, [missing, props.context.kind, props.error, initialState, index, navigate, props.rootId, t])
	const sorted = useMemo(() => {
		const collator = new Intl.Collator(i18n.language.replaceAll("_", "-"), {
			numeric: true,
			sensitivity: "base",
		})
		const children = new Map<string, AttachmentItem[]>()
		const sortChildren = (files: AttachmentItem[]) =>
			files
				.filter((item) => !item.is_hidden && item.file_id)
				.map((item) =>
					item.is_directory
						? { ...item, children: children.get(item.file_id ?? "") ?? [] }
						: item,
				)
				.sort((a, b) => {
					if (Boolean(a.is_directory) !== Boolean(b.is_directory))
						return a.is_directory ? -1 : 1
					const left = resolveFilePresentation(a, {
						context: props.context,
						index: presentationIndex,
					})
					const right = resolveFilePresentation(b, {
						context: props.context,
						index: presentationIndex,
					})
					const leftValue = getFileManagerColumnValue(left, navigation.sort)
					const rightValue = getFileManagerColumnValue(right, navigation.sort)
					if (leftValue === null && rightValue !== null) return 1
					if (rightValue === null && leftValue !== null) return -1
					const difference =
						leftValue === null || rightValue === null
							? 0
							: typeof leftValue === "number" && typeof rightValue === "number"
								? leftValue - rightValue
								: collator.compare(String(leftValue), String(rightValue))
					if (difference)
						return difference * (navigation.sortDirection === "ascending" ? 1 : -1)
					return (
						collator.compare(left.name, right.name) ||
						collator.compare(a.file_id ?? "", b.file_id ?? "")
					)
				})
		// 后代先排序，一次生成展示投影；展开和选择只计算可见行，不重新扫描全部附件。
		for (const key of [...index.allKeys].reverse()) {
			const file = index.getItemByKey(key)
			if (file?.is_directory && file.file_id)
				children.set(file.file_id, sortChildren(file.children ?? []))
		}
		return { roots: sortChildren(props.attachments), children }
	}, [
		index,
		props.attachments,
		props.context,
		presentationIndex,
		navigation.sort,
		navigation.sortDirection,
		i18n.language,
	])
	const currentChildren = useMemo(() => {
		const children =
			location.directoryId === props.rootId
				? sorted.roots
				: (sorted.children.get(location.directoryId) ?? [])
		return query
			? children.filter((item) =>
					resolveFilePresentation(item, {
						context: props.context,
						index: presentationIndex,
					})
						.name.toLocaleLowerCase()
						.includes(query),
				)
			: children
	}, [location.directoryId, props.rootId, sorted, query, props.context, presentationIndex])
	const visible = useVisibleTreeRows({
		attachmentTree: currentChildren,
		expandedKeys: navigation.view === "list" && !query ? listTree.expandedKeys : noExpandedKeys,
	})
	const items = useMemo(
		() =>
			visible.visibleNodes.flatMap(({ item }) =>
				item
					? [
							resolveFilePresentation(item, {
								context: props.context,
								index: presentationIndex,
							}),
						]
					: [],
			),
		[visible.visibleNodes, props.context, presentationIndex],
	)
	const rowDetails = useMemo(
		() =>
			new Map(
				visible.visibleNodes.map((node) => [
					node.item?.file_id ?? "",
					{
						level: node.level,
						expanded: visible.expandedKeySet.has(String(node.key)),
						expandable: !node.isLeaf,
					},
				]),
			),
		[visible.visibleNodes, visible.expandedKeySet],
	)
	const toggleListFolder = (file: AttachmentItem, all = false) => {
		if (!file.file_id || file.directoryLoadState === "loading") return
		const id = file.file_id
		const opening = !visible.expandedKeySet.has(id) || file.directoryLoadState === "error"
		const keys = all
			? [
					id,
					...index
						.getDescendantKeysById(id)
						.filter((key) => index.getItemByKey(key)?.is_directory),
				]
			: [id]
		listTree.setExpandedKeys((previous) =>
			opening
				? [...new Set([...previous, ...keys])]
				: previous.filter((key) => !keys.includes(String(key))),
		)
		if (file.directoryLoadState === "error")
			void props.spaceConfig?.directorySource?.loadDirectory(id).catch(() => undefined)
	}
	useEffect(() => {
		if (!props.spaceConfig?.directorySource) return
		for (const key of listTree.expandedKeys) {
			if (index.getItemById(String(key))?.directoryLoadState === "unloaded")
				void props.spaceConfig.directorySource
					.loadDirectory(String(key))
					.catch(() => undefined)
		}
	}, [index, listTree.expandedKeys, props.spaceConfig?.directorySource])
	const ids = useMemo(() => items.map(({ item }) => item.file_id ?? ""), [items])
	const selection = useFileManagerSelection({
		ids,
		location,
		setLocation: navigation.setLocation,
		ready: !contentLoading && !error && !expandedError,
	})
	const onOpen = useMemoizedFn((file: AttachmentItem) => {
		if (file.is_directory && file.file_id) navigation.navigate(file.file_id)
		else props.onOpen(file)
	})
	const operations = useFileManagerOperations({
		props: activeProps,
		index,
		directory,
		selectedIds: selection.selectedIds,
		setSelectedIds: selection.replace,
		onOpen,
		onMoveComplete: (fileIds) => fileManagerTransfer.completeMove(props.scopeKey, fileIds),
	})
	const cancelRename = useMemoizedFn(() => {
		if (!operations.names.rename.isRenamePending()) operations.names.rename.handleRenameCancel()
	})
	useEffect(cancelRename, [location.directoryId, activeProps.isActive, cancelRename])
	const commands = useFileManagerCommands({
		props: activeProps,
		index,
		directoryId: location.directoryId,
		selectedIds: selection.selectedIds,
		operations,
		ready: !loading && !error,
		onOpen,
		onSelectAll: selection.all,
	})
	const gestures = useFileManagerGestures({
		scopeKey: props.scopeKey,
		rootId: props.rootId,
		directoryId: location.directoryId,
		isActive: activeProps.isActive && !operations.busy,
		container,
		viewport,
		index,
		ids,
		selectedIds: selection.selectedIds,
		select: selection.replace,
		canTransfer: commands.canTransfer,
		onTransfer: commands.transfer,
		onExternalDrop: (data, target) => void operations.externalDrop(data, target),
		allowUpload: Boolean(props.allowEdit && operations.capabilities.upload),
		onNavigate: navigation.navigate,
		prepareDragImage: (fileIds) => {
			// setDragImage 必须在 dragstart 同步执行，不能等待下一次 React 提交。
			flushSync(() => setDragPreviewIds(fileIds))
			return dragPreview.current
		},
		clearDragImage: () => setDragPreviewIds((current) => (current.length ? [] : current)),
	})
	const path = useMemo(
		() => [
			{ id: props.rootId, name: props.rootName },
			...(directory ? [...index.getParentItemsById(location.directoryId), directory] : [])
				.filter((file) => file.file_id && file.file_id !== props.rootId)
				.map((file) => ({
					id: file.file_id ?? "",
					name: resolveFilePresentation(file, {
						context: props.context,
						index: presentationIndex,
					}).name,
				})),
		],
		[
			props.rootId,
			props.rootName,
			directory,
			index,
			location.directoryId,
			props.context,
			presentationIndex,
		],
	)

	const dragging = fileManagerTransfer.getDragging()
	const targetFile = gestures.dropTarget ? index.getItemById(gestures.dropTarget) : undefined
	const targetName =
		gestures.dropTarget === props.rootId
			? props.rootName
			: targetFile
				? resolveFilePresentation(targetFile, {
						context: props.context,
						index: presentationIndex,
					}).name
				: ""
	const preparation = operations.transferPreparation
	const status =
		preparation?.phase === "checking"
			? t(
					preparation.mode === "move"
						? "fileManager.preparation.checkingMove"
						: "fileManager.preparation.checkingCopy",
				)
			: operations.crossProject.isOperating
				? t("fileManager.operationProgress", {
						progress: operations.crossProject.operationProgress,
					})
				: operations.move.isMoving
					? t("fileManager.operationProgress", { progress: operations.move.moveProgress })
					: operations.busy
						? t("fileManager.processing")
						: gestures.dropTarget !== null
							? !dragging
								? t("fileManager.uploadTarget", { target: targetName })
								: gestures.dragMode === "copy"
									? t("fileManager.copyTarget", {
											count: dragging.fileIds.length,
											target: targetName,
										})
									: t("fileManager.moveTarget", {
											count: dragging.fileIds.length,
											target: targetName,
										})
							: t("fileManager.selectionHint")
	const parentId = path.at(-2)?.id
	const getPopupContainer = () => container.current
	const onDirectoryChange = props.onDirectoryChange
	useEffect(() => {
		onDirectoryChange?.(location.directoryId)
	}, [location.directoryId, onDirectoryChange])
	const emitState = useMemoizedFn((deferred = false) => {
		if (loading || error) return
		const snapshot: FileManagerLocationSnapshot = {
			directoryId: location.directoryId === props.rootId ? "" : location.directoryId,
			ancestorIds: path.slice(1, -1).map(({ id }) => id),
			view: navigation.view,
			sort: navigation.sort,
			sortDirection: navigation.sortDirection,
			area: recycle ? "recycle" : "files",
			query: location.query,
			selectedIds: [...location.selectedIds],
			focusedId: location.focusedId,
			anchorId: location.anchorId,
			...navigation.getScrollPosition(),
			expandedIds: listTree.expandedKeys.map(String),
			places: places.current,
			columns: { visibleIds: listColumns.visibleIds, widths: listColumns.widths },
		}
		props.onStateChange?.(snapshot, { deferred, userInteraction: interacted.current })
		interacted.current = false
	})
	useEffect(() => {
		emitState()
	}, [
		location,
		navigation.view,
		navigation.sort,
		navigation.sortDirection,
		recycle,
		expandedKeys,
		listColumns.visibleIds,
		listColumns.widths,
		loading,
		error,
		emitState,
	])
	return (
		<div
			ref={container}
			data-file-manager={props.scopeKey}
			tabIndex={-1}
			onKeyDown={commands.onClipboardKeyDown}
			onPointerDownCapture={() => {
				interacted.current = true
			}}
			onKeyDownCapture={() => {
				interacted.current = true
			}}
			onDragStart={gestures.onDragStart}
			onDragEnd={gestures.onDragEnd}
			onDragOver={gestures.onDragOver}
			onDragLeave={gestures.onDragLeave}
			onDrop={gestures.onDrop}
			className="flex h-full min-h-0 flex-col bg-background text-foreground"
		>
			{recycle && (
				<div className="flex h-12 shrink-0 items-center gap-2 border-b border-border/60 bg-muted/20 px-4 text-sm font-medium">
					<Button
						variant="ghost"
						size="icon"
						className="size-7"
						aria-label={t("fileManager.recycle.back")}
						onClick={() => setRecycle(false)}
					>
						<ArrowLeft size={15} />
					</Button>
					<span className="truncate">{t("fileManager.recycle.title")}</span>
				</div>
			)}
			{recycle && props.isActive && (
				<div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-4">
					<p className="text-xs text-muted-foreground">
						{props.spaceConfig?.scope
							? t("fileManager.recycle.scope")
							: t("recycleBin.project.scope")}
					</p>
					<Suspense
						fallback={
							<p className="p-4 text-xs text-muted-foreground">
								{t("userSpace.loading")}
							</p>
						}
					>
						<RecycleBinContent
							key={props.identityKey}
							projectId={
								props.spaceConfig?.scope
									? undefined
									: props.projectId || props.selectedProject?.id || ""
							}
							activeTab={{ id: "files", count: recycleCount }}
							requireDeleteConfirmation
							onMutationComplete={props.onRefresh}
							onTabCountChange={(id, count) => {
								if (id === "files") setRecycleCount(count)
							}}
						/>
					</Suspense>
				</div>
			)}
			<div className={cn("flex min-h-0 flex-1", recycle && "hidden")}>
				{!props.hidePlaces && (
					<FileManagerPlaces
						initialState={initialState?.places}
						ready={!loading && !error && activeProps.isActive}
						onStateChange={(state, deferred) => {
							places.current = state
							emitState(deferred)
						}}
						rootId={props.rootId}
						rootName={props.rootName}
						directoryId={location.directoryId}
						attachments={sorted.roots}
						index={index}
						context={props.context}
						presentationIndex={presentationIndex}
						directorySource={props.spaceConfig?.directorySource}
						onOpen={props.onOpen}
						onNavigate={navigation.navigate}
						before={props.placesBefore}
						getPopupContainer={getPopupContainer}
					/>
				)}
				<div className="flex min-h-0 min-w-0 flex-1 flex-col">
					<FileManagerToolbar
						onOpenRecycle={() => setRecycle(true)}
						actions={commands}
						createMenu={{
							onAddFile: operations.createFile,
							onAddFolder: operations.createFolder,
							onAddDesign: operations.onAddDesign,
							onAddSelfMedia: operations.onAddSelfMedia,
							onAddAICard: operations.onAddAICard,
						}}
						uploadMenu={{
							onUploadFile: operations.uploadFile,
							onUploadFolder: operations.onUploadFolder,
							onImportFromOtherProject: operations.onImportFromOtherProject,
						}}
						path={path}
						canBack={navigation.canBack}
						canForward={navigation.canForward}
						canUp={Boolean(parentId !== undefined)}
						back={navigation.back}
						forward={navigation.forward}
						up={() => parentId !== undefined && navigation.navigate(parentId)}
						onNavigate={navigation.navigate}
						query={location.query}
						onQuery={(value) =>
							navigation.setLocation((current) => ({ ...current, query: value }))
						}
						view={navigation.view}
						onView={navigation.setView}
						sort={navigation.sort}
						sortOptions={listColumns.labels}
						sortDirection={navigation.sortDirection}
						onSort={navigation.setSort}
						onRefresh={props.onRefresh}
						loading={contentLoading}
						getPopupContainer={getPopupContainer}
					/>
					<FileManagerContent
						listColumns={listColumns}
						sort={navigation.sort}
						sortDirection={navigation.sortDirection}
						onSort={navigation.setSort}
						getColumnText={getColumnText}
						rename={operations.names.rename}
						rowDetails={rowDetails}
						onToggleFolder={toggleListFolder}
						viewport={viewport}
						gestures={gestures}
						actions={commands}
						directoryId={location.directoryId}
						items={items}
						view={navigation.view}
						selection={selection}
						initialScrollTop={location.scrollTop}
						initialScrollLeft={location.scrollLeft}
						restoreReady={!expandedError}
						onScroll={(top, left) => {
							navigation.onScroll(top, left)
							emitState(true)
						}}
						onOpen={onOpen}
						onBack={navigation.back}
						onForward={navigation.forward}
						onUp={() => parentId !== undefined && navigation.navigate(parentId)}
						isActive={activeProps.isActive && !operations.busy}
						loading={contentLoading}
						error={error}
						onRefresh={props.onRefresh}
						query={query}
						renderTag={props.renderTag}
						getPopupContainer={getPopupContainer}
					/>
					<div
						role="status"
						aria-live="polite"
						className="flex min-h-8 shrink-0 items-center justify-between gap-3 border-t border-border/60 bg-muted/20 px-3 py-1.5 text-[11px] text-muted-foreground"
					>
						<span>
							{selection.selectedIds.size
								? t("userSpace.selectedCount", {
										count: selection.selectedIds.size,
									})
								: t("fileManager.itemCount", { count: items.length })}
						</span>
						<span>{status}</span>
					</div>
				</div>
			</div>
			{dragPreviewIds.length > 0 && (
				<FileManagerDragPreview
					ref={dragPreview}
					count={dragPreviewIds.length}
					files={dragPreviewIds.slice(0, 3).flatMap((id) => {
						const file = index.getItemById(id)
						return file
							? [
									resolveFilePresentation(file, {
										context: props.context,
										index: presentationIndex,
									}),
								]
							: []
					})}
				/>
			)}
			<FileManagerDialogs manager={props} controller={operations} />
		</div>
	)
}
