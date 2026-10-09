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
import MagicTooltip from "@/components/base/MagicTooltip"
import { cn } from "@/utils/cn"
import type {
	OperationResultItem,
	OperationResultTarget,
} from "@/pages/superMagic/components/Detail/types"

interface OperationResultRowProps {
	item: OperationResultItem
	loading: boolean
	unavailable?: string
	onLocate: (target: OperationResultTarget, showDetails?: boolean) => void
}

export default function OperationResultRow({
	item,
	loading,
	unavailable,
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
	const locate = () => {
		if (target) onLocate(target)
	}

	return (
		<li className="min-w-0 px-3 py-2.5 text-xs">
			<div className="flex min-w-0 items-start gap-2.5">
				<ResultIcon
					size={16}
					aria-hidden
					className={cn(
						"mt-0.5 shrink-0",
						pending && "animate-spin text-muted-foreground",
						!pending && !unavailable && item.status === "success" && "text-success",
						!unavailable && item.status === "error" && "text-destructive",
						unavailable && "text-muted-foreground",
					)}
				/>
				{/* 名称保留完整换行；窄列把操作移到下一行，避免缩小字号或隐藏入口。 */}
				<div className="flex min-w-0 flex-1 flex-wrap items-start gap-x-3 gap-y-1">
					<div className="min-w-0 flex-1 basis-40">
						<div className="flex min-w-0 items-start gap-1.5">
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
						{pending ? (
							<span className="sr-only">{message}</span>
						) : (
							<p
								className={cn(
									"mb-0 mt-0.5 leading-4 [overflow-wrap:anywhere]",
									!unavailable && item.status === "error"
										? "text-destructive"
										: "text-muted-foreground",
								)}
							>
								{message}
							</p>
						)}
					</div>
					{target && (
						<span className="-mr-1 -mt-1 flex shrink-0 items-center gap-0.5">
							{target.content_type === "image" && (
								<MagicTooltip title={t("operationResultList.generationDetails")}>
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
										className="h-7 shrink-0 gap-1 px-1.5 text-xs font-normal text-muted-foreground hover:bg-muted hover:text-foreground"
									>
										<Info size={16} aria-hidden />
										{t("operationResultList.detailsShort")}
									</Button>
								</MagicTooltip>
							)}
							<MagicTooltip title={t("operationResultList.viewInCanvas")}>
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
									className="h-7 shrink-0 gap-1 px-1.5 text-xs font-normal text-muted-foreground hover:bg-muted hover:text-foreground"
								>
									<LocateFixed size={16} aria-hidden />
									{t("operationResultList.locateShort")}
								</Button>
							</MagicTooltip>
						</span>
					)}
				</div>
			</div>
			{item.description && (
				<p
					className={cn(
						"mb-0 mt-1 pl-[26px] leading-5 [overflow-wrap:anywhere]",
						item.status === "error" ? "text-destructive" : "text-muted-foreground",
					)}
				>
					{item.description}
				</p>
			)}
		</li>
	)
}
