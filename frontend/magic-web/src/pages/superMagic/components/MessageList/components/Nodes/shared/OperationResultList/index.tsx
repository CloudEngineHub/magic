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
	const items = data?.items
	const failedCount = items?.filter((item) => item.status === "error").length ?? 0
	const successCount = (items?.length ?? 0) - failedCount
	const singleItem = items?.length === 1 ? items[0] : undefined
	// 中断、响应缺失或无失败明细的工具异常可能保留占位行，不能据此宣布成功。
	// 有逐项失败的批次仍保留成功项，避免把部分成功误标为整批不可用。
	const resultUnavailable =
		toolData.status === "suspended" ||
		toolData.status === "response_missing" ||
		(toolData.status === "error" && failedCount === 0)
	const statusClass =
		loading || resultUnavailable
			? "text-muted-foreground"
			: !items
				? "text-muted-foreground"
				: failedCount === 0
					? "text-success"
					: successCount === 0
						? "text-destructive"
						: "text-warning"
	const StatusIcon =
		!items || resultUnavailable
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
	const statusSummary = loading
		? items
			? t("operationResultList.summaryProcessing", { count: items.length })
			: t("operationResultList.running")
		: !items || resultUnavailable
			? unavailable
			: failedCount === 0
				? t("operationResultList.summaryCompleted", { count: successCount })
				: successCount === 0
					? t("operationResultList.summaryFailed", { count: failedCount })
					: t("operationResultList.summary", {
							success: successCount,
							error: failedCount,
						})
	const remark =
		toolData.remark?.trim() || (singleItem?.kind === "text" ? singleItem.label : undefined)
	const headerRemark =
		open && items ? t("operationResultList.itemCount", { count: items.length }) : remark

	return (
		<div
			className={cn("h-fit max-w-full flex-none", className)}
			data-tool={toolData.id}
			onMouseEnter={onMouseEnter}
			onMouseLeave={onMouseLeave}
		>
			<div
				className={cn(
					"inline-flex max-w-full flex-col rounded-md border border-border bg-card shadow-sm",
					open ? "w-full md:max-w-2xl" : "w-fit",
				)}
			>
				<Button
					type="button"
					variant="ghost"
					onClick={toggle}
					aria-expanded={open}
					aria-controls={contentId}
					className={cn(
						"flex h-auto min-h-7 w-full min-w-0 max-w-full items-center gap-1.5 whitespace-nowrap p-1.5 text-left text-xs font-normal hover:bg-transparent focus-visible:ring-inset",
						open && "bg-muted/20 hover:bg-muted/20",
					)}
				>
					<ToolIconBadge toolName={toolData.name} size={16} iconSize={10} />
					<span className="shrink-0 whitespace-nowrap">
						{toolData.action || t("operationResultList.title")}
					</span>
					{headerRemark && (
						<span
							className="min-w-0 flex-1 truncate text-muted-foreground"
							title={headerRemark}
						>
							{headerRemark}
						</span>
					)}
					<span
						className={cn(
							"inline-flex shrink-0 items-center gap-1 whitespace-nowrap",
							statusClass,
						)}
						aria-live="polite"
					>
						{loading ? (
							<Loader2 size={14} className="shrink-0 animate-spin" aria-hidden />
						) : (
							<StatusIcon size={14} className="shrink-0" aria-hidden />
						)}
						{statusSummary}
					</span>
					<ChevronRight
						size={15}
						aria-hidden
						className={cn(
							"ml-0 shrink-0 transition-transform motion-reduce:transition-none",
							open && "rotate-90",
						)}
					/>
				</Button>
				{open && (
					<div id={contentId} className="border-t border-border px-2 py-1.5">
						{items ? (
							<ul className="m-0 list-none space-y-0.5 p-0">
								{items.map((item, index) => {
									const ItemIcon = item.kind === "directory" ? Folder : File
									const ResultIcon =
										item.status === "success" ? CircleCheck : CircleX
									const itemMessage = resultUnavailable
										? unavailable
										: item.message ||
											(loading ? t("operationResultList.running") : "")
									const target = item.target
									const resultBody = (
										<div className="flex min-w-0 items-start gap-2">
											{item.kind !== "text" && (
												<ItemIcon
													size={15}
													className="mt-0.5 shrink-0 text-muted-foreground"
													aria-label={
														item.kind === "directory"
															? t("operationResultList.directory")
															: t("operationResultList.file")
													}
												/>
											)}
											<div className="min-w-0 flex-1">
												<div className="flex min-w-0 items-start gap-2">
													<span
														className="min-w-0 flex-1 truncate text-foreground"
														title={item.label}
													>
														{item.label}
														{target && (
															<LocateFixed
																size={13}
																className="ml-1 inline-block text-muted-foreground"
																aria-hidden
															/>
														)}
													</span>
													<span
														className={cn(
															"inline-flex shrink-0 items-center gap-1 whitespace-nowrap",
															resultUnavailable
																? "text-muted-foreground"
																: item.status === "success" &&
																	  !loading
																	? "text-success"
																	: item.status === "error"
																		? "text-destructive"
																		: "text-muted-foreground",
														)}
													>
														{resultUnavailable ? (
															<CircleAlert
																size={14}
																className="shrink-0"
																aria-hidden
															/>
														) : loading && item.status === "success" ? (
															<Loader2
																size={14}
																className="shrink-0 animate-spin"
																aria-hidden
															/>
														) : (
															<ResultIcon
																size={14}
																className="shrink-0"
																aria-hidden
															/>
														)}
														{itemMessage}
													</span>
												</div>
												{item.description && (
													<p className="mb-0 mt-1 break-words text-muted-foreground">
														{item.description}
													</p>
												)}
											</div>
										</div>
									)
									return (
										<li key={`${item.label}-${index}`} className="text-xs">
											{target ? (
												<button
													type="button"
													className="block w-full min-w-0 rounded px-1.5 py-1 text-left hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
												<div className="px-1.5 py-1">{resultBody}</div>
											)}
										</li>
									)
								})}
							</ul>
						) : (
							<p className="m-0 px-1 py-1 text-xs text-muted-foreground">
								{unavailable}
							</p>
						)}
					</div>
				)}
			</div>
		</div>
	)
}

export default observer(OperationResultList)
