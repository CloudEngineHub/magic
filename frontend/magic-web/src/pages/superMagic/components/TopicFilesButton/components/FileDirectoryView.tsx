import { useFileTagVisibility } from "../hooks/useFileTagVisibility"
import type { FileHelpContext } from "../utils/magic-system-folder"
import type { SkillFileStructure } from "../utils/skill-file-structure"
import { getAttachmentKey } from "../utils/getAttachmentKey"
import { getFilePresentationIndex, resolveFilePresentation } from "../utils/file-presentation"
import { FileDirectoryRow } from "./FileDirectoryRow"
import { useVirtualScrollMargin } from "../hooks/useVirtualScrollMargin"
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { useSize } from "ahooks"
import { ArrowLeft, ChevronRight } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"
import { cn } from "@/utils/cn"
import { normalizeLocale } from "@/utils/locale"
import {
	compareMagicFolderPriority,
	createAttachmentNodeComparator,
} from "@/pages/superMagic/utils/projectAttachments/treeUtils"
import type { AttachmentItem } from "../hooks/types"
import type { TopicFilesMenuItem } from "../utils/menu-items"
import { ProjectFileTag } from "./TopicFileTag"
import { FileDirectoryToolbar } from "./FileDirectoryToolbar"

export interface DirectoryBreadcrumb {
	id: string
	name: string
}
export interface FileDirectoryViewProps {
	mode?: "files"
	skillFiles?: SkillFileStructure
	fileHelpContext?: FileHelpContext
	renderFileIcon?: (file: AttachmentItem, size: number) => ReactNode
	renderFileTag?: (file: AttachmentItem) => ReactNode
	scrollElementRef?: React.RefObject<HTMLElement>
	items: AttachmentItem[]
	path: DirectoryBreadcrumb[]
	rootName: string
	onNavigate: (id?: string) => void
	onOpen: (file: AttachmentItem) => void
	getMenuItems: (file: AttachmentItem) => TopicFilesMenuItem[]
	selectedIds: Set<string>
	onSelectionChange: (ids: Set<string>) => void
	isSelectable?: (file: AttachmentItem) => boolean
	createMenuItems?: import("antd").MenuProps["items"]
	onUpload?: () => void
	onMove?: (files: AttachmentItem[]) => void
	onDelete?: (files: AttachmentItem[]) => void
	onDownload?: (files: AttachmentItem[]) => void
	allowDirectoryDownload?: boolean
	loading?: boolean
	error?: boolean
	onRetry: () => void
	search?: string
	onSearchChange?: (value: string) => void
	activeFileId?: string | null
}

/** 明确按当前界面时区展示；无时区的服务端时间按 UTC 解析。 */
export function formatDirectoryFileTime(
	value: string | number | undefined,
	locale?: string,
): string {
	if (value === undefined || value === "") return "—"
	const numeric = typeof value === "number" || /^\d+$/.test(value) ? Number(value) : null
	const source =
		numeric !== null
			? numeric < 1e12
				? numeric * 1000
				: numeric
			: /(?:Z|[+-]\d{2}:?\d{2})$/i.test(String(value))
				? String(value)
				: String(value).replace(" ", "T") + "Z"
	const date = new Date(source)
	if (Number.isNaN(date.getTime())) return "—"
	// 项目语言键使用 zh_CN；浏览器 Intl 需要 zh-CN 格式。
	return new Intl.DateTimeFormat(normalizeLocale(locale).replaceAll("_", "-"), {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		timeZoneName: "short",
	}).format(date)
}

