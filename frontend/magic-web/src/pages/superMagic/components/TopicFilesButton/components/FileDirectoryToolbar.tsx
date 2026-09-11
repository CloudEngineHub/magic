import {
	FilePlus2,
	FolderPlus,
	LayoutGrid,
	List,
	Search,
	Upload,
	SquareCheck,
	MoveRight,
	Trash2,
	Download,
	RefreshCw,
} from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"
import { Input } from "@/components/shadcn-ui/input"
import { Checkbox } from "@/components/shadcn-ui/checkbox"
import MagicDropdown from "@/components/base/MagicDropdown"
import { cn } from "@/utils/cn"
import type { AttachmentItem } from "../hooks/types"
import type { FileDirectoryViewProps } from "./FileDirectoryView"

interface FileDirectoryToolbarProps extends Pick<
	FileDirectoryViewProps,
	| "onCreate"
	| "onUpload"
	| "onMove"
	| "onDelete"
	| "onDownload"
	| "selectedIds"
	| "onSelectionChange"
	| "onSearchChange"
> {
	compact: boolean
	externalSearch?: string
	search: string
	setSearch: (search: string) => void
	grid: boolean
	setGrid: (grid: boolean) => void
	selecting: boolean
	setSelecting: (selecting: boolean) => void
	loading: boolean
	error: boolean
	visible: AttachmentItem[]
	selectedFiles: AttachmentItem[]
	isSelectable: (file: AttachmentItem) => boolean
	onRefresh: () => void
}

export function FileDirectoryToolbar({
	compact,
	externalSearch,
	search,
	setSearch,
	grid,
	setGrid,
	selecting,
	setSelecting,
	loading,
	error,
	visible,
	selectedFiles,
	isSelectable,
	selectedIds,
	onSelectionChange,
	onSearchChange,
	onCreate,
	onUpload,
	onMove,
	onDelete,
	onDownload,
	onRefresh,
}: FileDirectoryToolbarProps) {
	const { t } = useTranslation("super")
	return (
		<>
			<div
				className={cn(
					"flex shrink-0 flex-wrap items-center gap-1",
					compact ? "px-2 py-1" : "border-b px-4 py-2",
				)}
			>
				{externalSearch === undefined && (
					<div className="relative min-w-20 flex-1">
						<Search size={14} className="absolute left-2 top-2 text-muted-foreground" />
						<Input
							className="h-7 pl-7 text-xs"
							value={search}
							placeholder={t("userSpace.searchDirectory")}
							onChange={(event) => {
								setSearch(event.target.value)
								onSearchChange?.(event.target.value)
							}}
						/>
					</div>
				)}
				{onCreate && (
					<MagicDropdown
						trigger={["click"]}
						menu={{
							items: [
								{
									key: "file",
									label: t("userSpace.createFile"),
									icon: <FilePlus2 size={16} />,
									onClick: () => onCreate(false),
								},
								{
									key: "folder",
									label: t("userSpace.createFolder"),
									icon: <FolderPlus size={16} />,
									onClick: () => onCreate(true),
								},
							],
						}}
					>
						<Button
							variant="ghost"
							size="icon"
							className="size-7"
							aria-label={t("userSpace.create")}
							disabled={loading || error}
						>
							<FilePlus2 size={16} />
						</Button>
					</MagicDropdown>
				)}
				{onUpload && (
					<Button
						variant="ghost"
						size="icon"
						className="size-7"
						aria-label={t("userSpace.upload")}
						onClick={onUpload}
						disabled={loading || error}
					>
						<Upload size={16} />
					</Button>
				)}
				<Button
					variant="ghost"
					size="icon"
					className="size-7"
					aria-label={t("fileViewer.tabs.refresh")}
					onClick={onRefresh}
					disabled={loading}
				>
					<RefreshCw size={16} />
				</Button>
				{(onMove || onDelete) && (
					<Button
						variant={selecting ? "secondary" : "ghost"}
						size="icon"
						className="size-7"
						aria-label={t("userSpace.select")}
						onClick={() => {
							setSelecting(!selecting)
							onSelectionChange(new Set())
						}}
					>
						<SquareCheck size={16} />
					</Button>
				)}
				{!compact && (
					<>
						<Button
							variant={!grid ? "secondary" : "ghost"}
							size="icon"
							className="size-7"
							aria-label={t("userSpace.listView")}
							onClick={() => setGrid(false)}
						>
							<List size={16} />
						</Button>
						<Button
							variant={grid ? "secondary" : "ghost"}
							size="icon"
							className="size-7"
							aria-label={t("userSpace.gridView")}
							onClick={() => setGrid(true)}
						>
							<LayoutGrid size={16} />
						</Button>
					</>
				)}
			</div>
			{selecting && (
				<div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-1 text-xs">
					<Checkbox
						aria-label={t("userSpace.selectAll")}
						checked={
							visible.some(isSelectable) &&
							visible
								.filter(isSelectable)
								.every((item) => selectedIds.has(String(item.file_id)))
						}
						onCheckedChange={(checked) =>
							onSelectionChange(
								new Set(
									checked
										? visible
												.filter(isSelectable)
												.flatMap((file) =>
													file.file_id ? [file.file_id] : [],
												)
										: [],
								),
							)
						}
					/>
					<span>{t("userSpace.selectedCount", { count: selectedFiles.length })}</span>
					{onDownload && (
						<Button
							size="icon"
							variant="ghost"
							className="size-7"
							disabled={!selectedFiles.some((file) => !file.is_directory)}
							aria-label={t("userSpace.downloadSelected")}
							onClick={() =>
								onDownload(selectedFiles.filter((file) => !file.is_directory))
							}
						>
							<Download size={14} />
						</Button>
					)}
					{onMove && (
						<Button
							size="icon"
							variant="ghost"
							className="size-7"
							disabled={!selectedFiles.length}
							aria-label={t("userSpace.move")}
							onClick={() => onMove(selectedFiles)}
						>
							<MoveRight size={14} />
						</Button>
					)}
					{onDelete && (
						<Button
							size="icon"
							variant="ghost"
							className="size-7 text-destructive"
							disabled={!selectedFiles.length}
							aria-label={t("userSpace.delete")}
							onClick={() => onDelete(selectedFiles)}
						>
							<Trash2 size={14} />
						</Button>
					)}
				</div>
			)}
		</>
	)
}
