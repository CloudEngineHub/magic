import type { KeyboardEvent, ReactNode } from "react"
import { ChevronRight, MoreHorizontal } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"
import { Checkbox } from "@/components/shadcn-ui/checkbox"
import MagicDropdown from "@/components/base/MagicDropdown"
import { cn } from "@/utils/cn"
import { FileResourceIcon } from "./FileResourceIcon"
import type { FilePresentation } from "../utils/file-presentation"
import type { TopicFilesMenuItem } from "../utils/menu-items"
import { handleAttachmentDragEnd, handleAttachmentDragStart } from "../../MessageEditor/utils/drag"

interface CommonProps {
	presentation: FilePresentation
	grid?: boolean
	icon?: ReactNode
	tag?: ReactNode
}
interface InteractiveProps extends CommonProps {
	mode: "files"
	index: number
	active: boolean
	selecting: boolean
	selected: boolean
	selectable: boolean
	modified: string
	menuItems: TopicFilesMenuItem[]
	onToggle: () => void
	onOpen: () => void
	onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void
}
interface ExampleProps extends CommonProps {
	mode: "example"
	depth: number
	expanded: boolean
	onExpand: () => void
	description?: string
}

/** 真实目录与教学示例复用整行；示例不挂载菜单、选择、拖拽或打开文件的事件。 */
export function FileDirectoryRow(props: InteractiveProps | ExampleProps) {
	const { presentation, grid = false, icon, tag } = props
	const { item: file, name, isDirectory } = presentation
	const { t } = useTranslation("super")
	const size = grid ? 36 : 16
	const identity = (
		<>
			{icon ?? <FileResourceIcon presentation={presentation} size={size} />}
			<span data-file-name className="min-w-0 max-w-full truncate">
				{name}
			</span>
		</>
	)
	const row = (
		<div
			className={cn(
				"group relative min-w-0 rounded-md hover:bg-accent",
				grid
					? "flex flex-col items-center justify-center border p-2"
					: "flex min-h-11 items-center gap-2 px-1",
				props.mode === "files" && props.active && "bg-accent",
			)}
		>
			<div
				data-file-label-row={!grid || undefined}
				className={cn("flex min-w-0 items-center gap-2 py-1", grid ? "w-full" : "flex-1")}
				style={
					props.mode === "example" ? { paddingInlineStart: props.depth * 20 } : undefined
				}
			>
				{props.mode === "example" &&
					(isDirectory ? (
						<button
							type="button"
							className="flex size-5 shrink-0 items-center justify-center rounded hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
							aria-label={name}
							aria-expanded={props.expanded}
							onClick={props.onExpand}
						>
							<ChevronRight
								size={14}
								className={cn(
									"transition-transform motion-reduce:transition-none",
									props.expanded && "rotate-90",
								)}
							/>
						</button>
					) : (
						<span className="size-5 shrink-0" />
					))}
				{props.mode === "files" && props.selecting && (
					<Checkbox
						disabled={!props.selectable}
						aria-label={t("userSpace.selectName", { name })}
						checked={props.selected}
						onCheckedChange={props.onToggle}
					/>
				)}
				{props.mode === "files" ? (
					<button
						data-file-index={props.index}
						data-file-name-container
						className={cn(
							"flex min-w-0 flex-1 items-center gap-2 rounded text-left text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring",
							grid && "flex-col text-center",
						)}
						draggable
						onDragStart={(event) => handleAttachmentDragStart(event, file)}
						onDragEnd={handleAttachmentDragEnd}
						onKeyDown={props.onKeyDown}
						onClick={props.onOpen}
						title={name}
					>
						{identity}
					</button>
				) : (
					<div
						data-file-name-container
						className="flex min-w-0 flex-1 items-center gap-2 text-xs"
						title={name}
					>
						{identity}
					</div>
				)}
				{props.mode === "example" ? (
					<span className="min-w-0 flex-1 text-xs text-muted-foreground">
						{props.description}
					</span>
				) : (
					<div
						data-file-tag
						className={cn(
							"ml-auto flex max-w-full shrink-0 empty:hidden",
							grid && "w-full justify-center",
						)}
					>
						{tag}
					</div>
				)}
			</div>
			{props.mode === "files" && (
				<>
					{!grid && (
						<>
							<span className="w-20 shrink-0 truncate text-xs text-muted-foreground">
								{isDirectory
									? t("userSpace.folder")
									: file.file_extension?.toUpperCase() || t("userSpace.file")}
							</span>
							<span
								className="hidden w-44 shrink-0 truncate text-xs text-muted-foreground sm:block"
								title={props.modified}
							>
								{props.modified}
							</span>
						</>
					)}
					<MagicDropdown trigger={["click"]} menu={{ items: props.menuItems }}>
						<Button
							variant="ghost"
							size="icon"
							className={cn("size-7 shrink-0", grid && "absolute right-2 top-1")}
							aria-label={t("userSpace.actions", { name })}
						>
							<MoreHorizontal size={16} />
						</Button>
					</MagicDropdown>
				</>
			)}
		</div>
	)
	return props.mode === "files" ? (
		<MagicDropdown trigger={["contextMenu"]} menu={{ items: props.menuItems }}>
			{row}
		</MagicDropdown>
	) : (
		row
	)
}
