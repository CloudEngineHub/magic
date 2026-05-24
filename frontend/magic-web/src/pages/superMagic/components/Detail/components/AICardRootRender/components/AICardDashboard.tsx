import { memo } from "react"
import { motion } from "framer-motion"
import { Settings, Play } from "lucide-react"
import { cn } from "@/lib/utils"
import AICardIframe from "./AICardIframe"
import type { AICardEntry, AICardHistoryEntry } from "../types"

interface AICardDashboardProps {
	cards: AICardEntry[]
	historyEntries: AICardHistoryEntry[]
	attachmentList?: any[]
	onOpenCard: (cardId: string) => void
	onOpenConfig?: () => void
	onRunNow?: () => void
	onOpenHistoryEntry?: (entry: AICardHistoryEntry) => void
}

function AICardDashboard({
	cards,
	historyEntries,
	attachmentList,
	onOpenCard,
	onOpenConfig,
	onRunNow,
	onOpenHistoryEntry,
}: AICardDashboardProps) {
	if (cards.length === 0) {
		return (
			<motion.div
				initial={{ opacity: 0, scale: 0.95 }}
				animate={{ opacity: 1, scale: 1 }}
				transition={{ duration: 0.3 }}
				className="flex h-full flex-col items-center justify-center gap-4 p-8"
			>
				<div className="text-6xl opacity-40">🃏</div>
				<div className="text-center">
					<h3 className="text-lg font-semibold text-foreground">AI 卡片加载中...</h3>
					<p className="mt-1 text-sm text-muted-foreground">正在解析卡片数据</p>
				</div>
			</motion.div>
		)
	}

	const card = cards[0]

	return (
		<motion.div
			initial={{ opacity: 0, y: 10 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.3 }}
			className="flex h-full flex-col overflow-hidden"
		>
			{/* Header */}
			<div className="flex items-center justify-between border-b border-border px-4 py-3">
				<div>
					<h2 className="text-lg font-bold text-foreground">{card.name}</h2>
					{card.description && (
						<p className="text-sm text-muted-foreground">{card.description}</p>
					)}
				</div>
				<div className="flex items-center gap-2">
					{onRunNow && (
						<button
							type="button"
							onClick={onRunNow}
							className="flex items-center gap-1 rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary transition-all hover:bg-primary/10"
						>
							<Play size={12} />
							立即运行
						</button>
					)}
					{onOpenConfig && (
						<button
							type="button"
							onClick={onOpenConfig}
							className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-all hover:border-primary/30 hover:bg-muted hover:text-foreground"
						>
							<Settings size={13} />
							配置
						</button>
					)}
					{card.lastUpdated && (
						<span className="text-xs text-muted-foreground">
							更新于{" "}
							{new Date(card.lastUpdated).toLocaleString("zh-CN", {
								month: "short",
								day: "numeric",
								hour: "2-digit",
								minute: "2-digit",
							})}
						</span>
					)}
				</div>
			</div>

			{/* Card preview - latest */}
			<div
				className="mx-4 mt-4 flex-shrink-0 cursor-pointer overflow-hidden rounded-xl border border-border transition-all hover:border-primary/30 hover:shadow-md"
				style={{ height: "280px" }}
				onClick={() => onOpenCard(card.id)}
			>
				{card.latestHtmlFileId ? (
					<AICardIframe
						fileId={card.latestHtmlFileId}
						attachmentList={attachmentList}
						className="pointer-events-none h-full w-full"
						scaleToFit
						showSkeleton
					/>
				) : (
					<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
						暂无卡片内容，等待定时任务生成
					</div>
				)}
			</div>

			{/* History list */}
			{historyEntries.length > 0 && (
				<div className="mt-4 flex-1 overflow-y-auto px-4 pb-4">
					<h3 className="mb-2 text-sm font-medium text-muted-foreground">
						历史版本 ({historyEntries.length})
					</h3>
					<div className="space-y-1.5">
						{historyEntries.map((entry, index) => (
							<motion.button
								key={entry.fileId}
								type="button"
								initial={{ opacity: 0, x: -8 }}
								animate={{ opacity: 1, x: 0 }}
								transition={{ delay: index * 0.03 }}
								onClick={() => onOpenHistoryEntry?.(entry)}
								className="flex w-full items-center gap-3 rounded-lg border border-border px-3 py-2 text-left transition-all hover:border-primary/30 hover:bg-muted"
							>
								<div className="h-2 w-2 flex-shrink-0 rounded-full bg-border" />
								<span className="text-sm text-foreground">{entry.displayTime}</span>
								<span className="ml-auto text-xs text-muted-foreground">
									{entry.fileName}
								</span>
							</motion.button>
						))}
					</div>
				</div>
			)}
		</motion.div>
	)
}

export default memo(AICardDashboard)
