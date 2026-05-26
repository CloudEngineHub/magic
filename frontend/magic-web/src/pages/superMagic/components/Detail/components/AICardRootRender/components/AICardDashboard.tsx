import { memo, useMemo, useRef } from "react"
import { motion } from "framer-motion"
import { useTranslation } from "react-i18next"
import { Loader2, Settings, Play } from "lucide-react"
import { cn } from "@/lib/utils"
import AICardIframe from "./AICardIframe"
import type { AICardEntry, AICardHistoryEntry } from "../types"
import {
	buildAICardDashboardItems,
	type AICardAttachmentNode,
	type AICardDashboardItem,
} from "../utils/aiCardDashboardItems"

/**
 * Find nodes matching the given file IDs from the attachment tree.
 * Returns a map of file_id -> node for only the relevant files.
 */
function findRelevantNodes(
	list: AICardAttachmentNode[] | undefined,
	fileIds: Set<string>,
): Map<string, AICardAttachmentNode> {
	const result = new Map<string, AICardAttachmentNode>()
	if (!list?.length || fileIds.size === 0) return result
	const stack = [...list]
	while (stack.length > 0) {
		const node = stack.pop()
		if (!node) continue
		if (node.file_id && fileIds.has(node.file_id)) {
			result.set(node.file_id, node)
		}
		if (node.children?.length) stack.push(...node.children)
	}
	return result
}

/**
 * Compute a fingerprint for only the relevant file nodes (by checking existence).
 * Only reacts when the set of relevant files in the tree actually changes.
 */
function computeRelevantFingerprint(
	list: AICardAttachmentNode[] | undefined,
	fileIds: Set<string>,
): string {
	if (!list?.length || fileIds.size === 0) return ""
	const found: string[] = []
	const stack = [...list]
	while (stack.length > 0) {
		const node = stack.pop()
		if (!node) continue
		if (node.file_id && fileIds.has(node.file_id)) {
			found.push(node.file_id)
		}
		if (node.children?.length) stack.push(...node.children)
	}
	found.sort()
	return found.join(",")
}

/**
 * Returns a stable reference to attachmentList that only updates
 * when the set of relevant file_ids (those the dashboard cares about) changes.
 */
function useStableAttachmentList(
	attachmentList: AICardAttachmentNode[] | undefined,
	relevantFileIds: Set<string>,
) {
	const stableRef = useRef(attachmentList)
	const fingerprintRef = useRef("")

	const fingerprint = computeRelevantFingerprint(attachmentList, relevantFileIds)
	if (fingerprint !== fingerprintRef.current) {
		fingerprintRef.current = fingerprint
		stableRef.current = attachmentList
	}

	return stableRef.current
}

interface AICardDashboardProps {
	cards: AICardEntry[]
	historyEntries: AICardHistoryEntry[]
	attachmentList?: AICardAttachmentNode[]
	onOpenCard: (cardId: string) => void
	onOpenConfig?: () => void
	onRunNow?: () => void
	isRunNowLoading?: boolean
	onOpenHistoryEntry?: (entry: AICardHistoryEntry) => void
}

function AICardDashboard({
	cards,
	historyEntries,
	attachmentList,
	onOpenCard,
	onOpenConfig,
	onRunNow,
	isRunNowLoading = false,
	onOpenHistoryEntry,
}: AICardDashboardProps) {
	const { t } = useTranslation("super")
	// Collect file IDs that the dashboard actually uses
	const relevantFileIds = useMemo(() => {
		const ids = new Set<string>()
		for (const card of cards) {
			if (card.latestHtmlFileId) ids.add(card.latestHtmlFileId)
		}
		for (const entry of historyEntries) {
			if (entry.fileId) ids.add(entry.fileId)
		}
		return ids
	}, [cards, historyEntries])

	// Stabilize attachmentList: only treat as changed when relevant file_ids change
	const stableAttachmentList = useStableAttachmentList(attachmentList, relevantFileIds)

	const dashboardItems = useMemo(
		() =>
			buildAICardDashboardItems({
				cards,
				historyEntries,
				attachmentList: stableAttachmentList,
			}),
		[cards, historyEntries, stableAttachmentList],
	)

	if (cards.length === 0) {
		return (
			<motion.div
				initial={{ opacity: 0, scale: 0.95 }}
				animate={{ opacity: 1, scale: 1 }}
				transition={{ duration: 0.3 }}
				className="flex h-full flex-col items-center justify-center gap-4 p-8"
				data-testid="ai-card-dashboard-loading"
			>
				<div className="text-6xl opacity-40">🃏</div>
				<div className="text-center">
					<h3 className="text-lg font-semibold text-foreground">
						{t("detail.aiCard.dashboard.loading")}
					</h3>
					<p className="mt-1 text-sm text-muted-foreground">
						{t("detail.aiCard.dashboard.loadingDescription")}
					</p>
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
			data-testid="ai-card-dashboard"
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
							disabled={isRunNowLoading}
							className={cn(
								"flex items-center gap-1 rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary transition-all hover:bg-primary/10",
								isRunNowLoading && "cursor-not-allowed opacity-70",
							)}
							data-testid="ai-card-dashboard-run-button"
						>
							{isRunNowLoading ? (
								<Loader2 size={12} className="animate-spin" />
							) : (
								<Play size={12} />
							)}
							{isRunNowLoading
								? t("detail.aiCard.dashboard.running")
								: t("detail.aiCard.dashboard.runNow")}
						</button>
					)}
					{onOpenConfig && (
						<button
							type="button"
							onClick={onOpenConfig}
							className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-all hover:border-primary/30 hover:bg-muted hover:text-foreground"
							data-testid="ai-card-dashboard-config-button"
						>
							<Settings size={13} />
							{t("detail.aiCard.dashboard.configure")}
						</button>
					)}
					{card.lastUpdated && (
						<span className="text-xs text-muted-foreground">
							{t("detail.aiCard.dashboard.updatedAt", {
								time: new Date(card.lastUpdated).toLocaleString(undefined, {
									month: "short",
									day: "numeric",
									hour: "2-digit",
									minute: "2-digit",
								}),
							})}
						</span>
					)}
				</div>
			</div>

			<div className="flex-1 overflow-y-auto p-4">
				{dashboardItems.length > 0 ? (
					<div
						className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4 xl:gap-6"
						data-testid="ai-card-dashboard-card-grid"
					>
						{dashboardItems.map((item, index) => (
							<DashboardCard
								key={item.id}
								item={item}
								index={index}
								attachmentList={stableAttachmentList}
								onOpenCard={onOpenCard}
								onOpenHistoryEntry={onOpenHistoryEntry}
							/>
						))}
					</div>
				) : (
					<div
						className="flex h-full min-h-[280px] items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground"
						data-testid="ai-card-dashboard-empty"
					>
						{t("detail.aiCard.dashboard.empty")}
					</div>
				)}
			</div>
		</motion.div>
	)
}

