import { Pause, Play } from "lucide-react"
import { useCallback, useEffect, useState, type CSSProperties, type RefObject } from "react"
import { useCanvasDesignI18n } from "../../../app/providers/I18nProvider"
import styles from "../../editors/message/index.module.css"

interface ReferenceAudioTooltipPlayerProps {
	src: string
	fileName: string
	audioRef: RefObject<HTMLAudioElement | null>
	autoPlay?: boolean
}

function normalizeTime(seconds: number): number {
	return Number.isFinite(seconds) ? Math.max(0, seconds) : 0
}

function formatTime(seconds: number): string {
	const totalSeconds = Math.floor(normalizeTime(seconds))
	const hours = Math.floor(totalSeconds / 3600)
	const minutes = Math.floor((totalSeconds % 3600) / 60)
	const remainingSeconds = totalSeconds % 60

	if (hours > 0) {
		return `${hours}:${minutes.toString().padStart(2, "0")}:${remainingSeconds
			.toString()
			.padStart(2, "0")}`
	}

	return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`
}

/** SourceList 音频 Tooltip 的精简播放器，只暴露播放、进度和时长。 */
export function ReferenceAudioTooltipPlayer(props: ReferenceAudioTooltipPlayerProps) {
	const { src, fileName, audioRef, autoPlay = false } = props
	const { t } = useCanvasDesignI18n()
	const [isPlaying, setIsPlaying] = useState(false)
	const [currentTime, setCurrentTime] = useState(0)
	const [duration, setDuration] = useState(0)

	useEffect(() => {
		setIsPlaying(false)
		setCurrentTime(0)
		setDuration(0)
	}, [src])

	const boundedCurrentTime = Math.min(normalizeTime(currentTime), normalizeTime(duration))
	const progressPercent = duration > 0 ? Math.min(100, (boundedCurrentTime / duration) * 100) : 0

	const playAudio = useCallback((audio: HTMLAudioElement) => {
		void audio
			.play()
			.then(() => setIsPlaying(true))
			.catch(() => setIsPlaying(false))
	}, [])

	useEffect(() => {
		if (!autoPlay) return
		const audio = audioRef.current
		if (!audio) return

		if (audio.readyState >= 2) {
			playAudio(audio)
			return
		}

		const handleCanPlay = () => playAudio(audio)
		audio.addEventListener("canplay", handleCanPlay, { once: true })
		return () => audio.removeEventListener("canplay", handleCanPlay)
	}, [audioRef, autoPlay, playAudio, src])

	const handleTogglePlay = useCallback(() => {
		const audio = audioRef.current
		if (!audio) return

		if (isPlaying) {
			audio.pause()
			setIsPlaying(false)
			return
		}

		if (duration > 0 && currentTime >= duration) {
			audio.currentTime = 0
			setCurrentTime(0)
		}
		playAudio(audio)
	}, [audioRef, currentTime, duration, isPlaying, playAudio])

	const handleProgressInput = useCallback(
		(value: number) => {
			const audio = audioRef.current
			if (!audio || !Number.isFinite(value)) return
			const nextTime = Math.max(0, Math.min(value, normalizeTime(duration)))
			audio.currentTime = nextTime
			setCurrentTime(nextTime)
		},
		[audioRef, duration],
	)

	const syncDuration = useCallback((audio: HTMLAudioElement) => {
		setDuration(normalizeTime(audio.duration))
	}, [])

	return (
		<div className={styles.referenceMediaTooltipAudioPlayer}>
			<audio
				ref={audioRef}
				preload="metadata"
				src={src}
				aria-label={fileName}
				className={styles.referenceMediaTooltipAudioElement}
				onLoadedMetadata={(event) => syncDuration(event.currentTarget)}
				onDurationChange={(event) => syncDuration(event.currentTarget)}
				onTimeUpdate={(event) =>
					setCurrentTime(normalizeTime(event.currentTarget.currentTime))
				}
				onPlay={() => setIsPlaying(true)}
				onPause={() => setIsPlaying(false)}
				onEnded={(event) => {
					setIsPlaying(false)
					setCurrentTime(normalizeTime(event.currentTarget.duration))
				}}
			/>
			<button
				type="button"
				className={styles.referenceMediaTooltipAudioPlayButton}
				aria-label={
					isPlaying
						? t("video.fullscreen.pause", "暂停")
						: t("video.fullscreen.play", "播放")
				}
				onClick={handleTogglePlay}
			>
				{isPlaying ? (
					<Pause size={15} fill="currentColor" strokeWidth={1.5} aria-hidden />
				) : (
					<Play
						size={15}
						fill="currentColor"
						strokeWidth={1.5}
						className={styles.referenceMediaTooltipAudioPlayIcon}
						aria-hidden
					/>
				)}
			</button>
			<span className={styles.referenceMediaTooltipAudioTime}>
				{formatTime(boundedCurrentTime)} / {formatTime(duration)}
			</span>
			<input
				type="range"
				className={styles.referenceMediaTooltipAudioProgress}
				min={0}
				max={normalizeTime(duration)}
				step={0.1}
				value={boundedCurrentTime}
				aria-label={t("video.fullscreen.progress", "播放进度")}
				style={{ "--progress": `${progressPercent}%` } as CSSProperties}
				onInput={(event) => handleProgressInput(Number(event.currentTarget.value))}
				onChange={(event) => handleProgressInput(Number(event.currentTarget.value))}
			/>
		</div>
	)
}
