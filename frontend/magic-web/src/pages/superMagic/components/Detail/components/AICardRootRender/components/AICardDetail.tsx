import { memo } from "react"
import { motion } from "framer-motion"
import AICardIframe from "./AICardIframe"
import type { AICardEntry } from "../types"

interface AICardDetailProps {
	card: AICardEntry
	/** Override file to display (e.g. history entry). Falls back to card.latestHtmlFileId */
	htmlFileId?: string
	attachmentList?: any[]
	onBack: () => void
}

function AICardDetail({ card, htmlFileId, attachmentList, onBack }: AICardDetailProps) {
	const fileId = htmlFileId || card.latestHtmlFileId

	return (
		<motion.div
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			exit={{ opacity: 0 }}
			transition={{ duration: 0.25 }}
			className="flex h-full flex-col"
		>
			{/* Header toolbar */}
			<motion.div
				initial={{ opacity: 0, y: -10 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ delay: 0.1, duration: 0.2 }}
				className="flex items-center justify-between border-b border-border px-4 py-3"
			>
				<div className="flex items-center gap-3">
					<button
						type="button"
						onClick={onBack}
						className="flex items-center gap-1 rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
					>
						<svg
							width="16"
							height="16"
							viewBox="0 0 16 16"
							fill="none"
							xmlns="http://www.w3.org/2000/svg"
						>
							<path
								d="M10 12L6 8L10 4"
								stroke="currentColor"
								strokeWidth="1.5"
								strokeLinecap="round"
								strokeLinejoin="round"
							/>
						</svg>
						返回
					</button>
					<div className="h-4 w-px bg-border" />
					<h2 className="text-sm font-semibold text-foreground">{card.name}</h2>
				</div>
				<div className="flex items-center gap-2">
					{card.lastUpdated && (
						<span className="text-xs text-muted-foreground">
							{new Date(card.lastUpdated).toLocaleString("zh-CN", {
								month: "short",
								day: "numeric",
								hour: "2-digit",
								minute: "2-digit",
							})}
						</span>
					)}
				</div>
			</motion.div>

			{/* Card content */}
			<motion.div layoutId={`ai-card-tile-${card.id}`} className="flex-1 overflow-auto">
				{fileId ? (
					<AICardIframe
						fileId={fileId}
						attachmentList={attachmentList}
						className="h-full w-full"
						scaleToFit={false}
						style={{ height: "100%" }}
					/>
				) : (
					<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
						暂无卡片内容，等待下次定时任务生成
					</div>
				)}
			</motion.div>
		</motion.div>
	)
}

export default memo(AICardDetail)
