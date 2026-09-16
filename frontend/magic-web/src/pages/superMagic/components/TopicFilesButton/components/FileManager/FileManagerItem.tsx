import {
	memo,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
	type MouseEvent,
	type ReactNode,
} from "react"
import { useMemoizedFn } from "ahooks"
import { useTranslation } from "react-i18next"
import { cn } from "@/utils/cn"
import SmartTooltip from "@/components/other/SmartTooltip"
import MagicTooltip from "@/components/base/MagicTooltip"
import MagicDropdown from "@/components/base/MagicDropdown"
import { MoreHorizontal, ChevronRight, Loader2, RotateCw } from "lucide-react"
import { Button } from "@/components/shadcn-ui/button"
import type { TopicFilesMenuItem } from "../../utils/menu-items"
import { FileResourceIcon } from "../FileResourceIcon"
import { ProjectFileTag } from "../TopicFileTag"
import type { FilePresentation } from "../../utils/file-presentation"
import type { FileManagerView, FileManagerTreeRow, FileManagerSort } from "./types"
import type { useRename } from "../../hooks/useRename"
import InputWithError from "../InputWithError"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/shadcn-ui/tooltip"

interface Props {
	columns: FileManagerSort[]
	getColumnText: (file: FilePresentation, column: FileManagerSort) => string
	rename?: ReturnType<typeof useRename>
	showActions: boolean
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
	columns,
	getColumnText,
	rename,
	showActions,
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
	const { t } = useTranslation("super")
	const grid = view === "grid"
	const { item, name, isDirectory } = presentation
	const fileTag = tag ?? <ProjectFileTag item={item} presentation={presentation} />
	return (
		<MagicDropdown
			overlayClassName="[&_[role=menuitem]]:cursor-pointer [&_[data-disabled]]:cursor-not-allowed"
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
				draggable={!rename}
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
				style={!grid ? { gridTemplateColumns: "var(--manager-columns)" } : undefined}
				className={cn(
					"group relative h-full w-full min-w-0 cursor-pointer select-none rounded-md text-xs outline-none transition-colors duration-150 motion-reduce:transition-none",
					grid ? "flex flex-col items-center gap-1 px-1 py-2" : "grid items-center px-3",
					!grid &&
						(selected
							? "bg-blue-500 text-white"
							: striped
								? "bg-muted/35 hover:bg-muted/60"
								: "hover:bg-muted/40"),
					!grid && focused && !selected && "bg-muted/60",
					cut && "opacity-45",
					"data-[manager-drop-target=true]:bg-blue-500/10 data-[manager-drop-target=true]:ring-1 data-[manager-drop-target=true]:ring-inset data-[manager-drop-target=true]:ring-blue-500",
				)}
			>
				<div
					className={cn(
						"flex min-w-0",
						grid ? "flex-col items-center gap-1.5" : "items-center gap-1.5 px-2",
					)}
					style={!grid ? { paddingLeft: (row?.level ?? 0) * 16 } : undefined}
				>
					{!grid && (
						<button
							tabIndex={-1}
							className={cn(
								"flex size-4 shrink-0 cursor-pointer items-center justify-center rounded disabled:cursor-not-allowed",
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
							"pointer-events-none flex shrink-0 items-center justify-center rounded-md",
							grid && "h-16 w-[72px] rounded-[9px] group-hover:bg-muted/60",
							grid && selected && "bg-muted/80",
							grid && focused && "bg-muted/80",
						)}
					>
						<FileResourceIcon
							presentation={presentation}
							size={grid ? 44 : 16}
							className={
								grid && !isDirectory
									? "drop-shadow-[0_1px_2px_rgba(0,0,0,0.18)]"
									: undefined
							}
						/>
					</span>
					{rename ? (
						<FileManagerNameInput
							rename={rename}
							grid={grid}
							isDirectory={isDirectory}
							getPopupContainer={getPopupContainer}
						/>
					) : (
						<SmartTooltip
							fileName
							elementType="span"
							placement="bottom"
							sideOffset={4}
							maxLines={grid ? 2 : 1}
							getPopupContainer={getPopupContainer}
							className={cn(
								"min-w-0 max-w-full",
								grid
									? "line-clamp-2 rounded-[5px] px-1 py-px text-center text-[13px] font-medium leading-[17px] tracking-normal [overflow-wrap:anywhere]"
									: "truncate text-xs leading-4",
								grid && selected && "bg-blue-600 text-white dark:bg-blue-500",
								focused && !selected && "underline underline-offset-4",
							)}
						>
							{name}
						</SmartTooltip>
					)}
					{!grid && <span className="ml-auto shrink-0">{fileTag}</span>}
				</div>
				{grid
					? fileTag && (
							<span className="flex max-w-full justify-center text-muted-foreground">
								{fileTag}
							</span>
						)
					: columns
							.filter((column) => column !== "name")
							.map((column) => {
								const value = getColumnText(presentation, column)
								return (
									<MagicTooltip
										key={column}
										title={value}
										getPopupContainer={getPopupContainer}
									>
										<span
											className={cn(
												"truncate px-2 text-[11px]",
												column === "size" && "text-right tabular-nums",
												selected
													? "text-white/85"
													: "text-muted-foreground",
											)}
										>
											{value}
										</span>
									</MagicTooltip>
								)
							})}

				{showActions && (
					<MagicDropdown
						overlayClassName="[&_[role=menuitem]]:cursor-pointer [&_[data-disabled]]:cursor-not-allowed"
						trigger={["click"]}
						menu={{ items: menuItems }}
						getPopupContainer={() => getPopupContainer() ?? document.body}
					>
						<Button
							size="icon"
							variant="ghost"
							className="absolute right-1 top-1 size-6 cursor-pointer"
							aria-label={t("userSpace.actions", { name })}
							onClick={(event) => {
								event.stopPropagation()
								if (!selected) onSelect(event)
							}}
						>
							<MoreHorizontal size={16} />
						</Button>
					</MagicDropdown>
				)}
			</div>
		</MagicDropdown>
	)
})

function FileManagerNameInput({
	rename,
	grid,
	isDirectory,
	getPopupContainer,
}: {
	rename: ReturnType<typeof useRename>
	grid: boolean
	isDirectory: boolean
	getPopupContainer: () => HTMLElement | null
}) {
	const { t } = useTranslation("super")
	const measure = useRef<HTMLSpanElement>(null)
	const [width, setWidth] = useState(48)
	const cancel = useMemoizedFn(() => {
		if (!rename.isRenamePending()) rename.handleRenameCancel()
	})
	useLayoutEffect(() => {
		if (measure.current) setWidth(Math.max(48, measure.current.offsetWidth + 14))
	}, [rename.renameValue])
	useEffect(
		() => () => {
			// 虚拟行真正离开 DOM 时丢弃草稿；StrictMode 重跑 effect 时输入仍在页面内。
			if (!rename.renameInputRef.current?.input?.isConnected) cancel()
		},
		[cancel, rename.renameInputRef],
	)
	const error = rename.renameValue.trim()
		? rename.renameErrorMessage
		: t(
				isDirectory
					? "filenameValidator.error.folderEmpty"
					: "filenameValidator.error.fileEmpty",
			)
	return (
		<div
			data-manager-rename
			className={cn("relative min-w-0 max-w-full", grid ? "self-center" : "flex-1")}
			style={grid ? { width } : undefined}
			onPointerDown={(event) => event.stopPropagation()}
			onClick={(event) => event.stopPropagation()}
			onDoubleClick={(event) => event.stopPropagation()}
			onContextMenu={(event) => event.stopPropagation()}
		>
			<span
				ref={measure}
				aria-hidden
				className="pointer-events-none invisible absolute whitespace-pre text-[13px] font-medium leading-[17px] tracking-normal"
			>
				{rename.renameValue}
			</span>
			<Tooltip open={Boolean(error)}>
				<TooltipTrigger asChild>
					<div>
						<InputWithError
							ref={rename.renameInputRef}
							value={rename.renameValue}
							aria-label={t("userSpace.rename")}
							readOnly={rename.renamePending}
							height={grid ? 21 : 20}
							style={{
								cursor: "text",
								textAlign: grid ? "center" : "left",
								fontSize: grid ? 13 : 12,
								fontWeight: grid ? 500 : 400,
								lineHeight: grid ? "17px" : "16px",
								letterSpacing: 0,
								padding: "1px 4px",
							}}
							errorMessage={error}
							onChange={(event) => rename.setRenameValue(event.target.value)}
							onBlur={cancel}
							onKeyDown={(event) => {
								event.stopPropagation()
								if (
									event.nativeEvent.isComposing ||
									event.repeat ||
									rename.isRenamePending()
								)
									return
								if (event.key === "Escape") {
									event.preventDefault()
									cancel()
								}
								if (
									event.key === "Enter" &&
									!event.metaKey &&
									!event.ctrlKey &&
									!event.altKey &&
									!event.shiftKey
								) {
									event.preventDefault()
									if (rename.renameValue.trim()) void rename.handleRenameConfirm()
								}
							}}
						/>
					</div>
				</TooltipTrigger>
				{error && (
					<TooltipContent container={getPopupContainer() ?? undefined} side="bottom">
						<span role="alert">{error}</span>
					</TooltipContent>
				)}
			</Tooltip>
		</div>
	)
}
