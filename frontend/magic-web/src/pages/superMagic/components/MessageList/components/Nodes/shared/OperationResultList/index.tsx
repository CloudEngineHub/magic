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
	const StatusIcon = loading ? Loader2 : CircleAlert
	// 展开时由明细转圈；只有明细全部失败或不可用时，头部仍负责执行反馈。
	const showHeaderSpinner =
		loading && (!open || Boolean(items?.length && (resultUnavailable || successCount === 0)))
	// 展开只增加明细，不替换汇总；成功和失败各自着色，用户无需滚动数结果。
	const summary = (
		<span
			className="inline-flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-xs leading-4"
			aria-live="polite"
		>
			{resultUnavailable || !items ? (
				<span className="inline-flex min-w-0 items-center gap-1.5 text-muted-foreground">
					{(!loading || showHeaderSpinner) && (
						<StatusIcon
							size={16}
							aria-hidden
							className={cn("shrink-0", loading && "animate-spin")}
						/>
					)}
					<span className="[overflow-wrap:anywhere]">{unavailable}</span>
				</span>
			) : (
				<>
					{(successCount > 0 || loading) && (
						<span
							className={cn(
								"inline-flex items-center gap-1.5 whitespace-nowrap",
								loading ? "text-muted-foreground" : "text-success",
							)}
						>
							{showHeaderSpinner ? (
								<Loader2 size={16} aria-hidden className="shrink-0 animate-spin" />
							) : !loading ? (
								<CircleCheck size={16} aria-hidden className="shrink-0" />
							) : null}
							{loading
								? successCount > 0
									? t("operationResultList.summaryProcessing", {
											count: successCount,
										})
									: t("operationResultList.running")
								: t("operationResultList.summarySucceeded", {
										count: successCount,
									})}
						</span>
					)}
					{failedCount > 0 && (
						<span className="inline-flex items-center gap-1.5 whitespace-nowrap text-destructive">
							<CircleX size={16} aria-hidden className="shrink-0" />
							{t("operationResultList.summaryFailed", { count: failedCount })}
						</span>
					)}
				</>
			)}
		</span>
	)
	const remark = items?.length === 1 ? items[0].label : toolData.remark?.trim()

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
					className="grid h-auto min-h-10 w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 gap-y-1 rounded-none px-3 py-2 text-left text-xs font-normal hover:bg-muted/30 focus-visible:ring-inset"
				>
					<span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
						<span className="flex min-w-0 flex-1 basis-40 items-center gap-2">
							<ToolIconBadge toolName={toolData.name} size={20} iconSize={12} />
							<span className="min-w-0 whitespace-normal text-sm leading-5 text-foreground">
								{toolData.action || t("operationResultList.title")}
							</span>
						</span>
						{summary}
					</span>
					<ChevronRight
						size={16}
						aria-hidden
						className={cn(
							"mt-0.5 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none",
							open && "rotate-90",
						)}
					/>
					{!open && remark && (
						<SmartTooltip
							fileName
							elementType="span"
							placement="top"
							align="start"
							className="min-w-0 pl-7 text-xs leading-4 text-muted-foreground"
						>
							{remark}
						</SmartTooltip>
					)}
				</Button>
				{open && (
					<div id={contentId} className="border-t border-border">
						{items?.length ? (
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
											onLocate={(target, showDetails) =>
												focusCanvasElementByProjectPath({
													projectPath: target.project_path,
													elementId: target.element_id,
													contentId: target.content_id,
													showGenerationDetails: showDetails,
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
