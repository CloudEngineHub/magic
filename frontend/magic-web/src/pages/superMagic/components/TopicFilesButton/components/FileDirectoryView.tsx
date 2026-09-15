import { useVirtualScrollMargin } from "../hooks/useVirtualScrollMargin"
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { useSize } from "ahooks"
import { ArrowLeft, ChevronRight, MoreHorizontal } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"
import { Checkbox } from "@/components/shadcn-ui/checkbox"
import MagicDropdown from "@/components/base/MagicDropdown"
import { cn } from "@/utils/cn"
import { normalizeLocale } from "@/utils/locale"
import {
	compareMagicFolderPriority,
	createAttachmentNodeComparator,
} from "@/pages/superMagic/utils/projectAttachments/treeUtils"
import type { AttachmentItem } from "../hooks/types"
import type { TopicFilesMenuItem } from "../utils/menu-items"
import { TopicFileIcon } from "./TopicFileIcon"
import { ProjectFileTag } from "./TopicFileTag"
import { FileDirectoryToolbar } from "./FileDirectoryToolbar"
import { handleAttachmentDragEnd, handleAttachmentDragStart } from "../../MessageEditor/utils/drag"

export interface DirectoryBreadcrumb {
	id: string
	name: string
}
export interface FileDirectoryViewProps {
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
export function FileDirectoryView({
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
										<MagicDropdown
											key={file.file_id}
											trigger={["contextMenu"]}
											menu={{ items: getMenuItems(file) }}
										>
											<div
												className={cn(
													"group relative min-w-0 rounded-md hover:bg-accent",
													grid
														? "flex flex-col items-center justify-center border p-2"
														: "flex items-center gap-2 px-1",
													activeFileId === file.file_id && "bg-accent",
												)}
											>
												<div
													className={cn(
														"flex min-w-0 flex-wrap items-center gap-2 py-1",
														grid ? "w-full" : "flex-1",
													)}
												>
													{selecting && (
														<Checkbox
															disabled={!isSelectable(file)}
															aria-label={t("userSpace.selectName", {
																name: file.file_name ?? file.name,
															})}
															checked={selectedIds.has(
																String(file.file_id),
															)}
															onCheckedChange={() => toggle(file)}
														/>
													)}
													<button
														data-file-index={
															row.index * columns + offset
														}
														className={cn(
															"flex min-w-[min(8ch,100%)] flex-[1_1_8ch] items-center gap-2 rounded text-left text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring",
															grid && "flex-col text-center",
														)}
														draggable
														onDragStart={(event) =>
															handleAttachmentDragStart(event, file)
														}
														onDragEnd={handleAttachmentDragEnd}
														onKeyDown={(event) =>
															keyboard(
																event,
																row.index * columns + offset,
																file,
															)
														}
														onClick={() =>
															file.is_directory
																? navigate(file.file_id)
																: onOpen(file)
														}
														title={file.file_name ?? file.name}
													>
														{renderFileIcon ? (
															renderFileIcon(file, grid ? 36 : 16)
														) : (
															<TopicFileIcon
																isDirectory={file.is_directory}
																fileExtension={file.file_extension}
																size={grid ? 36 : 16}
															/>
														)}
														<span className="min-w-0 max-w-full truncate">
															{file.file_name ?? file.name}
														</span>
													</button>
													<div
														className={cn(
															"ml-auto flex max-w-full shrink-0 empty:hidden",
															grid && "w-full justify-center",
														)}
													>
														{renderFileTag ? (
															renderFileTag(file)
														) : (
															<ProjectFileTag item={file} />
														)}
													</div>
												</div>
												{!grid && (
													<>
														<span className="w-20 shrink-0 truncate text-xs text-muted-foreground">
															{file.is_directory
																? t("userSpace.folder")
																: file.file_extension?.toUpperCase() ||
																	t("userSpace.file")}
														</span>
														<span
															className="hidden w-44 shrink-0 truncate text-xs text-muted-foreground sm:block"
															title={formatDirectoryFileTime(
																file.updated_at,
																i18n.language,
															)}
														>
															{formatDirectoryFileTime(
																file.updated_at,
																i18n.language,
															)}
														</span>
													</>
												)}
												<MagicDropdown
													trigger={["click"]}
													menu={{ items: getMenuItems(file) }}
												>
													<Button
														variant="ghost"
														size="icon"
														className={cn(
															"size-7 shrink-0",
															grid && "absolute right-2 top-1",
														)}
														aria-label={t("userSpace.actions", {
															name: file.file_name ?? file.name,
														})}
													>
														<MoreHorizontal size={16} />
													</Button>
												</MagicDropdown>
											</div>
										</MagicDropdown>
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
