import {
	ArrowLeft,
	ArrowRight,
	ArrowUp,
	ChevronRight,
	Copy,
	FolderPlus,
	LayoutGrid,
	List,
	Scissors,
	ClipboardPaste,
	Search,
	Upload,
	RefreshCw,
	Trash2,
} from "lucide-react"
import { Fragment } from "react"
import { useTranslation } from "react-i18next"
import MagicTooltip from "@/components/base/MagicTooltip"
import { Button } from "@/components/shadcn-ui/button"
import { Input } from "@/components/shadcn-ui/input"
import { cn } from "@/utils/cn"
import type {
	FileManagerActions,
	FileManagerPathItem,
	FileManagerSort,
	FileManagerView,
} from "./types"

interface Props {
	onOpenRecycle: () => void
	path: FileManagerPathItem[]
	canBack: boolean
	canForward: boolean
	canUp: boolean
	back: () => void
	forward: () => void
	up: () => void
	onNavigate: (id: string) => void
	query: string
	onQuery: (query: string) => void
	view: FileManagerView
	onView: (view: FileManagerView) => void
	sort: FileManagerSort
	onSort: (sort: FileManagerSort) => void
	onRefresh: () => void
	loading: boolean
	actions?: FileManagerActions
	getPopupContainer: () => HTMLElement | null
}

export function FileManagerToolbar(props: Props) {
	const { t } = useTranslation("super")
	const navigation = [
		{
			label: t("fileManager.back"),
			Icon: ArrowLeft,
			run: props.back,
			disabled: !props.canBack,
		},
		{
			label: t("fileManager.forward"),
			Icon: ArrowRight,
			run: props.forward,
			disabled: !props.canForward,
		},
		{ label: t("fileManager.up"), Icon: ArrowUp, run: props.up, disabled: !props.canUp },
	]
	const commands = [
		{
			command: "createFolder",
			label: t("fileManager.newFolder"),
			Icon: FolderPlus,
			text: true,
		},
		{ command: "upload", label: t("userSpace.upload"), Icon: Upload, text: true },
		{ command: "cut", label: t("fileManager.cut"), Icon: Scissors },
		{ command: "copy", label: t("fileManager.copy"), Icon: Copy },
		{ command: "paste", label: t("fileManager.paste"), Icon: ClipboardPaste },
	] as const
	return (
		<>
			<div className="flex shrink-0 flex-wrap items-center gap-1 px-3 pb-1 pt-2">
				{navigation.map(({ label, Icon, run, disabled }) => (
					<MagicTooltip
						key={label}
						title={label}
						getPopupContainer={props.getPopupContainer}
					>
						<Button
							variant="ghost"
							size="icon"
							className="size-7"
							aria-label={label}
							onClick={run}
							disabled={disabled}
						>
							<Icon size={16} />
						</Button>
					</MagicTooltip>
				))}
				<nav
					aria-label={t("fileManager.path")}
					className="flex min-w-0 flex-1 items-center overflow-x-auto"
				>
					{props.path.map((part, index) => (
						<div key={part.id} className="flex min-w-0 shrink-0 items-center">
							{index > 0 && (
								<ChevronRight
									size={16}
									className="shrink-0 text-muted-foreground"
								/>
							)}
							<MagicTooltip
								title={part.name}
								getPopupContainer={props.getPopupContainer}
							>
								<Button
									variant="ghost"
									size="sm"
									className={cn(
										"h-7 max-w-44 truncate px-2 text-xs font-normal",
										"data-[manager-drop-target=true]:bg-blue-500/10 data-[manager-drop-target=true]:ring-1 data-[manager-drop-target=true]:ring-inset data-[manager-drop-target=true]:ring-blue-500",
									)}
									aria-current={
										index === props.path.length - 1 ? "page" : undefined
									}
									onClick={() => props.onNavigate(part.id)}
									data-manager-target={part.id}
								>
									{part.name}
								</Button>
							</MagicTooltip>
						</div>
					))}
				</nav>
				<Button
					variant="ghost"
					size="sm"
					className="ml-auto h-7 gap-1.5 text-xs font-normal text-muted-foreground"
					onClick={props.onOpenRecycle}
				>
					<Trash2 size={14} />
					{t("fileManager.recycle.title")}
				</Button>
			</div>
			<div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border/60 px-3 pb-2 pt-1">
				{commands.map(({ command, label, Icon, ...option }) => (
					<Fragment key={command}>
						{command === "cut" && (
							<span aria-hidden className="mx-1 h-4 w-px bg-border/60" />
						)}
						<MagicTooltip
							key={command}
							title={label}
							getPopupContainer={props.getPopupContainer}
						>
							<Button
								variant="ghost"
								size="sm"
								className={cn(
									"h-7 gap-1.5 rounded-md px-2 text-xs font-normal",
									!("text" in option) && "w-7 px-0",
								)}
								disabled={!props.actions?.canExecute(command)}
								onClick={() => props.actions?.execute(command)}
								aria-label={label}
							>
								<Icon size={16} />
								{"text" in option && label}
							</Button>
						</MagicTooltip>
					</Fragment>
				))}
				<div className="flex-1" />
				<select
					aria-label={t("fileManager.sort")}
					className="h-7 max-w-28 rounded-md bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
					value={props.sort}
					onChange={(event) => props.onSort(event.target.value as FileManagerSort)}
				>
					<option value="name">{t("fileManager.sortName")}</option>
					<option value="modified">{t("fileManager.sortModified")}</option>
					<option value="type">{t("fileManager.sortType")}</option>
				</select>
				<div className="flex items-center gap-0.5 rounded-lg bg-muted/60 p-0.5">
					{(
						[
							{ view: "grid", Icon: LayoutGrid, label: t("userSpace.gridView") },
							{ view: "list", Icon: List, label: t("userSpace.listView") },
						] as const
					).map(({ view, Icon, label }) => (
						<MagicTooltip
							key={view}
							title={label}
							getPopupContainer={props.getPopupContainer}
						>
							<Button
								variant="ghost"
								size="icon"
								className={cn(
									"h-6 w-7 rounded-md",
									props.view === view &&
										"bg-background shadow-sm hover:bg-background",
								)}
								aria-label={label}
								aria-pressed={props.view === view}
								onClick={() => props.onView(view)}
							>
								<Icon size={16} />
							</Button>
						</MagicTooltip>
					))}
				</div>
				<div className="relative w-40 min-w-24">
					<Search
						size={16}
						className="pointer-events-none absolute left-2 top-1.5 text-muted-foreground"
					/>
					<Input
						value={props.query}
						onChange={(event) => props.onQuery(event.target.value)}
						placeholder={t("userSpace.searchDirectory")}
						aria-label={t("userSpace.searchDirectory")}
						className="h-7 rounded-md bg-muted/30 pl-8 text-xs"
					/>
				</div>
				<MagicTooltip
					title={t("fileViewer.tabs.refresh")}
					getPopupContainer={props.getPopupContainer}
				>
					<Button
						variant="ghost"
						size="icon"
						className="size-7"
						aria-label={t("fileViewer.tabs.refresh")}
						onClick={props.onRefresh}
						disabled={props.loading}
					>
						<RefreshCw size={16} />
					</Button>
				</MagicTooltip>
			</div>
		</>
	)
}
