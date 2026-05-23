import { memo, useCallback } from "react"
import { motion } from "framer-motion"
import { Settings } from "lucide-react"
import { cn } from "@/lib/utils"
import AICardTile from "./AICardTile"
import type { AICardEntry } from "../types"

interface AICardDashboardProps {
	cards: AICardEntry[]
	attachmentList?: any[]
	onOpenCard: (cardId: string) => void
	onOpenHistory: (cardId: string) => void
	onOpenConfig?: () => void
}

const containerVariants = {
	hidden: { opacity: 0 },
	show: {
		opacity: 1,
		transition: {
			staggerChildren: 0.06,
		},
	},
}

function AICardDashboard({
	cards,
	attachmentList,
	onOpenCard,
	onOpenHistory,
	onOpenConfig,
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

	// Single card → show it more prominently
	if (cards.length === 1) {
		const card = cards[0]
		return (
			<motion.div
				initial={{ opacity: 0, y: 10 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.3 }}
				className="flex h-full flex-col p-4"
			>
				<div className="mb-4 flex items-center justify-between">
					<div>
						<h2 className="text-lg font-bold text-foreground">{card.name}</h2>
						{card.description && (
							<p className="text-sm text-muted-foreground">{card.description}</p>
						)}
					</div>
					<div className="flex items-center gap-2">
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
						<button
							type="button"
							onClick={() => onOpenHistory(card.id)}
							className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-all hover:border-primary/30 hover:bg-muted hover:text-foreground"
						>
							历史版本
						</button>
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
				<div
					className="flex-1 cursor-pointer overflow-hidden rounded-xl border border-border transition-all hover:border-primary/30 hover:shadow-md"
					onClick={() => onOpenCard(card.id)}
				>
					{card.latestHtmlFileId ? (
						<AICardTile
							card={card}
							attachmentList={attachmentList}
							onOpen={onOpenCard}
							onOpenHistory={onOpenHistory}
						/>
					) : (
						<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
							暂无卡片内容
						</div>
					)}
				</div>
			</motion.div>
		)
	}

	// Multiple cards → grid
	return (
		<div className="h-full overflow-y-auto p-4">
			<motion.div
				variants={containerVariants}
				initial="hidden"
				animate="show"
				className={cn("grid gap-4", "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3")}
			>
				{cards.map((card) => (
					<AICardTile
						key={card.id}
						card={card}
						attachmentList={attachmentList}
						onOpen={onOpenCard}
						onOpenHistory={onOpenHistory}
					/>
				))}
			</motion.div>
		</div>
	)
}

export default memo(AICardDashboard)
