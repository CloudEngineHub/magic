/**
 * AiInputBox - 可复用的 AI 输入框组件
 *
 * 布局：
 * ┌──────────────────────────────────────────┐
 * │ textarea                     [润色] [🎤] │
 * ├──────────────────────────────────────────┤
 * │ [Model▼]              [extraActions...] │
 * └──────────────────────────────────────────┘
 */

import { useState, useRef, useCallback, type ReactNode } from "react"
import { cn } from "@/lib/utils"
import ModelSelector from "./ModelSelector"
import { polishText } from "../../services/selfMediaAiGenerate"

interface AiInputBoxProps {
	value: string
	onChange: (value: string) => void
	/** 润色时传递的上下文信息 */
	polishContext?: string
	placeholder?: string
	rows?: number
	className?: string
	/** 标签文字 */
	label?: string
	/** 底部工具栏右侧的额外操作 */
	extraActions?: ReactNode
	/** 工具栏下方的提示文字 */
	hint?: string
	/** 外部控制模型选择（共享） */
	model?: string
	onModelChange?: (model: string) => void
	onBlur?: () => void
}

export default function AiInputBox({
	value,
	onChange,
	polishContext,
	placeholder = "随便说说你的想法，口语化也没关系…",
	rows = 3,
	className,
	label,
	extraActions,
	hint,
	model,
	onModelChange,
	onBlur,
}: AiInputBoxProps) {
	const [isListening, setIsListening] = useState(false)
	const [isPolishing, setIsPolishing] = useState(false)
	const [internalModel, setInternalModel] = useState<string>("")
	const recognitionRef = useRef<SpeechRecognition | null>(null)
	const abortRef = useRef<AbortController | null>(null)

	const selectedModel = model ?? internalModel
	const setSelectedModel = onModelChange ?? setInternalModel

	// ─── 语音输入 ──────────────────────────────────────────────────────────
	const toggleVoice = useCallback(() => {
		if (isListening) {
			recognitionRef.current?.stop()
			setIsListening(false)
			return
		}

		const SpeechRecognition =
			(window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

		if (!SpeechRecognition) {
			return
		}

		const recognition = new SpeechRecognition()
		recognition.lang = "zh-CN"
		recognition.continuous = true
		recognition.interimResults = true

		let finalTranscript = value

		recognition.onresult = (event: SpeechRecognitionEvent) => {
			let interim = ""
			for (let i = event.resultIndex; i < event.results.length; i++) {
				const transcript = event.results[i][0].transcript
				if (event.results[i].isFinal) {
					finalTranscript += transcript
					onChange(finalTranscript)
				} else {
					interim += transcript
				}
			}
			if (interim) {
				onChange(finalTranscript + interim)
			}
		}

		recognition.onerror = () => {
			setIsListening(false)
		}

		recognition.onend = () => {
			setIsListening(false)
		}

		recognitionRef.current = recognition
		recognition.start()
		setIsListening(true)
	}, [isListening, value, onChange])

	// ─── AI 润色 ──────────────────────────────────────────────────────────
	const handlePolish = useCallback(async () => {
		if (!value.trim() || isPolishing) return

		setIsPolishing(true)
		abortRef.current = new AbortController()

		try {
			const result = await polishText({
				text: value,
				context: polishContext,
				model: selectedModel || undefined,
				signal: abortRef.current.signal,
			})
			if (result) {
				onChange(result)
			}
		} catch {
			// 用户取消或网络错误，静默处理
		} finally {
			setIsPolishing(false)
			abortRef.current = null
		}
	}, [value, isPolishing, polishContext, selectedModel, onChange])

	const hasSpeechApi =
		typeof window !== "undefined" &&
		("SpeechRecognition" in window || "webkitSpeechRecognition" in window)

	return (
		<div className={cn("space-y-1.5", className)}>
			{label && <label className="mb-1 block text-sm font-semibold">{label}</label>}

			{/* Unified card: textarea + toolbar */}
			<div className="overflow-hidden rounded-xl border border-input transition-all focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
				{/* Textarea area */}
				<div className="relative">
					<textarea
						className="w-full border-none bg-background px-4 py-3 pr-20 text-sm placeholder:text-muted-foreground/60 focus:outline-none resize-none"
						placeholder={placeholder}
						rows={rows}
						value={value}
						onChange={(e) => onChange(e.target.value)}
						onBlur={onBlur}
					/>

					{/* 右侧操作按钮组：AI 润色 + 语音（纵向排列） */}
					<div className="absolute right-2 top-2 flex flex-col items-center gap-1">
						<div className="group relative">
							<button
								type="button"
								className={cn(
									"rounded-md p-1.5 transition-colors",
									isPolishing
										? "bg-violet-100 text-violet-600 animate-pulse"
										: value.trim()
											? "text-muted-foreground hover:text-violet-600 hover:bg-violet-50"
											: "text-muted-foreground/40 cursor-not-allowed",
								)}
								onClick={handlePolish}
								disabled={!value.trim() || isPolishing}
							>
								<svg className="h-4 w-4" viewBox="0 0 12 12" fill="none">
									<path
										d="M6 1L7.5 4.5L11 6L7.5 7.5L6 11L4.5 7.5L1 6L4.5 4.5L6 1Z"
										fill="currentColor"
									/>
								</svg>
							</button>
							<span className="pointer-events-none absolute right-full top-1/2 mr-2 -translate-y-1/2 whitespace-nowrap rounded-md bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md opacity-0 transition-opacity group-hover:opacity-100">
								{isPolishing ? "润色中…" : "AI 润色"}
							</span>
						</div>
						{hasSpeechApi && (
							<div className="group relative">
								<button
									type="button"
									className={cn(
										"rounded-md p-1.5 transition-colors",
										isListening
											? "bg-red-100 text-red-500 animate-pulse"
											: "text-muted-foreground hover:text-foreground hover:bg-muted",
									)}
									onClick={toggleVoice}
								>
									<svg
										className="h-4 w-4"
										viewBox="0 0 16 16"
										fill="currentColor"
									>
										{isListening ? (
											<path d="M5 3h6v10H5V3z" />
										) : (
											<path d="M8 1a2 2 0 0 1 2 2v4a2 2 0 1 1-4 0V3a2 2 0 0 1 2-2zm0 10a4 4 0 0 0 4-4h1a5 5 0 0 1-4.5 4.975V14h2v1h-5v-1h2v-2.025A5 5 0 0 1 3 7h1a4 4 0 0 0 4 4z" />
										)}
									</svg>
								</button>
								<span className="pointer-events-none absolute right-full top-1/2 mr-2 -translate-y-1/2 whitespace-nowrap rounded-md bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md opacity-0 transition-opacity group-hover:opacity-100">
									{isListening ? "停止录音" : "语音输入"}
								</span>
							</div>
						)}
					</div>
				</div>

				{/* Bottom toolbar: model selector left, extra actions right */}
				<div className="flex items-center border-t border-border/40 bg-muted/30 px-3 py-1.5">
					<ModelSelector value={selectedModel} onChange={setSelectedModel} />
					<span className="flex-1" />
					{extraActions}
				</div>
			</div>

			{hint && <p className="px-1 text-[11px] text-muted-foreground">{hint}</p>}
		</div>
	)
}
