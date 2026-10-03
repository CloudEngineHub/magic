import { useId, type MouseEventHandler, type ReactNode } from "react"
import { observer } from "mobx-react-lite"
import {
	ChevronRight,
	CircleAlert,
	CircleCheck,
	CircleX,
	File,
	Folder,
	LocateFixed,
	Loader2,
} from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"
import { cn } from "@/utils/cn"
import { getOperationResultListData } from "@/pages/superMagic/utils/toolDetailDisplay"
import { focusCanvasElementByProjectPath } from "@/pages/superMagic/components/Detail/contents/Design/utils/toolDesignProjectInfo"
import { useMessageListProjectFilesStore } from "@/pages/superMagic/components/MessageList/context"
import { ToolIconBadge } from "../../../shared/ToolIconConfig"
import { useToggleWithScrollPreserve } from "../hooks/useToggleWithScrollPreserve"

interface OperationResultListProps {
	toolData: {
		id?: string
		name?: string
		action?: ReactNode
		remark?: string
		status?: string
		detail?: unknown
	}
	loading?: boolean
	className?: string
	onMouseEnter?: MouseEventHandler
	onMouseLeave?: MouseEventHandler
}

function OperationResultList({
	toolData,
	loading = false,
	className,
	onMouseEnter,
	onMouseLeave,
}: OperationResultListProps) {
	const { t } = useTranslation("super")
	const filesStore = useMessageListProjectFilesStore()
	const contentId = useId()
	// 沿用消息作用域和滚动保护；虚拟行重新挂载仍保留用户的展开选择。
	const [open, toggle] = useToggleWithScrollPreserve(false, "operation-result-list-expanded")
	const data = getOperationResultListData(toolData.detail)
	const settled = !loading && (toolData.status === "finished" || toolData.status === "error")
	const items = settled ? data?.items : undefined
	const failedCount = items?.filter((item) => item.status === "error").length ?? 0
	const successCount = (items?.length ?? 0) - failedCount
	const singleItem = items?.length === 1 ? items[0] : undefined
	const statusClass = !items
		? "text-muted-foreground"
		: failedCount === 0
			? "text-success"
			: successCount === 0
				? "text-destructive"
				: "text-warning"
	const StatusIcon = !items
		? CircleAlert
		: failedCount === 0
			? CircleCheck
			: successCount === 0
				? CircleX
				: CircleAlert
	const unavailable = loading
		? t("operationResultList.running")
		: toolData.status === "suspended"
			? t("operationResultList.interrupted")
			: t("operationResultList.unavailable")
	const summary = items
		? singleItem?.message ||
			toolData.remark ||
			t("operationResultList.summary", { success: successCount, error: failedCount })
		: unavailable

	return (
		<div
			className={cn("h-fit w-full flex-none", className)}
			data-tool={toolData.id}
			onMouseEnter={onMouseEnter}
			onMouseLeave={onMouseLeave}
		>
			<div
				className={cn(
					"inline-flex max-w-full flex-col rounded-md border border-border bg-card shadow-sm",
					open ? "w-full" : "w-fit",
				)}
			>
				<Button
					type="button"
					variant="ghost"
					onClick={toggle}
					aria-expanded={open}
					aria-controls={contentId}
					className="h-auto min-h-7 w-full justify-start gap-1.5 whitespace-normal p-1.5 text-left text-xs font-normal focus-visible:ring-inset"
				>
					<ToolIconBadge toolName={toolData.name} />
					<span className="shrink-0">
						{toolData.action || t("operationResultList.title")}
					</span>
					{singleItem && (
						<span className="min-w-0 break-all text-muted-foreground">
							{singleItem.kind === "text"
								? singleItem.label
								: singleItem.label.split("/").pop()}
						</span>
					)}
					<span
						className={cn(
							"inline-flex min-w-0 items-center gap-1 break-words",
							statusClass,
						)}
						aria-live="polite"
					>
						{loading ? (
							<Loader2 size={16} className="shrink-0 animate-spin" aria-hidden />
						) : (
							<StatusIcon size={16} className="shrink-0" aria-hidden />
						)}
						{summary}
					</span>
					<ChevronRight
						size={16}
						aria-hidden
						className={cn(
							"ml-auto shrink-0 transition-transform motion-reduce:transition-none",
							open && "rotate-90",
						)}
					/>
				</Button>
				{open && (
					<div id={contentId} className="border-t border-border px-3 py-2">
						{items ? (
							<ul className="m-0 list-none divide-y divide-border p-0">
								{items.map((item, index) => {
									const ItemIcon = item.kind === "directory" ? Folder : File
									const ResultIcon =
										item.status === "success" ? CircleCheck : CircleX
									const target = item.target
									const resultBody = (
										<>
											<div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
												<span className="min-w-0 break-all text-foreground">
													{item.label}
													{target && (
														<LocateFixed
															size={14}
															className="ml-1 inline-block text-muted-foreground"
															aria-hidden
														/>
													)}
												</span>
												<span
													className={cn(
														"inline-flex items-center gap-1",
														item.status === "success"
															? "text-success"
															: "text-destructive",
													)}
												>
													<ResultIcon
														size={16}
														className="shrink-0"
														aria-hidden
													/>
													{item.message}
												</span>
											</div>
											{item.description && (
												<p className="mb-0 mt-1 break-words text-muted-foreground">
													{item.description}
												</p>
											)}
										</>
									)
									return (
										<li
											key={`${item.label}-${index}`}
											className="flex items-start gap-2 py-2 text-xs"
										>
											{item.kind !== "text" && (
												<ItemIcon
													size={16}
													className="shrink-0 text-muted-foreground"
													aria-label={
														item.kind === "directory"
															? t("operationResultList.directory")
															: t("operationResultList.file")
													}
												/>
											)}
											{target ? (
												<button
													type="button"
													className="min-w-0 flex-1 rounded-sm text-left hover:bg-fill-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
													aria-label={t(
														"operationResultList.locateCanvasElement",
														{
															label: item.label,
														},
													)}
													onClick={(event) => {
														event.stopPropagation()
														focusCanvasElementByProjectPath({
															projectPath: target.project_path,
															elementId: target.element_id,
															filesStore,
														})
													}}
												>
													{resultBody}
												</button>
											) : (
												<div className="min-w-0 flex-1">{resultBody}</div>
											)}
										</li>
									)
								})}
							</ul>
						) : (
							<p className="m-0 text-xs text-muted-foreground">{unavailable}</p>
						)}
					</div>
				)}
			</div>
		</div>
	)
}

export default observer(OperationResultList)
