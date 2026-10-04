import { useId, type MouseEventHandler, type ReactNode } from "react"
import { observer } from "mobx-react-lite"
import { ChevronRight, CircleAlert, CircleCheck, CircleX, Loader2 } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"
import { ScrollArea } from "@/components/shadcn-ui/scroll-area"
import SmartTooltip from "@/components/other/SmartTooltip"
import { cn } from "@/utils/cn"
import { getOperationResultListData } from "@/pages/superMagic/utils/toolDetailDisplay"
import { focusCanvasElementByProjectPath } from "@/pages/superMagic/components/Detail/contents/Design/utils/toolDesignProjectInfo"
import { useMessageListProjectFilesStore } from "@/pages/superMagic/components/MessageList/context"
import { ToolIconBadge } from "../../../shared/ToolIconConfig"
import { useToggleWithScrollPreserve } from "../hooks/useToggleWithScrollPreserve"
import OperationResultRow from "./OperationResultRow"

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
	const items = getOperationResultListData(toolData.detail)?.items
	const failedCount = items?.filter((item) => item.status === "error").length ?? 0
	const successCount = (items?.length ?? 0) - failedCount
	// 中断、响应缺失或无失败明细的工具异常可能保留占位行，不能据此宣布成功。
	// 有逐项失败的批次仍保留成功项，避免把部分成功误标为整批不可用。
	const resultUnavailable =
		toolData.status === "suspended" ||
		toolData.status === "response_missing" ||
		(toolData.status === "error" && failedCount === 0)
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
	const StatusIcon = loading
		? Loader2
		: !items || resultUnavailable
			? CircleAlert
			: failedCount === 0
				? CircleCheck
				: successCount === 0
					? CircleX
					: CircleAlert
	const statusClass =
		loading || resultUnavailable || !items
			? "text-muted-foreground"
			: failedCount === 0
				? "text-muted-foreground"
				: successCount === 0
					? "text-destructive"
					: "text-warning"
	const remark =
		(items?.length === 1 ? items[0].label : toolData.remark?.trim()) ||
		(items ? t("operationResultList.itemCount", { count: items.length }) : undefined)

	return (
		<div
			className={cn("h-fit w-full min-w-0 max-w-lg flex-none", className)}
			data-tool={toolData.id}
			onMouseEnter={onMouseEnter}
			onMouseLeave={onMouseLeave}
		>
			{/* 收起、展开共用宽度；名称可收缩，状态与操作不被长名称挤出。 */}
			<div className="min-w-0 overflow-hidden rounded-lg border border-border bg-card">
				<Button
					type="button"
					variant="ghost"
					onClick={toggle}
					aria-expanded={open}
					aria-controls={contentId}
					className="flex h-auto w-full min-w-0 flex-col items-stretch gap-1.5 rounded-none px-3 py-2.5 text-left text-xs font-normal hover:bg-muted/30 focus-visible:ring-inset"
				>
					<span className="flex min-w-0 items-center gap-2">
						<ToolIconBadge toolName={toolData.name} size={20} iconSize={12} />
						<span className="min-w-0 flex-1 whitespace-normal text-sm leading-5 text-foreground">
							{toolData.action || t("operationResultList.title")}
						</span>
						{open && items && items.length > 1 && (
							<span className="shrink-0 text-muted-foreground">
								{t("operationResultList.itemCount", { count: items.length })}
							</span>
						)}
						<ChevronRight
							size={16}
							aria-hidden
							className={cn(
								"shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none",
								open && "rotate-90",
							)}
						/>
					</span>
					{!open && (
						<span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 pl-7">
							{remark && (
								<SmartTooltip
									fileName
									elementType="span"
									placement="top"
									align="start"
									className="min-w-0 flex-1 basis-20 text-xs leading-4 text-muted-foreground"
								>
									{remark}
								</SmartTooltip>
							)}
							<span
								className={cn(
									"ml-auto inline-flex max-w-full shrink-0 items-center gap-1.5 whitespace-normal",
									statusClass,
								)}
								aria-live="polite"
							>
								<StatusIcon
									size={16}
									aria-hidden
									className={cn(
										"shrink-0",
										loading && "animate-spin",
										!loading &&
											!resultUnavailable &&
											items &&
											failedCount === 0 &&
											"text-success",
									)}
								/>
								<span className="min-w-0 [overflow-wrap:anywhere]">
									{statusSummary}
								</span>
							</span>
						</span>
					)}
				</Button>
				{open && (
					<div id={contentId} className="border-t border-border">
						{items ? (
							// Radix 的 table 内容包装会把长名称变成最小宽度，使用块布局让名称在卡片内换行。
							<ScrollArea viewportClassName="max-h-96 [&>div]:!block">
								<ul className="m-0 list-none divide-y divide-border p-0">
									{items.map((item, index) => (
										<OperationResultRow
											key={`${item.label}-${index}`}
											item={item}
											loading={loading}
											unavailable={
												resultUnavailable ? unavailable : undefined
											}
											onLocate={(target) =>
												focusCanvasElementByProjectPath({
													projectPath: target.project_path,
													elementId: target.element_id,
													filesStore,
												})
											}
										/>
									))}
								</ul>
							</ScrollArea>
						) : (
							<p
								className="m-0 flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground"
								aria-live="polite"
							>
								<StatusIcon
									size={16}
									aria-hidden
									className={cn(loading && "animate-spin")}
								/>
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