interface DashboardCardProps {
	item: AICardDashboardItem
	index: number
	attachmentList?: AICardAttachmentNode[]
	onOpenCard: (cardId: string) => void
	onOpenHistoryEntry?: (entry: AICardHistoryEntry) => void
}

const DashboardCard = memo(function DashboardCard({
	item,
	index,
	attachmentList,
	onOpenCard,
	onOpenHistoryEntry,
}: DashboardCardProps) {
	const { t } = useTranslation("super")
	function handleClick() {
		if (item.kind === "latest" && item.cardId) {
			onOpenCard(item.cardId)
			return
		}

		if (item.historyEntry) onOpenHistoryEntry?.(item.historyEntry)
	}

	return (
		<motion.button
			type="button"
			initial={{ opacity: 0, y: 12 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ delay: Math.min(index * 0.03, 0.3) }}
			onClick={handleClick}
			className={cn(
				"group relative flex aspect-[9/16] flex-col overflow-hidden rounded-2xl border border-border/50 bg-card text-left transition-all duration-500 ease-out",
				"hover:-translate-y-1.5 hover:border-primary/40 hover:shadow-[0_12px_30px_rgb(0,0,0,0.12)] focus:outline-none focus:ring-2 focus:ring-primary/30",
			)}
			data-testid="ai-card-dashboard-card"
			data-card-id={item.fileId}
		>
			<div className="absolute inset-0 z-0 bg-muted/20 transition-transform duration-700 ease-out group-hover:scale-105">
				<AICardIframe
					fileId={item.fileId}
					attachmentList={attachmentList}
					className="pointer-events-none h-full w-full"
					hideVerticalScroll
					showSkeleton
				/>
			</div>

			<div className="absolute inset-0 z-10 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-70 transition-opacity duration-500 group-hover:opacity-90" />

			<div className="absolute left-3 top-3 z-20">
				<div className="rounded-full border border-white/20 bg-black/40 px-2 py-0.5 text-[10px] font-medium tracking-wide text-white shadow-sm backdrop-blur-md transition-colors duration-300 group-hover:bg-black/60">
					{item.kind === "latest"
						? t("detail.aiCard.dashboard.latestVersion")
						: t("detail.aiCard.dashboard.historyVersion")}
				</div>
			</div>

			<div className="absolute inset-x-0 bottom-0 z-20 flex translate-y-1.5 flex-col gap-2 p-4 transition-transform duration-500 ease-out group-hover:translate-y-0">
				<div className="flex items-start justify-between gap-2">
					<div className="min-w-0">
						<h3 className="truncate text-sm font-semibold tracking-tight text-white drop-shadow-sm">
							{item.title}
						</h3>
						{item.description && (
							<p className="mt-1 line-clamp-2 text-xs leading-relaxed text-white/90 drop-shadow-sm">
								{item.description}
							</p>
						)}
					</div>
				</div>
				<div className="mt-0.5 flex items-center justify-between gap-2 text-[10px] text-white/80">
					<span className="font-medium drop-shadow-sm">
						{formatDateTime(item.createdAt)}
					</span>
					{item.kind === "latest" ? (
						<span className="flex-shrink-0 rounded-full bg-primary px-2 py-0.5 font-medium text-primary-foreground shadow-sm">
							{t("detail.aiCard.dashboard.current")}
						</span>
					) : (
						<span className="flex-shrink-0 rounded-full border border-white/30 bg-white/20 px-2 py-0.5 font-medium text-white shadow-sm backdrop-blur-md">
							{t("detail.aiCard.dashboard.archived")}
						</span>
					)}
				</div>
			</div>
		</motion.button>
	)
})

function formatDateTime(value?: string) {
	if (!value) return "—"

	const date = new Date(value)
	if (Number.isNaN(date.getTime())) return "—"

	return date.toLocaleString(undefined, {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	})
}

export default memo(AICardDashboard)
