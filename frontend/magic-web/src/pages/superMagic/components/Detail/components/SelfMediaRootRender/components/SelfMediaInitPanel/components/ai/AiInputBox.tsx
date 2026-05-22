/**
 * AiInputBox - 可复用的 AI 输入框组件
 *
 * 布局：
 * ┌──────────────────────────────────────────┐
 * │ textarea                                 │
 * ├──────────────────────────────────────────┤
 * │ [📎上传参考资料] [files...]  [🎤] [AI润色]│
 * └──────────────────────────────────────────┘
 */

import { useState, useRef, useCallback } from "react"
import { cn } from "@/lib/utils"
import { useVoiceInput } from "@/components/business/VoiceInput/hooks"
import { useMicrophonePermission } from "@/hooks/useMicrophonePermission"
import AiActionButton from "./AiActionButton"
import ReferenceFilePicker from "../picker/ReferenceFilePicker"
import { polishText } from "../../../../services/selfMediaAiGenerate"
import type { ReferenceFileValue } from "../../types"

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
	/** 工具栏下方的提示文字 */
	hint?: string
	/** 外部控制模型选择（共享） */
	model?: string
	onModelChange?: (model: string) => void
	onBlur?: () => void
	/** 参考资料文件列表（支持上传和选择项目文件） */
	referenceFiles?: ReferenceFileValue[]
	onReferenceFilesChange?: (files: ReferenceFileValue[]) => void
}

export default function AiInputBox({
	value,
	onChange,
	polishContext,
	placeholder = "随便说说你的想法，口语化也没关系…",
	rows = 3,
	className,
	label,
	hint,
	model,
	onModelChange,
	onBlur,
	referenceFiles,
	onReferenceFilesChange,
}: AiInputBoxProps) {
	const [isPolishing, setIsPolishing] = useState(false)
	const [internalModel, setInternalModel] = useState<string>("")
	const abortRef = useRef<AbortController | null>(null)
	const onChangeRef = useRef(onChange)
	onChangeRef.current = onChange

	const selectedModel = model ?? internalModel
	const setSelectedModel = onModelChange ?? setInternalModel

	// ─── 语音输入（复用 useVoiceInput + 权限处理） ─────────────────────────
	const { handlePermissionError } = useMicrophonePermission()

	const { status: voiceStatus, toggleRecording } = useVoiceInput({
		onResult: (text) => {
			if (text.startsWith('sult":{"additions":{"log_id":')) {
				return
			}
			onChangeRef.current(text)
		},
		onError: (error) => {
			try {
				handlePermissionError(error)
			} catch {
				// 非权限错误，静默处理
			}
		},
	})

	const isListening =
		voiceStatus === "recording" || voiceStatus === "processing" || voiceStatus === "connecting"

	const handleToggleVoice = useCallback(async () => {
		try {
			await toggleRecording()
		} catch (error) {
			try {
				handlePermissionError(error as Error)
			} catch {
				// 非权限错误，静默处理
			}
		}
	}, [toggleRecording, handlePermissionError])

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

	return (
		<div className={cn("space-y-1.5", className)}>
			{label && <label className="mb-1 block text-xs font-semibold">{label}</label>}

			{/* Unified paper field: textarea + toolbar */}
			<div className="overflow-hidden border-b border-zinc-200 bg-zinc-50/40 transition-all focus-within:border-zinc-950 focus-within:bg-primary/[0.03]">
				{/* Textarea area */}
				<textarea
					className="w-full resize-none border-none bg-transparent px-4 py-3 text-sm font-bold text-zinc-950 placeholder:text-muted-foreground/50 focus:outline-none"
					placeholder={placeholder}
					rows={rows}
					value={value}
					onChange={(e) => onChange(e.target.value)}
					onBlur={onBlur}
				/>

				{/* Bottom toolbar: reference files left, actions right */}
				<div className="flex items-center border-t border-zinc-950/10 bg-white/70 px-3 py-1.5">
					{onReferenceFilesChange && (
						<ReferenceFilePicker
							value={referenceFiles || []}
							onChange={onReferenceFilesChange}
							compact
						/>
					)}
					<span className="flex-1" />
					<div className="flex items-center gap-1">
						<button
							type="button"
							className={cn(
								"cursor-pointer p-1 transition-all",
								isListening
									? "animate-pulse bg-red-50 text-red-500"
									: "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950",
							)}
							onClick={handleToggleVoice}
							title={isListening ? "停止录音" : "语音输入"}
						>
							<svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor">
								{isListening ? (
									<path d="M5 3h6v10H5V3z" />
								) : (
									<path d="M8 1a2 2 0 0 1 2 2v4a2 2 0 1 1-4 0V3a2 2 0 0 1 2-2zm0 10a4 4 0 0 0 4-4h1a5 5 0 0 1-4.5 4.975V14h2v1h-5v-1h2v-2.025A5 5 0 0 1 3 7h1a4 4 0 0 0 4 4z" />
								)}
							</svg>
						</button>
						<AiActionButton
							modelValue={selectedModel}
							onModelChange={setSelectedModel}
							loading={isPolishing}
							disabled={!value.trim()}
							onClick={handlePolish}
							label={
								<>
									<svg className="h-3 w-3" viewBox="0 0 12 12" fill="none">
										<path
											d="M6 1L7.5 4.5L11 6L7.5 7.5L6 11L4.5 7.5L1 6L4.5 4.5L6 1Z"
											fill="currentColor"
										/>
									</svg>
									<span>润色</span>
								</>
							}
							loadingLabel={
								<>
									<svg
										className="h-3 w-3 animate-spin"
										viewBox="0 0 12 12"
										fill="none"
									>
										<circle
											cx="6"
											cy="6"
											r="5"
											stroke="currentColor"
											strokeWidth="1.5"
											strokeDasharray="20 10"
										/>
									</svg>
									<span>润色中…</span>
								</>
							}
							variant="outline"
							size="sm"
						/>
					</div>
				</div>
			</div>

			{hint && <p className="px-1 text-[11px] text-muted-foreground">{hint}</p>}
		</div>
	)
}
