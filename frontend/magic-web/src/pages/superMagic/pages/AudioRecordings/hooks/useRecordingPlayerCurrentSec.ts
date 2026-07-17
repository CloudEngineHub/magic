import { useEffect, useRef, useState, type RefObject } from "react"

/**
 * Tracks audio currentTime at RAF cadence while playing so waveform progress stays smooth.
 * Isolates high-frequency updates from the parent detail page render tree.
 */
export function useRecordingPlayerCurrentSec(
	audioRef: RefObject<HTMLAudioElement>,
	playing: boolean,
	fallbackSec = 0,
) {
	const [currentSec, setCurrentSec] = useState(fallbackSec)
	const fallbackSecRef = useRef(fallbackSec)
	fallbackSecRef.current = fallbackSec

	/** Sync external position (e.g. audio URL reset) only while paused — never during RAF playback. */
	useEffect(() => {
		if (playing) return
		setCurrentSec(fallbackSec)
	}, [fallbackSec, playing])

	useEffect(() => {
		const audio = audioRef.current
		if (!playing) {
			setCurrentSec(audio?.currentTime ?? fallbackSecRef.current)
			return
		}

		let raf = 0
		const loop = () => {
			setCurrentSec(audioRef.current?.currentTime ?? 0)
			raf = requestAnimationFrame(loop)
		}
		raf = requestAnimationFrame(loop)
		return () => cancelAnimationFrame(raf)
		// fallbackSec intentionally omitted: parent passes player.currentTime which updates on
		// timeupdate (~4Hz). Including it would cancel/restart RAF every tick and jitter the waveform.
	}, [audioRef, playing])

	useEffect(() => {
		if (playing) return
		const audio = audioRef.current
		if (!audio) return

		/** Sync waveform position after programmatic seeks while paused. */
		function handleSeeked() {
			setCurrentSec(audio?.currentTime ?? 0)
		}

		audio.addEventListener("seeked", handleSeeked)
		return () => audio.removeEventListener("seeked", handleSeeked)
	}, [audioRef, playing])

	return currentSec
}
