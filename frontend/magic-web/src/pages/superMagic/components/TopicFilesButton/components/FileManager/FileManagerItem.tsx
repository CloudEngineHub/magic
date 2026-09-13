import { memo, type MouseEvent, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { cn } from "@/utils/cn"
import MagicTooltip from "@/components/base/MagicTooltip"
import MagicDropdown from "@/components/base/MagicDropdown"
import { MoreHorizontal, ChevronRight, Loader2, RotateCw } from "lucide-react"
import { Button } from "@/components/shadcn-ui/button"
import type { TopicFilesMenuItem } from "../../utils/menu-items"
import { FileResourceIcon } from "../FileResourceIcon"
import { ProjectFileTag } from "../TopicFileTag"
import { normalizeLocale } from "@/utils/locale"
import type { FilePresentation } from "../../utils/file-presentation"
import type { FileManagerView, FileManagerTreeRow } from "./types"

interface Props {
	row?: FileManagerTreeRow
	striped?: boolean
	onToggleFolder: (all?: boolean) => void
	id: string
	presentation: FilePresentation
	view: FileManagerView
	selected: boolean
	focused: boolean
	cut?: boolean
	menuItems: TopicFilesMenuItem[]
	tag?: ReactNode
	onSelect: (event: MouseEvent<HTMLElement>) => void
	onOpen: () => void
	getPopupContainer: () => HTMLElement | null
}

export const FileManagerItem = memo(function FileManagerItem({
	row,
	striped,
	onToggleFolder,
	id,
	presentation,
	view,
	selected,
	focused,
	cut,
	menuItems,
	tag,
	onSelect,
	onOpen,
	getPopupContainer,
}: Props) {
	const { t, i18n } = useTranslation("super")
	const grid = view === "grid"
	const { item, name, isDirectory } = presentation
	const fileTag = tag ?? <ProjectFileTag item={item} presentation={presentation} />
	const modified: unknown = item.updated_at
	const date = formatDirectoryFileTime(
		typeof modified === "number" || typeof modified === "string" ? modified : undefined,
		i18n.language,
	)
	return (
		<MagicDropdown
			trigger={["contextMenu"]}
			rootClassName="h-full min-w-0"
			menu={{ items: menuItems }}
			getPopupContainer={() => getPopupContainer() ?? document.body}
		>
			<div
				id={id}
				role="option"
				aria-selected={selected}
				aria-label={name}
				draggable
				data-manager-item={item.file_id}
				data-manager-target={isDirectory ? item.file_id : undefined}
				onClick={(event) => {
					if (event.target instanceof Node && event.currentTarget.contains(event.target))
						onSelect(event)
				}}
				onDoubleClick={(event) => {
					if (event.target instanceof Node && event.currentTarget.contains(event.target))
						onOpen()
				}}
				className={cn(
					"group relative h-full w-full min-w-0 cursor-default select-none rounded-md text-xs transition-colors duration-150 motion-reduce:transition-none",
					grid
						? "flex flex-col items-center gap-1 px-1 py-2"
						: "grid grid-cols-[minmax(0,1fr)_80px] items-center gap-2 px-3 sm:grid-cols-[minmax(0,1fr)_80px_170px]",
					!grid &&
						(selected
							? "bg-blue-500 text-white"
							: striped
								? "bg-muted/35 hover:bg-muted/60"
								: "hover:bg-muted/40"),
					!grid && focused && "ring-1 ring-inset ring-blue-500",
					cut && "opacity-45",
					"data-[manager-drop-target=true]:bg-blue-500/10 data-[manager-drop-target=true]:ring-1 data-[manager-drop-target=true]:ring-inset data-[manager-drop-target=true]:ring-blue-500",
				)}
			>
				<div
					className={cn(
						"flex min-w-0",
						grid ? "flex-col items-center gap-1.5" : "items-center gap-1.5",
					)}
					style={!grid ? { paddingLeft: (row?.level ?? 0) * 16 } : undefined}
				>
					{!grid && (
						<button
							tabIndex={-1}
							className={cn(
								"flex size-4 shrink-0 items-center justify-center rounded",
								!row?.expandable && "invisible",
							)}
							disabled={!row?.expandable || item.directoryLoadState === "loading"}
							aria-expanded={row?.expanded}
							aria-label={t(
								item.directoryLoadState === "error"
									? "userSpace.retry"
									: row?.expanded
										? "fileTree.collapseAll"
										: "fileTree.expandAll",
							)}
							onDoubleClick={(event) => event.stopPropagation()}
							onClick={(event) => {
								event.stopPropagation()
								onToggleFolder(event.altKey)
							}}
						>
							{item.directoryLoadState === "loading" ? (
								<Loader2 size={12} className="animate-spin" />
							) : item.directoryLoadState === "error" ? (
								<RotateCw size={12} />
							) : (
								<ChevronRight
									size={12}
									className={cn(
										"transition-transform duration-150 motion-reduce:transition-none",
										row?.expanded && "rotate-90",
									)}
								/>
							)}
						</button>
					)}
					<span
						className={cn(
							"flex shrink-0 items-center justify-center rounded-md",
							grid && "h-[53px] w-[66px] group-hover:bg-muted/60",
							grid && selected && "bg-muted/80",
							grid && focused && "ring-1 ring-blue-500",
						)}
					>
						<FileResourceIcon presentation={presentation} size={grid ? 44 : 16} />
					</span>
					<MagicTooltip title={name} getPopupContainer={getPopupContainer}>
						<span
							className={cn(
								"min-w-0 max-w-full",
								grid
									? "line-clamp-2 rounded px-1.5 py-0.5 text-center leading-4 [overflow-wrap:anywhere]"
									: "truncate",
								grid && selected && "bg-blue-500 text-white",
							)}
						>
							{name}
						</span>
					</MagicTooltip>
					{!grid && <span className="ml-auto shrink-0">{fileTag}</span>}
				</div>
				{grid ? (
					fileTag && (
						<span className="flex max-w-full justify-center text-muted-foreground">
							{fileTag}
						</span>
					)
				) : (
					<>
						<span
							className={cn(
								"truncate text-[11px]",
								selected ? "text-white/85" : "text-muted-foreground",
							)}
						>
							{isDirectory
								? t("userSpace.folder")
								: item.file_extension?.toUpperCase() || t("userSpace.file")}
						</span>
						<MagicTooltip title={date} getPopupContainer={getPopupContainer}>
							<span
								className={cn(
									"hidden truncate text-[11px] sm:block",
									selected ? "text-white/85" : "text-muted-foreground",
								)}
							>
								{date}
							</span>
						</MagicTooltip>
					</>
				)}
				<MagicDropdown
					trigger={["click"]}
					menu={{ items: menuItems }}
					getPopupContainer={() => getPopupContainer() ?? document.body}
				>
					<Button
						size="icon"
						variant="ghost"
						className="absolute right-1 top-1 size-6 opacity-0 focus:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
						aria-label={t("userSpace.actions", { name })}
						onClick={(event) => {
							event.stopPropagation()
							if (!selected) onSelect(event)
						}}
					>
						<MoreHorizontal size={16} />
					</Button>
				</MagicDropdown>
			</div>
		</MagicDropdown>
	)
})

/** 明确按当前界面时区展示；无时区的服务端时间按 UTC 解析。 */
function formatDirectoryFileTime(value: string | number | undefined, locale?: string): string {
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
