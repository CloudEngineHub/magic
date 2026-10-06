import {
	CircleAlert,
	CircleCheck,
	CircleX,
	File,
	Folder,
	Info,
	Loader2,
	LocateFixed,
} from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"
import { cn } from "@/utils/cn"
import type {
	OperationResultItem,
	OperationResultTarget,
} from "@/pages/superMagic/components/Detail/types"
import { GenerationProgress } from "@/pages/superMagic/components/MessageList/components/shared/ToolGenerationProgress"

interface OperationResultRowProps {
	item: OperationResultItem
	loading: boolean
	unavailable?: string
	progressAnchorKey: string
	onLocate: (target: OperationResultTarget, showDetails?: boolean) => void
}

export default function OperationResultRow({
	item,
	loading,
	unavailable,
	progressAnchorKey,
	onLocate,
}: OperationResultRowProps) {
	const { t } = useTranslation("super")
	const pending = loading && item.status === "success" && !unavailable
	const ResultIcon = unavailable
		? CircleAlert
		: pending
			? Loader2
			: item.status === "error"
				? CircleX
				: CircleCheck
	const ItemIcon = item.kind === "directory" ? Folder : File
	const message = unavailable || (pending ? t("operationResultList.running") : item.message)
	const target = item.target
	const showProgress = pending && Boolean(item.expected_finished_at)
	const locate = () => {
		if (target) onLocate(target)
	}

	return (
		<li className="min-w-0 px-3 py-3 text-xs">
			<div className="flex min-w-0 items-start gap-2">
				{item.kind !== "text" && (
					<ItemIcon
						size={16}
						aria-hidden
						className="mt-0.5 shrink-0 text-muted-foreground"
					/>
				)}
				{target ? (
					<button
						type="button"
						onClick={(event) => {
							event.stopPropagation()
							locate()
						}}
						aria-label={t("operationResultList.locateCanvasElement", {
							label: item.label,
						})}
						className="min-w-0 rounded-sm text-left text-sm leading-5 text-foreground [overflow-wrap:anywhere] hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						{item.label}
					</button>
				) : (
					<span className="min-w-0 text-sm leading-5 text-foreground [overflow-wrap:anywhere]">
						{item.label}
					</span>
				)}
			</div>
			{item.description && (
				<p
					className={cn(
						"mb-0 mt-1.5 leading-5 [overflow-wrap:anywhere]",
						item.status === "error" ? "text-destructive" : "text-muted-foreground",
					)}
				>
					{item.description}
				</p>
			)}
			<div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
				<span
					className={cn(
						"inline-flex min-w-0 items-center gap-1.5 leading-5",
						!unavailable && item.status === "error"
							? "text-destructive"
							: "text-muted-foreground",
					)}
				>
					{item.expected_finished_at && (
						<GenerationProgress
							anchorKey={progressAnchorKey}
							active={showProgress}
							startedAt={item.started_at}
							expectedFinishedAt={item.expected_finished_at}
						/>
					)}
					{!showProgress && (
						<>
							<ResultIcon
								size={16}
								aria-hidden
								className={cn(
									"shrink-0",
									pending && "animate-spin",
									!pending &&
										!unavailable &&
										item.status === "success" &&
										"text-success",
								)}
							/>
							<span className="[overflow-wrap:anywhere]">{message}</span>
						</>
					)}
				</span>
				{target && (
					<span className="ml-auto flex flex-wrap items-center justify-end gap-2">
						{target.content_type === "image" && (
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onClick={(event) => {
									event.stopPropagation()
									onLocate(target, true)
								}}
								aria-label={t("operationResultList.openGenerationDetails", {
									label: item.label,
								})}
								className="h-6 shrink-0 gap-1.5 px-1 text-xs font-normal text-primary hover:bg-primary/5 hover:text-primary"
							>
								<Info size={16} aria-hidden />
								{t("operationResultList.generationDetails")}
							</Button>
						)}
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={(event) => {
								event.stopPropagation()
								locate()
							}}
							aria-label={t("operationResultList.locateCanvasElement", {
								label: item.label,
							})}
							className="-mr-1 h-6 shrink-0 gap-1.5 px-1 text-xs font-normal text-primary hover:bg-primary/5 hover:text-primary"
						>
							<LocateFixed size={16} aria-hidden />
							{t("operationResultList.viewInCanvas")}
						</Button>
					</span>
				)}
			</div>
		</li>
	)
}
