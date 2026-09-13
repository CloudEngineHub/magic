import { useEffect, useMemo, useRef, useDeferredValue } from "react"
import { useTranslation } from "react-i18next"
import { useMemoizedFn } from "ahooks"
import { buildAttachmentIndex } from "../../utils/attachmentIndex"
import { getFilePresentationIndex, resolveFilePresentation } from "../../utils/file-presentation"
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
import { FileManagerDialogs } from "./FileManagerDialogs"
import type { FileManagerProps } from "./types"

/** 完整管理器负责桌面交互；附件索引仍由原文件数据提供，不另建 store。 */
export function FileManager(props: FileManagerProps) {
	const { t, i18n } = useTranslation("super")
	const container = useRef<HTMLDivElement>(null)
	const viewport = useRef<HTMLDivElement>(null)
	const navigation = useFileManagerNavigation(props.initialDirectoryId ?? props.rootId)
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
	const missing = location.directoryId !== props.rootId && !directory && !props.loading
	const error = Boolean(props.error || missing || directory?.directoryLoadState === "error")
	const loading = Boolean(
		props.loading ||
		directory?.directoryLoadState === "loading" ||
		directory?.directoryLoadState === "unloaded",
	)
	const items = useMemo(() => {
		const children =
			location.directoryId === props.rootId ? props.attachments : (directory?.children ?? [])
		const collator = new Intl.Collator(i18n.language.replaceAll("_", "-"), {
			numeric: true,
			sensitivity: "base",
		})
		return children
			.filter((item) => !item.is_hidden && Boolean(item.file_id))
			.map((item) =>
				resolveFilePresentation(item, { context: props.context, index: presentationIndex }),
			)
			.filter((item) => !query || item.name.toLocaleLowerCase().includes(query))
			.sort((a, b) => {
				if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
				if (navigation.sort === "modified") {
					const difference = String(b.item.updated_at ?? "").localeCompare(
						String(a.item.updated_at ?? ""),
					)
					if (difference) return difference
				}
				if (navigation.sort === "type") {
					const difference = collator.compare(
						a.item.file_extension ?? "",
						b.item.file_extension ?? "",
					)
					if (difference) return difference
				}
				return collator.compare(a.name, b.name)
			})
	}, [
		location.directoryId,
		props.rootId,
		props.attachments,
		directory,
		i18n.language,
		props.context,
		presentationIndex,
		query,
		navigation.sort,
	])
	const ids = useMemo(() => items.map(({ item }) => item.file_id ?? ""), [items])
	const selection = useFileManagerSelection({
		ids,
		location,
		setLocation: navigation.setLocation,
		ready: !loading && !error,
	})
	const onOpen = useMemoizedFn((file: AttachmentItem) => {
		if (file.is_directory && file.file_id) navigation.navigate(file.file_id)
		else props.onOpen(file)
	})
	const operations = useFileManagerOperations({
		props,
		index,
		directory,
		selectedIds: selection.selectedIds,
		setSelectedIds: selection.replace,
		onOpen,
		onMoveComplete: (fileIds) => fileManagerTransfer.completeMove(props.scopeKey, fileIds),
	})
	const commands = useFileManagerCommands({
		props,
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
		isActive: props.isActive,
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
	const folders = useMemo(
		() =>
			props.attachments
				.filter((file) => file.is_directory && !file.is_hidden)
				.map((file) =>
					resolveFilePresentation(file, {
						context: props.context,
						index: presentationIndex,
					}),
				),
		[props.attachments, props.context, presentationIndex],
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
	const status = operations.crossProject.isOperating
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
	return (
		<div
			ref={container}
			data-file-manager={props.scopeKey}
			onDragStart={gestures.onDragStart}
			onDragEnd={gestures.onDragEnd}
			onDragOver={gestures.onDragOver}
			onDragLeave={gestures.onDragLeave}
			onDrop={gestures.onDrop}
			className="flex h-full min-h-0 flex-col bg-background text-foreground"
		>
			<div className="shrink-0 border-b px-4 py-3 text-sm font-semibold">
				{props.rootName}
			</div>
			<div className="flex min-h-0 flex-1">
				<FileManagerPlaces
					rootId={props.rootId}
					rootName={props.rootName}
					directoryId={location.directoryId}
					folders={folders}
					onNavigate={navigation.navigate}
					before={props.placesBefore}
					getPopupContainer={getPopupContainer}
				/>
				<div className="flex min-h-0 min-w-0 flex-1 flex-col">
					<FileManagerToolbar
						actions={commands}
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
						onSort={navigation.setSort}
						onRefresh={props.onRefresh}
						loading={loading}
						getPopupContainer={getPopupContainer}
					/>
					<FileManagerContent
						viewport={viewport}
						gestures={gestures}
						actions={commands}
						directoryId={location.directoryId}
						items={items}
						view={navigation.view}
						selection={selection}
						initialScrollTop={location.scrollTop}
						onScroll={navigation.onScroll}
						onOpen={onOpen}
						onBack={navigation.back}
						onForward={navigation.forward}
						onUp={() => parentId !== undefined && navigation.navigate(parentId)}
						isActive={props.isActive}
						loading={loading}
						error={error}
						onRefresh={props.onRefresh}
						query={query}
						renderTag={props.renderTag}
						getPopupContainer={getPopupContainer}
					/>
					<div
						role="status"
						aria-live="polite"
						className="flex min-h-9 shrink-0 items-center justify-between gap-3 border-t px-4 py-2 text-xs text-muted-foreground"
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
			<FileManagerDialogs manager={props} controller={operations} />
		</div>
	)
}
