import { useCallback, useEffect, useRef } from "react"
import { Mic } from "lucide-react"
import { cn } from "@/lib/utils"
import { useVoiceInput } from "@/components/business/VoiceInput/hooks"
import { useMicrophonePermission } from "@/hooks/useMicrophonePermission"

interface InlineVoiceButtonProps {
	onResult: (text: string) => void
	onError?: (error: Error) => void
	/** Position variant: 'input' for single-line inputs, 'textarea' for multi-line textareas */
	variant?: "input" | "textarea"
	className?: string
}

/**
 * Lightweight inline voice-input button that sits inside input/textarea fields.
 * Shows a small mic icon on hover/focus, animates when recording.
 */
export default function InlineVoiceButton({
	onResult,
	onError,
	variant = "input",
	className,
}: InlineVoiceButtonProps) {
	const resultRef = useRef(onResult)
	resultRef.current = onResult
	const onErrorRef = useRef(onError)
	onErrorRef.current = onError

	const { handlePermissionError } = useMicrophonePermission()

	const { status, isRecording, toggleRecording, disconnect } = useVoiceInput({
		onResult: (text) => {
			if (text.startsWith('sult":{"additions":{"log_id":')) {
				return
			}
			resultRef.current(text)
		},
		onError: (error) => {
			try {
				handlePermissionError(error)
			} catch (nonPermissionError) {
				onErrorRef.current?.(nonPermissionError as Error)
			}
		},
	})

	const isActive = status === "recording" || status === "processing" || status === "connecting"

	const handleToggle = useCallback(
		async (e: React.MouseEvent) => {
			e.stopPropagation()
			try {
				await toggleRecording()
			} catch (error) {
				try {
					handlePermissionError(error as Error)
				} catch (nonPermissionError) {
					onErrorRef.current?.(nonPermissionError as Error)
				}
			}
		},
		[toggleRecording, handlePermissionError],
	)

	// 组件卸载时断开连接，释放资源
	useEffect(() => {
		return () => {
			disconnect()
		}
	}, [disconnect])

	return (
		<button
			type="button"
			className={cn(
				"absolute flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors",
				variant === "input" ? "right-1 top-1/2 -translate-y-1/2" : "right-1.5 top-1.5",
				isActive
					? "text-orange-500 hover:text-orange-600"
					: "hover:text-foreground opacity-0 group-focus-within:opacity-100 group-hover:opacity-100",
				className,
			)}
			title={isActive ? "停止语音输入" : "语音输入"}
			onClick={handleToggle}
		>
			{isActive ? (
				<span className="flex items-center gap-px">
					<span className="h-2 w-0.5 animate-pulse rounded-full bg-orange-500" />
					<span className="h-3 w-0.5 animate-pulse rounded-full bg-orange-500 delay-75" />
					<span className="h-2 w-0.5 animate-pulse rounded-full bg-orange-500 delay-150" />
				</span>
			) : (
				<Mic size={12} />
			)}
		</button>
	)
}
