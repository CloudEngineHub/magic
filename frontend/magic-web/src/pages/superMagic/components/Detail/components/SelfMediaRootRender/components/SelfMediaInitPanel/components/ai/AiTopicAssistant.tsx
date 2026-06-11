/**
 * AiTopicAssistant - AI 选题助手面板
 */

import { useState, useCallback, useRef, useEffect } from "react"
import { useTranslation } from "react-i18next"
import { Check, Compass, Loader2, X } from "lucide-react"
import { observer } from "mobx-react-lite"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/shadcn-ui/badge"
import { Button } from "@/components/shadcn-ui/button"
import { Checkbox } from "@/components/shadcn-ui/checkbox"
import { Input } from "@/components/shadcn-ui/input"
import { Textarea } from "@/components/shadcn-ui/textarea"
import AiActionButton from "./AiActionButton"
import ReferenceFilePicker from "../picker/ReferenceFilePicker"
import InlineVoiceButton from "../ui/InlineVoiceButton"
import type { ReferenceFileValue } from "../../types"

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
	onClose?: () => void
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

	const [generatingStep, setGeneratingStep] = useState(0)

	// 控制生成中的文本变化
	useEffect(() => {
		if (aiGenerating) {
			setGeneratingStep(0)
			const timer = setInterval(() => {
				setGeneratingStep((prev) => Math.min(prev + 1, 3))
			}, 2500)
			return () => clearInterval(timer)
		}
	}, [aiGenerating])

	const generatingTexts = [
		t("detail.selfMedia.initPanel.stepTopic.generatingStep1", "深度思考领域特征..."),
		t("detail.selfMedia.initPanel.stepTopic.generatingStep2", "挖掘爆款选题角度..."),
		t("detail.selfMedia.initPanel.stepTopic.generatingStep3", "构思核心大纲框架..."),
		t("detail.selfMedia.initPanel.stepTopic.generatingStep4", "打磨最终输出细节..."),
	]

	return (
		<div
			className={cn(
				"relative overflow-hidden rounded-lg border bg-card p-4 shadow-xs transition-all duration-300 ease-in-out sm:p-5",
				aiGenerating ? "border-primary/50" : "hover:bg-accent/20",
			)}
		>
			{/* Blueprint Grid Texture - Neutralizes flat dead black and adds workdesk depth */}
			<div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-border" />

			{/* High-tech Loading Scanline Shimmer during generation */}
			{aiGenerating && (
				<div className="absolute left-0 top-0 h-[3px] w-full overflow-hidden bg-primary/10">
					<div
						className="h-full bg-gradient-to-r from-transparent via-primary to-transparent animate-shimmer"
						style={{
							width: "50%",
						}}
					/>
					<style
						dangerouslySetInnerHTML={{
							__html: `
							@keyframes shimmer {
								0% { transform: translateX(-100%); }
								100% { transform: translateX(200%); }
							}
							.animate-shimmer {
								animation: shimmer 1.5s infinite linear;
							}
						`,
						}}
					/>
				</div>
			)}

			{/* Background Ambient Glow */}
			<div className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-primary/5 blur-3xl" />

			{/* Large Background Compass Emblem on Top-Left */}
			<div className="pointer-events-none absolute -left-6 -top-6 text-muted-foreground/[0.04] transition-all duration-1000">
				<Compass
					className={cn("size-28 -rotate-12", aiGenerating && "animate-spin")}
					style={{ animationDuration: "12s" }}
				/>
			</div>

			{/* Header */}
			<div className="relative mb-5 flex items-center justify-between">
				<div className="flex items-center gap-2.5">
					<span className="text-sm font-semibold text-foreground">
						{t(
							"detail.selfMedia.initPanel.stepTopic.aiAssistantTitle",
							"让 AI 帮我策划选题与大纲",
						)}
					</span>
					{aiGenerating ? (
						<Badge variant="secondary" className="rounded-md">
							<span className="relative flex h-1.5 w-1.5">
								<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
								<span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
							</span>
							{t("detail.selfMedia.initPanel.stepTopic.generating", {
								defaultValue: "AI 策划中",
							})}
						</Badge>
					) : (
						<Badge variant="outline" className="rounded-md">
							Ready
						</Badge>
					)}
				</div>
			</div>

			{aiGenerating ? (
				<div className="relative grid min-h-[140px] w-full gap-4 py-4 md:grid-cols-[minmax(0,1fr)_9rem]">
					{/* Left Side: Steps Tracker & Cancel */}
					<div className="flex flex-col justify-center">
						<div className="flex flex-col gap-3">
							{generatingTexts.map((text, idx) => {
								const isActive = idx === generatingStep
								const isPast = idx < generatingStep
								return (
									<div
										key={idx}
										className={cn(
											"flex items-center gap-3 transition-all duration-500",
											isActive
												? "translate-x-1 text-primary"
												: isPast
													? "text-primary/60"
													: "text-muted-foreground",
										)}
									>
										<div className="flex h-5 w-5 items-center justify-center">
											{isActive ? (
												<div className="relative flex h-3.5 w-3.5 items-center justify-center">
													<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
													<span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
												</div>
											) : isPast ? (
												<Check className="h-4 w-4" />
											) : (
												<div className="h-1.5 w-1.5 rounded-full bg-zinc-700" />
											)}
										</div>
										<span
											className={cn(
												"text-sm",
												isActive ? "font-bold" : "font-medium",
											)}
										>
											{text}
										</span>
									</div>
								)
							})}
						</div>
						<Button
							onClick={handleAbort}
							variant="outline"
							size="sm"
							className="mt-6 w-fit"
						>
							<X className="h-3.5 w-3.5" />
							{t("detail.selfMedia.initPanel.stepTopic.stopBtn", "停止")}
						</Button>
					</div>

					{/* Right Side: Document Animation */}
					<div className="relative hidden flex-col items-center justify-center md:flex">
						{/* Background ambient light for the animation */}
						<div className="absolute inset-0 rounded-full bg-primary/5 blur-[40px]" />
						<div className="relative h-24 w-24 shrink-0">
							<svg
								viewBox="0 0 100 100"
								className="h-full w-full text-primary"
								style={{ overflow: "visible" }}
							>
								<style>
									{`
									@keyframes front-paper {
										0% { transform: translate(0, 0) scale(1) rotate(0); opacity: 1; }
										60% { transform: translate(0, 0) scale(1) rotate(0); opacity: 1; }
										80% { transform: translate(-25px, -20px) scale(0.9) rotate(-8deg); opacity: 0; }
										99.9% { transform: translate(-25px, -20px) scale(0.9) rotate(-8deg); opacity: 0; }
										100% { transform: translate(0, 0) scale(1) rotate(0); opacity: 1; }
									}
									@keyframes back-paper {
										0% { transform: translate(12px, 12px) scale(0.9); opacity: 0.2; }
										60% { transform: translate(12px, 12px) scale(0.9); opacity: 0.2; }
										80% { transform: translate(0, 0) scale(1); opacity: 1; }
										99.9% { transform: translate(0, 0) scale(1); opacity: 1; }
										100% { transform: translate(12px, 12px) scale(0.9); opacity: 0.2; }
									}
									@keyframes draw-line-1 {
										0% { stroke-dashoffset: 40; opacity: 1; }
										10% { stroke-dashoffset: 0; opacity: 1; }
										80% { stroke-dashoffset: 0; opacity: 1; }
										81% { opacity: 0; stroke-dashoffset: 0; }
										99.9% { opacity: 0; stroke-dashoffset: 40; }
										100% { stroke-dashoffset: 40; opacity: 1; }
									}
									@keyframes draw-line-2 {
										0%, 10% { stroke-dashoffset: 35; opacity: 1; }
										20% { stroke-dashoffset: 0; opacity: 1; }
										80% { stroke-dashoffset: 0; opacity: 1; }
										81% { opacity: 0; stroke-dashoffset: 0; }
										99.9% { opacity: 0; stroke-dashoffset: 35; }
										100% { stroke-dashoffset: 35; opacity: 1; }
									}
									@keyframes draw-line-3 {
										0%, 20% { stroke-dashoffset: 40; opacity: 1; }
										30% { stroke-dashoffset: 0; opacity: 1; }
										80% { stroke-dashoffset: 0; opacity: 1; }
										81% { opacity: 0; stroke-dashoffset: 0; }
										99.9% { opacity: 0; stroke-dashoffset: 40; }
										100% { stroke-dashoffset: 40; opacity: 1; }
									}
									@keyframes draw-line-4 {
										0%, 30% { stroke-dashoffset: 25; opacity: 1; }
										40% { stroke-dashoffset: 0; opacity: 1; }
										80% { stroke-dashoffset: 0; opacity: 1; }
										81% { opacity: 0; stroke-dashoffset: 0; }
										99.9% { opacity: 0; stroke-dashoffset: 25; }
										100% { stroke-dashoffset: 25; opacity: 1; }
									}
									@keyframes pen-move {
										0% { transform: translate(35px, 35px); opacity: 0; }
										2% { transform: translate(35px, 35px); opacity: 1; }
										10% { transform: translate(75px, 35px); opacity: 1; }
										11% { transform: translate(35px, 45px); opacity: 1; }
										20% { transform: translate(70px, 45px); opacity: 1; }
										21% { transform: translate(35px, 55px); opacity: 1; }
										30% { transform: translate(75px, 55px); opacity: 1; }
										31% { transform: translate(35px, 65px); opacity: 1; }
										40% { transform: translate(60px, 65px); opacity: 1; }
										45% { transform: translate(65px, 70px); opacity: 0; }
										100% { transform: translate(65px, 70px); opacity: 0; }
									}
									@keyframes data-flow {
										0% { transform: translateY(10px); opacity: 0; }
										20% { opacity: 1; }
										80% { opacity: 1; }
										100% { transform: translateY(-20px); opacity: 0; }
									}
									`}
								</style>

								{/* Background particles */}
								<g
									className="text-primary"
									style={{ animation: "data-flow 2s infinite linear" }}
								>
									<circle
										cx="15"
										cy="40"
										r="1.5"
										fill="currentColor"
										opacity="0.4"
									/>
									<circle
										cx="85"
										cy="70"
										r="2"
										fill="currentColor"
										opacity="0.3"
									/>
									<rect
										x="8"
										y="75"
										width="4"
										height="4"
										fill="currentColor"
										opacity="0.5"
									/>
									<rect
										x="75"
										y="20"
										width="2"
										height="2"
										fill="currentColor"
										opacity="0.6"
									/>
								</g>
								<g
									className="text-primary"
									style={{ animation: "data-flow 2.5s infinite linear 1s" }}
								>
									<circle
										cx="20"
										cy="80"
										r="1"
										fill="currentColor"
										opacity="0.6"
									/>
									<circle
										cx="90"
										cy="45"
										r="1.5"
										fill="currentColor"
										opacity="0.4"
									/>
									<rect
										x="25"
										y="20"
										width="3"
										height="3"
										fill="currentColor"
										opacity="0.5"
									/>
								</g>

								{/* Back Paper */}
								<g
									style={{
										transformOrigin: "50px 50px",
										animation: "back-paper 3s infinite",
									}}
								>
									<rect
										x="25"
										y="15"
										width="50"
										height="70"
										rx="4"
										fill="hsl(var(--card))"
										stroke="currentColor"
										strokeWidth="2"
									/>
									<line
										x1="25"
										y1="25"
										x2="75"
										y2="25"
										stroke="currentColor"
										strokeWidth="1"
										strokeOpacity="0.3"
									/>
									<rect
										x="30"
										y="18"
										width="8"
										height="4"
										rx="1"
										fill="currentColor"
										opacity="0.5"
									/>
									{/* Static skeleton lines for back paper to look like a document */}
									<line
										x1="35"
										y1="35"
										x2="75"
										y2="35"
										stroke="currentColor"
										strokeWidth="3"
										strokeLinecap="round"
										strokeOpacity="0.15"
									/>
									<line
										x1="35"
										y1="45"
										x2="70"
										y2="45"
										stroke="currentColor"
										strokeWidth="3"
										strokeLinecap="round"
										strokeOpacity="0.15"
									/>
									<line
										x1="35"
										y1="55"
										x2="75"
										y2="55"
										stroke="currentColor"
										strokeWidth="3"
										strokeLinecap="round"
										strokeOpacity="0.15"
									/>
									<line
										x1="35"
										y1="65"
										x2="60"
										y2="65"
										stroke="currentColor"
										strokeWidth="3"
										strokeLinecap="round"
										strokeOpacity="0.15"
									/>
								</g>

								{/* Foreground paper (current doc) */}
								<g
									style={{
										transformOrigin: "50px 50px",
										animation: "front-paper 3s infinite",
									}}
								>
									<rect
										x="25"
										y="15"
										width="50"
										height="70"
										rx="4"
										fill="hsl(var(--card))"
										stroke="currentColor"
										strokeWidth="2"
									/>
									<line
										x1="25"
										y1="25"
										x2="75"
										y2="25"
										stroke="currentColor"
										strokeWidth="1"
										strokeOpacity="0.3"
									/>
									<rect
										x="30"
										y="18"
										width="8"
										height="4"
										rx="1"
										fill="currentColor"
										opacity="0.5"
									/>
									<line
										x1="35"
										y1="35"
										x2="75"
										y2="35"
										stroke="currentColor"
										strokeWidth="3"
										strokeLinecap="round"
										strokeDasharray="40"
										strokeDashoffset="40"
										style={{ animation: "draw-line-1 3s infinite" }}
									/>
									<line
										x1="35"
										y1="45"
										x2="70"
										y2="45"
										stroke="currentColor"
										strokeWidth="3"
										strokeLinecap="round"
										strokeDasharray="35"
										strokeDashoffset="35"
										style={{ animation: "draw-line-2 3s infinite" }}
										className="opacity-90"
									/>
									<line
										x1="35"
										y1="55"
										x2="75"
										y2="55"
										stroke="currentColor"
										strokeWidth="3"
										strokeLinecap="round"
										strokeDasharray="40"
										strokeDashoffset="40"
										style={{ animation: "draw-line-3 3s infinite" }}
										className="opacity-80"
									/>
									<line
										x1="35"
										y1="65"
										x2="60"
										y2="65"
										stroke="currentColor"
										strokeWidth="3"
										strokeLinecap="round"
										strokeDasharray="25"
										strokeDashoffset="25"
										style={{ animation: "draw-line-4 3s infinite" }}
										className="opacity-70"
									/>
									{/* Pen / Cursor moving over the front paper */}
									<g style={{ animation: "pen-move 3s infinite" }}>
										<circle cx="0" cy="0" r="3" fill="currentColor" />
										<circle
											cx="0"
											cy="0"
											r="1.5"
											fill="hsl(var(--background))"
										/>
									</g>
								</g>
							</svg>
						</div>
					</div>
				</div>
			) : (
				<>
					<div className="relative mb-5">
						<div className="group flex w-full flex-col overflow-hidden rounded-lg border bg-background shadow-xs transition-all duration-300 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
							<div className="relative min-h-[80px] px-4 py-2.5">
								<Textarea
									rows={3}
									className="min-h-[80px] resize-none border-0 bg-transparent p-0 pr-7 text-sm shadow-none focus-visible:ring-0"
									placeholder={t(
										"detail.selfMedia.initPanel.stepTopic.directionPlaceholder",
									)}
									value={aiDirection}
									onChange={(e) => setAiDirection(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === "Enter" && !e.shiftKey) {
											e.preventDefault()
											handleGenerate()
										}
									}}
								/>
								<InlineVoiceButton
									value={aiDirection}
									onResult={setAiDirection}
									variant="textarea"
									className="text-zinc-400 hover:text-zinc-900"
								/>
							</div>
							{/* Bottom toolbar: reference files + upload trigger */}
							<div className="flex w-full items-center border-t bg-muted/30 px-3 py-1.5">
								<ReferenceFilePicker
									className="w-full"
									value={referenceFiles}
									onChange={setReferenceFiles}
									onError={setAiError}
									compact
								/>
							</div>
						</div>
					</div>

					{/* Error Box */}
					{aiError && (
						<div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
							<div className="h-1.5 w-1.5 rounded-full bg-destructive" />
							<p>{aiError}</p>
						</div>
					)}

					<div className="mb-4 h-px bg-border" />

					{/* Bottom Toolbar */}
					<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between transition-all duration-300">
						<div className="flex items-center gap-2">
							<p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
								<span>
									{t("detail.selfMedia.initPanel.stepTopic.generateCount")}
								</span>
								<Input
									type="number"
									min={1}
									max={20}
									className="h-8 w-14 text-center text-xs"
									value={topicCount}
									onChange={(e) =>
										setTopicCount(
											Math.max(
												1,
												Math.min(20, parseInt(e.target.value) || 1),
											),
										)
									}
								/>
								<span>
									{t("detail.selfMedia.initPanel.stepTopic.generateCountUnit")}
								</span>
							</p>
						</div>
						<div className="flex flex-wrap items-center gap-4">
							<label className="flex cursor-pointer select-none items-center gap-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
								<Checkbox
									checked={generateWithDetails}
									onCheckedChange={(checked) =>
										setGenerateWithDetails(checked === true)
									}
								/>
								<span>
									{t("detail.selfMedia.initPanel.stepTopic.generateWithDetails")}
								</span>
							</label>
							<AiActionButton
								modelValue={topicModel}
								onModelChange={setTopicModel}
								loading={false}
								onClick={handleGenerate}
								variant="accent"
								label={t("detail.selfMedia.initPanel.stepTopic.generateBtn")}
							/>
						</div>
					</div>
				</>
			)}
		</div>
	)
})