/** 项目和用户文件共享目录交互；读取与修改由所属空间提供，视图不构造项目身份。 */
function InteractiveFileDirectoryView({
	skillFiles,
	fileHelpContext,
	renderFileIcon,
	renderFileTag,
	scrollElementRef,
	items,
	path,
	rootName,
	onNavigate,
	onOpen,
	getMenuItems,
	selectedIds,
	onSelectionChange,
	isSelectable = () => true,
	createMenuItems,
	onUpload,
	onMove,
	onDelete,
	onDownload,
	allowDirectoryDownload,
	loading = false,
	error = false,
	onRetry,
	search: externalSearch,
	onSearchChange,
	activeFileId,
}: FileDirectoryViewProps) {
	const { t, i18n } = useTranslation("super")
	const [search, setSearch] = useState("")
	const [grid, setGrid] = useState(false)
	const [selecting, setSelecting] = useState(false)
	const [sort, setSort] = useState<"name" | "time">("name")
	const scrollRef = useRef<HTMLDivElement>(null)
	useFileTagVisibility(scrollRef)
	const size = useSize(scrollRef)
	const { ref: rowsRef, scrollMargin } = useVirtualScrollMargin(scrollElementRef)
	const query = (externalSearch ?? search).toLocaleLowerCase()
	const compareNames = useMemo(
		() => createAttachmentNodeComparator(i18n.language),
		[i18n.language],
	)
	const visible = useMemo(
		() =>
			items
				.filter((file) =>
					(file.file_name ?? file.name ?? "").toLocaleLowerCase().includes(query),
				)
				.sort(
					(a, b) =>
						compareMagicFolderPriority(a, b) ||
						(sort === "time"
							? Number(Boolean(b.is_directory)) - Number(Boolean(a.is_directory)) ||
								String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? ""))
							: compareNames(a, b)),
				),
		[items, query, sort, compareNames],
	)
	const columns = grid ? Math.max(1, Math.floor((size?.width ?? 400) / 140)) : 1
	const rowHeight = grid ? 108 : 44
	const virtualizer = useVirtualizer({
		count: Math.ceil(visible.length / columns),
		getScrollElement: () => scrollElementRef?.current ?? scrollRef.current,
		scrollMargin,
		estimateSize: () => rowHeight,
		overscan: 5,
	})
	useEffect(() => {
		virtualizer.measure()
	}, [columns, rowHeight, virtualizer])
	const selectedFiles = items.filter((file) => selectedIds.has(String(file.file_id)))
	const toggle = (file: AttachmentItem) => {
		if (!file.file_id || !isSelectable(file)) return
		const next = new Set(selectedIds)
		if (next.has(file.file_id)) next.delete(file.file_id)
		else next.add(file.file_id)
		onSelectionChange(next)
	}
	const navigate = (id?: string) => {
		onSelectionChange(new Set())
		onNavigate(id)
	}
	const keyboard = (
		event: KeyboardEvent<HTMLButtonElement>,
		index: number,
		file: AttachmentItem,
	) => {
		if (event.key === " " && selecting) {
			event.preventDefault()
			toggle(file)
			return
		}
		const offset =
			event.key === "ArrowDown"
				? columns
				: event.key === "ArrowUp"
					? -columns
					: grid && event.key === "ArrowRight"
						? 1
						: grid && event.key === "ArrowLeft"
							? -1
							: 0
		if (!offset) return
		event.preventDefault()
		const next = Math.max(0, Math.min(visible.length - 1, index + offset))
		virtualizer.scrollToIndex(Math.floor(next / columns))
		requestAnimationFrame(() =>
			scrollRef.current
				?.querySelector<HTMLButtonElement>(`[data-file-index="${next}"]`)
				?.focus(),
		)
	}
	return (
		<div className={cn("flex min-h-0 flex-col bg-background", !scrollElementRef && "h-full")}>
			<div
				className={cn(
					"flex shrink-0 items-center gap-1 overflow-x-auto border-b",
					"px-4 py-3",
				)}
			>
				<Button
					variant="ghost"
					size="icon"
					className="size-7 shrink-0"
					disabled={!path.length}
					aria-label={t("userSpace.back")}
					onClick={() => navigate(path.at(-2)?.id)}
				>
					<ArrowLeft size={16} />
				</Button>
				<button
					className="shrink-0 rounded px-1 text-xs hover:bg-accent"
					onClick={() => navigate()}
				>
					{rootName}
				</button>
				{path.map((part) => (
					<span key={part.id} className="flex shrink-0 items-center text-xs">
						<ChevronRight size={12} />
						<button
							className="max-w-40 truncate rounded px-1 hover:bg-accent"
							title={part.name}
							onClick={() => navigate(part.id)}
						>
							{part.name}
						</button>
					</span>
				))}
			</div>
			<FileDirectoryToolbar
				onRefresh={onRetry}
				externalSearch={externalSearch}
				search={search}
				setSearch={setSearch}
				grid={grid}
				setGrid={setGrid}
				selecting={selecting}
				setSelecting={setSelecting}
				loading={loading}
				error={error}
				visible={visible}
				selectedFiles={selectedFiles}
				isSelectable={isSelectable}
				selectedIds={selectedIds}
				onSelectionChange={onSelectionChange}
				onSearchChange={onSearchChange}
				createMenuItems={createMenuItems}
				onUpload={onUpload}
				onMove={onMove}
				onDelete={onDelete}
				onDownload={onDownload}
				allowDirectoryDownload={allowDirectoryDownload}
			/>
			{!grid && (
				<div className="grid shrink-0 grid-cols-[minmax(0,1fr)_80px_32px] gap-2 border-b px-4 py-2 text-xs text-muted-foreground sm:grid-cols-[minmax(0,1fr)_80px_176px_32px]">
					<button className="text-left" onClick={() => setSort("name")}>
						{t("userSpace.name")}
					</button>
					<span>{t("userSpace.type")}</span>
					<button className="hidden text-left sm:block" onClick={() => setSort("time")}>
						{t("userSpace.modified")}
					</button>
					<span />
				</div>
			)}
			{error && (
				<div role="alert" className="flex items-center justify-center gap-2 p-3 text-xs">
					{t("userSpace.loadFailed")}
					<Button variant="outline" size="sm" onClick={onRetry}>
						{t("userSpace.retry")}
					</Button>
				</div>
			)}
			<div
				ref={scrollRef}
				className={cn(
					"min-h-0",
					scrollElementRef ? "overflow-visible" : "flex-1 overflow-auto",
				)}
				aria-busy={loading}
			>
				{!visible.length ? (
					<p className="p-4 text-center text-xs text-muted-foreground">
						{loading
							? t("userSpace.loading")
							: error
								? ""
								: query
									? t("userSpace.searchEmpty")
									: t("userSpace.empty")}
					</p>
				) : (
					<div
						ref={rowsRef}
						className="relative w-full"
						style={{ height: virtualizer.getTotalSize() }}
					>
						{virtualizer.getVirtualItems().map((row) => (
							<div
								key={row.key}
								data-index={row.index}
								ref={virtualizer.measureElement}
								className="absolute left-0 top-0 grid w-full gap-2 px-2"
								style={{
									minHeight: rowHeight,
									transform: `translateY(${row.start - scrollMargin}px)`,
									gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
								}}
							>
								{visible
									.slice(row.index * columns, (row.index + 1) * columns)
									.map((file, offset) => (
										<FileDirectoryRow
											key={file.file_id}
											mode="files"
											presentation={resolveFilePresentation(file, {
												context: fileHelpContext,
												index: getFilePresentationIndex(items),
												skillKind: skillFiles?.kinds.get(
													getAttachmentKey(file),
												),
												path: skillFiles?.paths.get(getAttachmentKey(file)),
											})}
											grid={grid}
											index={row.index * columns + offset}
											active={activeFileId === file.file_id}
											selecting={selecting}
											selected={selectedIds.has(String(file.file_id))}
											selectable={isSelectable(file)}
											modified={formatDirectoryFileTime(
												file.updated_at,
												i18n.language,
											)}
											menuItems={getMenuItems(file)}
											onToggle={() => toggle(file)}
											onOpen={() =>
												file.is_directory
													? navigate(file.file_id)
													: onOpen(file)
											}
											onKeyDown={(event) =>
												keyboard(event, row.index * columns + offset, file)
											}
											icon={renderFileIcon?.(file, grid ? 36 : 16)}
											tag={
												renderFileTag ? (
													renderFileTag(file)
												) : (
													<ProjectFileTag
														item={file}
														skillKind={skillFiles?.kinds.get(
															getAttachmentKey(file),
														)}
														path={skillFiles?.paths.get(
															getAttachmentKey(file),
														)}
														context={fileHelpContext}
													/>
												)
											}
										/>
									))}
							</div>
						))}
					</div>
				)}
			</div>
			<div className="shrink-0 border-t px-3 py-1 text-xs text-muted-foreground">
				{t("userSpace.itemCount", { count: visible.length })}
			</div>
		</div>
	)
}

