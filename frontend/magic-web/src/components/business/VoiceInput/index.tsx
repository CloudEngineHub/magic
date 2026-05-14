import {
	memo,
	useEffect,
	forwardRef,
	useImperativeHandle,
	useCallback,
	useRef,
	useState,
} from "react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/shadcn-ui/tooltip"
import { useTranslation } from "react-i18next"
import { useVoiceInput, getHotkeyDisplayText } from "./hooks"
import type { VoiceInputProps, VoiceInputRef } from "./types"
import type { AudioChunkParams } from "@/services/voiceToText"
import pubsub, { PubSubEvents } from "@/utils/pubsub"
import { GuideTourElementId } from "@/pages/superMagic/components/LazyGuideTour"
import { cn } from "@/lib/utils"
import { Mic } from "lucide-react"

const DEFAULT_WAVE_BAR_COUNT = 5
const WAVE_MIN_LEVEL = 0.18
const WAVE_SMOOTHING_FACTOR = 0.45
const WAVE_GAIN = 2.4

function createIdleWaveLevels(barCount = DEFAULT_WAVE_BAR_COUNT) {
	return Array.from({ length: barCount }, (_, index) => {
		const middle = (barCount - 1) / 2
		const distanceFromMiddle = Math.abs(index - middle)
		const normalizedDistance = middle > 0 ? distanceFromMiddle / middle : 0

		return clampLevel(0.65 - normalizedDistance * 0.25)
	})
}

function clampLevel(level: number) {
	return Math.min(1, Math.max(WAVE_MIN_LEVEL, level))
}

function calculateAudioLevel(audioData: ArrayBuffer) {
	if (!audioData.byteLength) return WAVE_MIN_LEVEL

	const samples = new Int16Array(audioData, 0, Math.floor(audioData.byteLength / 2))
	if (!samples.length) return WAVE_MIN_LEVEL

	const sumOfSquares = samples.reduce((sum, sample) => {
		const normalizedSample = sample / 32768
		return sum + normalizedSample * normalizedSample
	}, 0)
	const rms = Math.sqrt(sumOfSquares / samples.length)

	return clampLevel(rms * WAVE_GAIN)
}

function createNextWaveLevels(previousLevels: number[], audioLevel: number) {
	const middle = (previousLevels.length - 1) / 2

	return previousLevels.map((previousLevel, index) => {
		const distanceFromMiddle = middle > 0 ? Math.abs(index - middle) / middle : 0
		const shapeLevel = audioLevel * (1 - distanceFromMiddle * 0.42)
		const phaseLevel = Math.sin(index * 0.75 + audioLevel * Math.PI) * 0.08
		const targetLevel = clampLevel(shapeLevel + phaseLevel)

		return clampLevel(
			previousLevel * WAVE_SMOOTHING_FACTOR + targetLevel * (1 - WAVE_SMOOTHING_FACTOR),
		)
	})
}

function VoiceWave({
	iconSize,
	levels,
	className,
}: {
	iconSize: number
	levels: number[]
	className?: string
}) {
	return (
		<div
			className={cn("flex h-full w-full items-center justify-center", className)}
			style={{ height: iconSize, gap: iconSize * 0.1 }}
			data-testid="voice-input-waveform"
		>
			{levels.map((level, index) => (
				<div
					key={index}
					className="w-0.5 rounded-full bg-orange-500 transition-[height] duration-100"
					style={{ height: Math.max(2, iconSize * level) }}
					data-testid="voice-input-waveform-bar"
				/>
			))}
		</div>
	)
}

