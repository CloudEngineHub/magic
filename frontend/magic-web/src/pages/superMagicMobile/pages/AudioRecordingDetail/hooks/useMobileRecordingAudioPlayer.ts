import { useCallback, useEffect, useMemo, useRef, useState } from "react"

interface SegmentRange {
	start: number
	end?: number
}

/** Owns the one shared audio element used by transcript rows and summary time chips. */
export function useMobileRecordingAudioPlayer(audioUrl: string) {
	const audioRef = useRef<HTMLAudioElement | null>(null)
	const segmentEndRef = useRef<number | undefined>(undefined)
	const [currentTime, setCurrentTime] = useState(0)
	const [duration, setDuration] = useState(0)
	const [playing, setPlaying] = useState(false)

	useEffect(() => {
		const audio = audioRef.current
		if (!audio) return

		/** Syncs React state from native audio events for highlight and timer updates. */
		function handleTimeUpdate() {
			const nextTime = audio?.currentTime ?? 0
			setCurrentTime(nextTime)
			if (segmentEndRef.current != null && nextTime >= segmentEndRef.current) {
				audio.pause()
				segmentEndRef.current = undefined
			}
		}

		/** Captures loaded duration once metadata is ready. */
		function handleLoadedMetadata() {
			setDuration(audio?.duration ?? 0)
		}

		/** Mirrors play/pause state into the compact mobile player. */
		function handlePlayState() {
			setPlaying(Boolean(audio && !audio.paused))
		}

		audio.addEventListener("timeupdate", handleTimeUpdate)
		audio.addEventListener("loadedmetadata", handleLoadedMetadata)
		audio.addEventListener("play", handlePlayState)
		audio.addEventListener("pause", handlePlayState)
		audio.addEventListener("ended", handlePlayState)

		return () => {
			audio.removeEventListener("timeupdate", handleTimeUpdate)
			audio.removeEventListener("loadedmetadata", handleLoadedMetadata)
			audio.removeEventListener("play", handlePlayState)
			audio.removeEventListener("pause", handlePlayState)
			audio.removeEventListener("ended", handlePlayState)
		}
	}, [audioUrl])

	useEffect(() => {
		setCurrentTime(0)
		setDuration(0)
		setPlaying(false)
		segmentEndRef.current = undefined
	}, [audioUrl])

	const seekTo = useCallback((seconds: number, options: { autoplay?: boolean } = {}) => {
		const audio = audioRef.current
		if (!audio) return
		audio.currentTime = Math.max(0, seconds)
		segmentEndRef.current = undefined
		if (options.autoplay) void audio.play()
	}, [])

	const playSegment = useCallback((range: SegmentRange) => {
		const audio = audioRef.current
		if (!audio) return
		audio.currentTime = Math.max(0, range.start)
		segmentEndRef.current = range.end
		void audio.play()
	}, [])

	const toggle = useCallback(() => {
		const audio = audioRef.current
		if (!audio) return
		if (audio.paused) {
			void audio.play()
		} else {
			audio.pause()
		}
	}, [])

	const progress = useMemo(() => {
		if (!duration) return 0
		return Math.min(100, Math.max(0, (currentTime / duration) * 100))
	}, [currentTime, duration])

	return {
		audioRef,
		currentTime,
		duration,
		playing,
		progress,
		seekTo,
		playSegment,
		toggle,
	}
}
