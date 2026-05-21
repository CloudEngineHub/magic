/**
 * AiTopicAssistant - AI 选题助手面板
 *
 * 独立的 AI 选题生成面板，支持文字方向输入或参考文件上传（二选一，左右布局）。
 * 采用极简高保真毛玻璃风格（Glassmorphism），提供纯净、科技、呼吸感的用户体验。
 */

import { useState, useCallback, useRef } from "react"
import { useTranslation } from "react-i18next"
import { Sparkles, X } from "lucide-react"
import { observer } from "mobx-react-lite"
import { cn } from "@/lib/utils"
import AiActionButton from "./AiActionButton"
import ReferenceFilePicker from "./ReferenceFilePicker"
import InlineVoiceButton from "./InlineVoiceButton"
import type { ReferenceFileValue } from "./types"

interface AiTopicAssistantProps {
	/** 是否禁用（如外部条件不满足） */
	disabled?: boolean
	/** 生成完成回调，传入方向/参考文件/模型/数量/是否含详情 */
	onGenerate: (params: {
		direction?: string
		referenceFiles?: ReferenceFileValue[]
		model?: string
		count: number
		generateWithDetails: boolean
		signal: AbortSignal
	}) => Promise<boolean>
	/** 关闭面板 */
	onClose: () => void
}

