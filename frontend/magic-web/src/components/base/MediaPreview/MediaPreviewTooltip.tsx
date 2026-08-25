import { Pause, Play, X } from "lucide-react"
import {
	cloneElement,
	useCallback,
	useEffect,
	useRef,
	useState,
	type PointerEvent as ReactPointerEvent,
	type RefObject,
} from "react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/shadcn-ui/tooltip"
import { useIsMobile } from "@/hooks/useIsMobile"
import type { MediaPreviewTooltipProps } from "./types"

const DEFAULT_SIZE = 250
function formatTime(value: number) {
	if (!Number.isFinite(value) || value < 0) value = 0
	const totalSeconds = Math.floor(value)
	const hours = Math.floor(totalSeconds / 3600)
	const minutes = Math.floor((totalSeconds % 3600) / 60)
	const seconds = totalSeconds % 60
	return hours > 0
		? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
		: `${minutes}:${String(seconds).padStart(2, "0")}`
}

function AudioPlayer({
	src,
	fileName,
	audioRef,
	onError,
	labels,
}: {
	src: string
	fileName: string
	audioRef: RefObject<HTMLAudioElement>
	onError?: () => void
	labels: MediaPreviewTooltipProps["audioLabels"]
}) {
	const [playing, setPlaying] = useState(false)
	const [currentTime, setCurrentTime] = useState(0)
	const [duration, setDuration] = useState(0)
	const isSeekingRef = useRef(false)
	const progressPercent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0

	const playAudio = useCallback((audio: HTMLAudioElement) => {
		void audio
			.play()
			.then(() => setPlaying(true))
			.catch(() => setPlaying(false))
	}, [])

	useEffect(() => {
		setPlaying(false)
		setCurrentTime(0)
		setDuration(0)
	}, [src])

	const handleSeek = useCallback(
		(value: number) => {
			if (!Number.isFinite(value)) return
			const nextTime = Math.max(0, Math.min(value, duration || value))
			setCurrentTime(nextTime)
			const audio = audioRef.current
			if (audio) {
				audio.currentTime = nextTime
			}
		},
		[audioRef, duration],
	)

	const seekFromPointer = useCallback(
		(event: ReactPointerEvent<HTMLInputElement>) => {
			const rect = event.currentTarget.getBoundingClientRect()
			if (rect.width <= 0 || duration <= 0) return
			const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
			handleSeek(ratio * duration)
		},
		[duration, handleSeek],
	)

	return (
		<div className="box-border flex min-w-0 max-w-full items-center gap-3 px-2.5 pb-3 pt-2 text-white">
			<audio
				ref={audioRef}
				src={src}
				preload="metadata"
				aria-label={fileName}
				className="hidden"
				onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 0)}
				onDurationChange={(event) => setDuration(event.currentTarget.duration || 0)}
				onTimeUpdate={(event) => {
					if (!isSeekingRef.current) setCurrentTime(event.currentTarget.currentTime)
				}}
				onPlay={() => setPlaying(true)}
				onPause={() => setPlaying(false)}
				onEnded={() => {
					setPlaying(false)
					setCurrentTime(duration)
				}}
				onError={onError}
			/>
			<button
				type="button"
				className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-white/15 hover:bg-white/25"
				aria-label={playing ? labels.pause : labels.play}
				onClick={() => {
					const audio = audioRef.current
					if (!audio) return
					if (playing) audio.pause()
					else playAudio(audio)
				}}
			>
				{playing ? (
					<Pause size={15} fill="currentColor" strokeWidth={1.5} aria-hidden />
				) : (
					<Play
						size={15}
						fill="currentColor"
						strokeWidth={1.5}
						className="translate-x-px"
						aria-hidden
					/>
				)}
			</button>
			<div className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
				<div className="relative h-3 w-full min-w-0">
					<div
						className="pointer-events-none absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full"
						style={{
							background: `linear-gradient(to right, #fff 0%, #fff ${progressPercent}%, rgb(255 255 255 / 30%) ${progressPercent}%, rgb(255 255 255 / 30%) 100%)`,
						}}
					/>
					<input
						type="range"
						className="relative z-10 m-0 h-3 w-full min-w-0 max-w-full cursor-pointer touch-none appearance-none rounded-full bg-transparent accent-white [&::-moz-range-progress]:bg-transparent [&::-moz-range-thumb]:size-3 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white [&::-moz-range-track]:h-0.5 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-transparent [&::-webkit-slider-runnable-track]:h-0.5 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:mt-[-5px] [&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-0 [&::-webkit-slider-thumb]:bg-white"
						min={0}
						max={duration || 0}
						step={0.1}
						value={Math.min(currentTime, duration || currentTime)}
						aria-label={labels.progress}
						onPointerDown={(event) => {
							isSeekingRef.current = true
							event.currentTarget.setPointerCapture?.(event.pointerId)
							seekFromPointer(event)
						}}
						onPointerMove={(event) => {
							if (isSeekingRef.current) seekFromPointer(event)
						}}
						onPointerUp={(event) => {
							seekFromPointer(event)
							isSeekingRef.current = false
							event.currentTarget.releasePointerCapture?.(event.pointerId)
						}}
						onPointerCancel={() => {
							isSeekingRef.current = false
						}}
						onBlur={() => {
							isSeekingRef.current = false
						}}
						onChange={(event) => handleSeek(Number(event.currentTarget.value))}
					/>
				</div>
				<span className="w-full text-left text-xs tabular-nums">
					{formatTime(currentTime)} / {formatTime(duration)}
				</span>
			</div>
		</div>
	)
}

