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
} from "lucide-react"
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
	dropTarget: string | null
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
			<div className="flex shrink-0 flex-wrap items-center gap-1 border-b px-3 py-2">
				{navigation.map(({ label, Icon, run, disabled }) => (
					<MagicTooltip
						key={label}
						title={label}
						getPopupContainer={props.getPopupContainer}
					>
						<Button
							variant="ghost"
							size="icon"
							className="size-8"
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
										"h-8 max-w-44 truncate px-2",
										props.dropTarget === part.id &&
											"ring-2 ring-inset ring-primary",
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
				<div className="relative w-44 min-w-24">
					<Search
						size={16}
						className="pointer-events-none absolute left-2 top-2 text-muted-foreground"
					/>
					<Input
						value={props.query}
						onChange={(event) => props.onQuery(event.target.value)}
						placeholder={t("userSpace.searchDirectory")}
						aria-label={t("userSpace.searchDirectory")}
						className="h-8 bg-muted/30 pl-8 text-xs"
					/>
				</div>
			</div>
			<div className="flex shrink-0 flex-wrap items-center gap-1 border-b px-3 py-2">
				{commands.map(({ command, label, Icon, ...option }) => (
					<MagicTooltip
						key={command}
						title={label}
						getPopupContainer={props.getPopupContainer}
					>
						<Button
							variant="ghost"
							size="sm"
							className={cn("h-8 gap-2 text-xs", !("text" in option) && "w-8 px-0")}
							disabled={!props.actions?.canExecute(command)}
							onClick={() => props.actions?.execute(command)}
							aria-label={label}
						>
							<Icon size={16} />
							{"text" in option && label}
						</Button>
					</MagicTooltip>
				))}
				<div className="flex-1" />
				<select
					aria-label={t("fileManager.sort")}
					className="h-8 max-w-28 rounded-md bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
					value={props.sort}
					onChange={(event) => props.onSort(event.target.value as FileManagerSort)}
				>
					<option value="name">{t("fileManager.sortName")}</option>
					<option value="modified">{t("fileManager.sortModified")}</option>
					<option value="type">{t("fileManager.sortType")}</option>
				</select>
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
							variant={props.view === view ? "secondary" : "ghost"}
							size="icon"
							className="size-8"
							aria-label={label}
							aria-pressed={props.view === view}
							onClick={() => props.onView(view)}
						>
							<Icon size={16} />
						</Button>
					</MagicTooltip>
				))}
				<MagicTooltip
					title={t("fileViewer.tabs.refresh")}
					getPopupContainer={props.getPopupContainer}
				>
					<Button
						variant="ghost"
						size="icon"
						className="size-8"
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