export default observer(function AiTopicAssistant({
	disabled,
	onGenerate,
	onClose,
}: AiTopicAssistantProps) {
	const [aiGenerating, setAiGenerating] = useState(false)
	const [aiDirection, setAiDirection] = useState("")
	const [aiError, setAiError] = useState("")
	const [topicModel, setTopicModel] = useState("")
	const [topicCount, setTopicCount] = useState(5)
	const [referenceFiles, setReferenceFiles] = useState<ReferenceFileValue[]>([])
	const [generateWithDetails, setGenerateWithDetails] = useState(true)
	const abortRef = useRef<AbortController | null>(null)
	const { t } = useTranslation("super")

	const handleGenerate = useCallback(async () => {
		if (disabled) return
		setAiGenerating(true)
		setAiError("")

		const controller = new AbortController()
		abortRef.current = controller

		try {
			const success = await onGenerate({
				direction: aiDirection || undefined,
				referenceFiles: referenceFiles.length > 0 ? referenceFiles : undefined,
				model: topicModel || undefined,
				count: topicCount,
				generateWithDetails,
				signal: controller.signal,
			})
			if (!success) {
				setAiError(t("detail.selfMedia.initPanel.stepTopic.errorEmpty"))
			}
		} catch (err) {
			if ((err as Error).name !== "AbortError") {
				setAiError(t("detail.selfMedia.initPanel.stepTopic.errorNetwork"))
			}
		} finally {
			setAiGenerating(false)
			abortRef.current = null
		}
	}, [
		disabled,
		aiDirection,
		referenceFiles,
		topicModel,
		topicCount,
		generateWithDetails,
		onGenerate,
		t,
	])

	const handleAbort = useCallback(() => {
		abortRef.current?.abort()
		setAiGenerating(false)
	}, [])

	return (
		<div
			className={cn(
				"relative overflow-hidden rounded-2xl border border-zinc-200/80 bg-white/60 p-5 shadow-[0_12px_40px_rgba(0,0,0,0.03)] backdrop-blur-md transition-all duration-300 dark:border-zinc-800/80 dark:bg-zinc-900/60",
				aiGenerating
					? "border-primary/40 shadow-[0_12px_45px_rgba(99,102,241,0.08)] ring-1 ring-primary/20"
					: "hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-[0_12px_40px_rgba(0,0,0,0.05)]",
			)}
		>
			{/* Ambient Breathe Glow - extremely subtle during generation */}
			<div
				className={cn(
					"pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-indigo-500/5 blur-3xl transition-opacity duration-1000",
					aiGenerating ? "opacity-100 animate-pulse" : "opacity-0",
				)}
			/>

			{/* Header */}
			<div className="relative mb-4 flex items-center justify-between">
				<div className="flex items-center gap-2.5">
					<div
						className={cn(
							"flex h-7 w-7 items-center justify-center rounded-lg transition-all duration-300",
							aiGenerating
								? "bg-primary text-primary-foreground shadow-md shadow-primary/25 ring-2 ring-primary/20"
								: "bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400",
						)}
					>
						<Sparkles
							className={cn(
								"size-3.5 transition-transform",
								aiGenerating && "animate-spin",
							)}
						/>
					</div>
					<div className="flex items-center gap-2">
						<span className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
							{t("detail.selfMedia.initPanel.stepTopic.aiAssistantTitle")}
						</span>
						{aiGenerating && (
							<span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
								<span className="relative flex h-1.5 w-1.5">
									<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
									<span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
								</span>
								{t("detail.selfMedia.initPanel.stepTopic.generating", {
									defaultValue: "生成中",
								})}
							</span>
						)}
					</div>
				</div>
				<button
					type="button"
					className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors"
					onClick={() => {
						onClose()
						setAiError("")
					}}
				>
					<X className="size-3.5" />
				</button>
			</div>

			{/* Input area: direction input with reference file picker seamlessly integrated */}
			<div className="relative mb-4">
				<div
					className={cn(
						"group flex items-center gap-2 min-h-11 w-full rounded-xl border bg-white/80 dark:bg-zinc-950/80 backdrop-blur-sm pl-4 pr-3 py-1.5 shadow-sm transition-all duration-200",
						aiGenerating
							? "border-zinc-200/50 dark:border-zinc-800/50 opacity-60 cursor-not-allowed"
							: "border-zinc-200 dark:border-zinc-800/80 hover:border-zinc-300 dark:hover:border-zinc-700 focus-within:border-indigo-500/50 focus-within:ring-4 focus-within:ring-indigo-500/5 focus-within:shadow-md focus-within:shadow-indigo-500/2",
					)}
				>
					<div className="relative flex-1 min-w-0">
						<input
							type="text"
							className="w-full bg-transparent pr-6 text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-400/80 focus:outline-none disabled:cursor-not-allowed"
							placeholder={t(
								"detail.selfMedia.initPanel.stepTopic.directionPlaceholder",
							)}
							value={aiDirection}
							onChange={(e) => setAiDirection(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter" && !aiGenerating) {
									handleGenerate()
								}
							}}
							disabled={aiGenerating}
						/>
						<InlineVoiceButton
							onResult={(text) => setAiDirection((prev) => prev + text)}
						/>
					</div>
					{/* Reference file picker on the right */}
					<div className="shrink-0 z-[10]">
						<ReferenceFilePicker
							value={referenceFiles}
							onChange={setReferenceFiles}
							disabled={aiGenerating}
							onError={setAiError}
							compact
						/>
					</div>
				</div>
			</div>

			{/* Error Box */}
			{aiError && (
				<div className="mb-3 flex items-center gap-1.5 rounded-lg bg-destructive/5 px-3 py-2 border border-destructive/10">
					<div className="h-1.5 w-1.5 rounded-full bg-destructive/80" />
					<p className="text-xs text-destructive font-medium">{aiError}</p>
				</div>
			)}

			{/* Thin sleek divider */}
			<div
				className={cn(
					"mb-3.5 h-px bg-zinc-200/60 dark:bg-zinc-800/60 transition-colors duration-300",
					aiGenerating && "bg-indigo-500/10",
				)}
			/>

			{/* Bottom toolbar */}
			<div
				className={cn(
					"flex items-center justify-between transition-opacity duration-200",
					aiGenerating && "opacity-70",
				)}
			>
				<div className="flex items-center gap-2">
					<p className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
						<span>{t("detail.selfMedia.initPanel.stepTopic.generateCount")}</span>
						<input
							type="number"
							min={1}
							max={20}
							className="w-10 h-7 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 px-1 text-center text-xs font-semibold text-zinc-800 dark:text-zinc-200 transition-colors focus:border-indigo-500/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/5 disabled:opacity-50"
							value={topicCount}
							onChange={(e) =>
								setTopicCount(
									Math.max(1, Math.min(20, parseInt(e.target.value) || 1)),
								)
							}
							disabled={aiGenerating}
						/>
						<span>{t("detail.selfMedia.initPanel.stepTopic.generateCountUnit")}</span>
					</p>
				</div>
				<div className="flex items-center gap-3.5">
					<label className="flex items-center gap-2 text-xs font-medium text-zinc-500 dark:text-zinc-400 cursor-pointer select-none transition-colors hover:text-zinc-800 dark:hover:text-zinc-200">
						<input
							type="checkbox"
							className="rounded border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 focus:ring-zinc-500 accent-zinc-950 dark:accent-zinc-50 h-3.5 w-3.5 transition-all cursor-pointer"
							checked={generateWithDetails}
							onChange={(e) => setGenerateWithDetails(e.target.checked)}
							disabled={aiGenerating}
						/>
						<span>{t("detail.selfMedia.initPanel.stepTopic.generateWithDetails")}</span>
					</label>
					<AiActionButton
						modelValue={topicModel}
						onModelChange={setTopicModel}
						loading={aiGenerating}
						onClick={aiGenerating ? handleAbort : handleGenerate}
						variant="primary"
						label={t("detail.selfMedia.initPanel.stepTopic.generateBtn")}
						loadingLabel={t("detail.selfMedia.initPanel.stepTopic.stopBtn")}
					/>
				</div>
			</div>
		</div>
	)
})