export interface FileDirectoryExampleProps {
	mode: "example"
	items: AttachmentItem[]
	rootName: string
	fileHelpContext: FileHelpContext
	descriptions?: Readonly<Record<string, string>>
}

function FileDirectoryExample({
	items,
	rootName,
	fileHelpContext,
	descriptions,
}: FileDirectoryExampleProps) {
	const { t } = useTranslation("super")
	const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())
	const index = getFilePresentationIndex(items)
	const entries = [...index.attachments.entriesByKey.values()].filter(
		(entry) =>
			!index.attachments
				.getPathKeys(entry.key)
				.slice(0, -1)
				.some((key) => collapsed.has(key)),
	)
	return (
		<div className="overflow-hidden rounded-lg border bg-background">
			<div className="border-b px-4 py-2 text-xs text-muted-foreground">{rootName}</div>
			<div className="px-2 py-1">
				{entries.map(({ key, item, level }) => (
					<FileDirectoryRow
						key={key}
						mode="example"
						presentation={resolveFilePresentation(item, {
							context: fileHelpContext,
							index,
						})}
						depth={level}
						description={descriptions?.[index.skills.paths.get(key) ?? ""]}
						expanded={!collapsed.has(key)}
						onExpand={() =>
							setCollapsed((previous) => {
								const next = new Set(previous)
								if (next.has(key)) next.delete(key)
								else next.add(key)
								return next
							})
						}
					/>
				))}
			</div>
			<div className="border-t px-4 py-2 text-xs text-muted-foreground">
				{t("userSpace.itemCount", { count: entries.length })}
			</div>
		</div>
	)
}

export function FileDirectoryView(props: FileDirectoryViewProps | FileDirectoryExampleProps) {
	return props.mode === "example" ? (
		<FileDirectoryExample {...props} />
	) : (
		<InteractiveFileDirectoryView {...props} />
	)
}