export function MediaPreviewTooltip(props: MediaPreviewTooltipProps) {
	const {
		children,
		mediaType,
		fileName,
		previewUrl,
		posterUrl,
		audioUrl,
		audioLabels,
		poster,
		previewContent,
		isLoading = false,
		hasError = false,
		errorMessage,
		closeLabel,
		enableTouchTrigger = false,
		disabled = false,
		side = "top",
		maxWidth = DEFAULT_SIZE,
		maxHeight = DEFAULT_SIZE,
		previewSize,
		container,
		open: controlledOpen,
		onOpenChange,
	} = props
	const isMobile = useIsMobile()
	const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
	const videoRef = useRef<HTMLVideoElement>(null)
	const audioRef = useRef<HTMLAudioElement>(null)
	const [videoReady, setVideoReady] = useState(false)
	const [mediaError, setMediaError] = useState(false)
	const open = controlledOpen ?? uncontrolledOpen
	const contentWidth = previewSize?.width ?? maxWidth
	const contentHeight = previewSize?.height ?? Math.round(maxWidth * 0.5625)
	const touchInteractionRef = useRef(false)

	useEffect(() => {
		setMediaError(false)
	}, [mediaType, previewUrl, posterUrl, audioUrl])

	useEffect(() => {
		const video = videoRef.current
		if (!video || mediaType !== "video" || !open || !previewUrl) return
		void video.play().catch(() => undefined)
	}, [mediaType, open, previewUrl])

	const handleOpenChange = useCallback(
		(nextOpen: boolean) => {
			if (controlledOpen === undefined) setUncontrolledOpen(nextOpen)
			if (!nextOpen) {
				videoRef.current?.pause()
				if (videoRef.current) videoRef.current.currentTime = 0
				audioRef.current?.pause()
				if (audioRef.current) audioRef.current.currentTime = 0
				setVideoReady(false)
				setMediaError(false)
			}
			onOpenChange?.(nextOpen)
		},
		[controlledOpen, onOpenChange],
	)

	useEffect(() => {
		if (!open || !enableTouchTrigger) return
		const handlePointerDown = (event: globalThis.PointerEvent) => {
			const target = event.target
			if (!(target instanceof Element)) return
			if (target.closest("[data-media-preview-trigger], [data-media-preview-content]")) return
			handleOpenChange(false)
		}
		document.addEventListener("pointerdown", handlePointerDown, true)
		return () => document.removeEventListener("pointerdown", handlePointerDown, true)
	}, [enableTouchTrigger, handleOpenChange, open])

	if (disabled || (isMobile && !enableTouchTrigger)) return <>{children}</>

	const trigger = cloneElement(children, {
		"data-media-preview-trigger": "",
		onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
			children.props.onPointerDown?.(event)
			if (!enableTouchTrigger || event.pointerType !== "touch") return
			touchInteractionRef.current = true
			event.preventDefault()
			event.stopPropagation()
			handleOpenChange(true)
		},
		onClick: (event: React.MouseEvent<HTMLElement>) => {
			children.props.onClick?.(event)
			if (!touchInteractionRef.current) return
			touchInteractionRef.current = false
			event.preventDefault()
			event.stopPropagation()
		},
		onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => {
			children.props.onPointerCancel?.(event)
			touchInteractionRef.current = false
		},
	})
	const content = (
		<div
			className="relative overflow-hidden rounded-md border border-white/15 bg-black/90 text-white shadow-lg"
			data-media-preview-content=""
			onClick={(event) => event.stopPropagation()}
			onMouseDown={(event) => event.stopPropagation()}
			onPointerDown={(event) => event.stopPropagation()}
			onTouchStart={(event) => event.stopPropagation()}
		>
			<div
				className="absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-2 bg-gradient-to-b from-black/80 to-transparent px-2.5 py-1.5"
				data-reference-media-tooltip-header=""
			>
				<span className="min-w-0 truncate text-xs font-medium" title={fileName}>
					{fileName}
				</span>
				<button
					type="button"
					className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-white/15 hover:bg-white/25"
					aria-label={closeLabel}
					onClick={() => handleOpenChange(false)}
				>
					<X size={14} />
				</button>
			</div>
			{isLoading ? (
				<div
					className="flex min-h-[72px] max-w-full items-center justify-center"
					style={{ width: contentWidth, height: 120 }}
				>
					<span className="animate-spin">◌</span>
				</div>
			) : hasError || (mediaError && !poster && !posterUrl) ? (
				<div className="flex min-h-[72px] items-center justify-center px-4 py-8 text-xs text-white/70">
					{errorMessage}
				</div>
			) : previewContent ? (
				previewContent
			) : mediaType === "image" ? (
				<img
					src={previewUrl ?? undefined}
					alt={fileName}
					className="block max-w-full object-contain"
					style={{ width: contentWidth, maxHeight: contentHeight }}
					onError={() => setMediaError(true)}
				/>
			) : mediaType === "video" ? (
				<div
					className="relative flex items-center justify-center bg-black"
					style={{ width: contentWidth, height: contentHeight }}
				>
					{previewUrl ? (
						<video
							ref={videoRef}
							src={previewUrl}
							poster={posterUrl ?? undefined}
							muted
							loop
							autoPlay
							playsInline
							preload="auto"
							aria-label={fileName}
							className="block h-full w-full object-contain"
							onCanPlay={() => setVideoReady(true)}
							onError={() => {
								setVideoReady(false)
								setMediaError(true)
							}}
						/>
					) : null}
					{!videoReady && poster ? (
						<div className="absolute inset-0">{poster}</div>
					) : null}
				</div>
			) : audioUrl || previewUrl ? (
				<div className="box-border w-full min-w-0 max-w-full pt-9">
					<AudioPlayer
						src={audioUrl ?? previewUrl ?? ""}
						fileName={fileName}
						audioRef={audioRef}
						onError={() => setMediaError(true)}
						labels={audioLabels}
					/>
				</div>
			) : null}
		</div>
	)

	return (
		<Tooltip open={open} onOpenChange={handleOpenChange} delayDuration={250}>
			<TooltipTrigger asChild>{trigger}</TooltipTrigger>
			<TooltipContent
				side={side}
				sideOffset={8}
				className="!p-0"
				container={container}
				style={{
					maxWidth: mediaType === "audio" ? "calc(100vw - 32px)" : maxWidth,
					maxHeight,
					...(mediaType === "image" || mediaType === "audio" ? { width: maxWidth } : {}),
				}}
			>
				{content}
			</TooltipContent>
		</Tooltip>
	)
}