export const VoiceInput = memo(
	forwardRef<VoiceInputRef, VoiceInputProps>(
		(
			{
				onResult,
				onError,
				onStatusChange,
				onRecordingChange,
				disabled = false,
				placeholder,
				className,
				children,
				config,
				iconSize = 20,
				enableHotkey = true,
				onAudioChunk,
				onWaveformLevelsChange,
				toggleOnClick = true,
				waveformBarCount = DEFAULT_WAVE_BAR_COUNT,
				waveformClassName,
			},
			ref,
		) => {
			const { t } = useTranslation("component")
			const [waveLevels, setWaveLevels] = useState(() => createIdleWaveLevels(waveformBarCount))
			const didReportRecordingChangeRef = useRef(false)

			const updateWaveLevels = useCallback(
				(nextLevels: number[]) => {
					setWaveLevels(nextLevels)
					onWaveformLevelsChange?.(nextLevels)
				},
				[onWaveformLevelsChange],
			)

			const handleAudioChunk = useCallback(
				(params: AudioChunkParams) => {
					onAudioChunk?.(params)
					const audioLevel = calculateAudioLevel(params.audioData)
					setWaveLevels((previousLevels) => {
						const sourceLevels =
							previousLevels.length === waveformBarCount
								? previousLevels
								: createIdleWaveLevels(waveformBarCount)
						const nextLevels = createNextWaveLevels(sourceLevels, audioLevel)
						onWaveformLevelsChange?.(nextLevels)
						return nextLevels
					})
				},
				[onAudioChunk, onWaveformLevelsChange, waveformBarCount],
			)

			const { status, isRecording, toggleRecording, stopRecording, disconnect } = useVoiceInput({
				config,
				onResult,
				onError,
				onStatusChange,
				onAudioChunk: handleAudioChunk,
			})
			const isWaveformVisible =
				status === "connecting" || status === "recording" || status === "processing"

			// Handle hotkey press
			const handleHotkey = useCallback(() => {
				if (disabled) return
				void toggleRecording()
			}, [disabled, toggleRecording])

			// Use ref to keep the latest handleHotkey function
			const handleHotkeyRef = useRef(handleHotkey)
			handleHotkeyRef.current = handleHotkey

			const hotkeyDisplay = getHotkeyDisplayText()

			useImperativeHandle(
				ref,
				() => ({
					stopRecording,
					disconnect,
					isRecording,
					status,
				}),
				[stopRecording, disconnect, isRecording, status],
			)

			useEffect(() => {
				if (!didReportRecordingChangeRef.current) {
					didReportRecordingChangeRef.current = true
					if (!isRecording) return
				}
				onRecordingChange?.(isRecording)
				// eslint-disable-next-line react-hooks/exhaustive-deps
			}, [isRecording])

			useEffect(() => {
				if (isWaveformVisible) return
				updateWaveLevels(createIdleWaveLevels(waveformBarCount))
			}, [isWaveformVisible, updateWaveLevels, waveformBarCount])

			useEffect(() => {
				const handleVoiceInputToggle = () => {
					handleHotkeyRef.current()
				}

				pubsub.subscribe(PubSubEvents.Toggle_Voice_Input, handleVoiceInputToggle)
				return () => {
					pubsub?.unsubscribe(PubSubEvents.Toggle_Voice_Input, handleVoiceInputToggle)
				}
			}, [])

			const getIcon = () => {
				switch (status) {
					case "recording":
					case "processing":
					case "connecting":
						return (
							<VoiceWave
								iconSize={iconSize}
								levels={waveLevels}
								className={waveformClassName}
							/>
						)
					default:
						return <Mic size={iconSize} />
				}
			}

			const getTooltipText = () => {
				const hotkeyText = enableHotkey ? `(${hotkeyDisplay})` : ""
				switch (status) {
					case "idle":
						return `${t("voiceInput.tooltip.idle")} ${hotkeyText}`
					case "recording":
						return `${t("voiceInput.tooltip.recording")} ${hotkeyText}`
					case "error":
						return t("voiceInput.tooltip.error")
					default:
						return placeholder || t("voiceInput.tooltip.default")
				}
			}

			const handleClick = () => {
				if (disabled) return
				if (!toggleOnClick) return
				void toggleRecording()
			}

			return (
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							id={GuideTourElementId.VoiceInputButton}
							type="button"
							className={cn(
								"relative flex size-8 items-center justify-center rounded-md border-0 transition-all",
								"hover:opacity-80 active:opacity-60",
								"disabled:cursor-not-allowed disabled:opacity-60",
								// base: idle, connecting, default
								"bg-fill text-foreground dark:bg-sidebar dark:text-foreground dark:hover:bg-muted dark:hover:text-foreground",
								// recording / processing
								(status === "recording" || status === "processing") &&
									"bg-orange-50 text-orange-600 dark:bg-orange-500/20 dark:text-orange-400",
								// error
								status === "error" &&
									"bg-destructive text-destructive-foreground opacity-90 dark:bg-destructive dark:text-destructive-foreground",
								className,
							)}
							onClick={handleClick}
							disabled={disabled}
							aria-label={getTooltipText()}
							data-testid="voice-input-button"
							data-status={status}
							data-recording={isRecording}
						>
							{children || getIcon()}
						</button>
					</TooltipTrigger>
					<TooltipContent side="top">{getTooltipText()}</TooltipContent>
				</Tooltip>
			)
		},
	),
)

VoiceInput.displayName = "VoiceInput"

export default VoiceInput
export type { VoiceInputProps, VoiceInputRef, VoiceInputStatus } from "./types"
