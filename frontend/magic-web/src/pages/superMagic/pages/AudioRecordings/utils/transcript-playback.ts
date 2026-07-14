interface TranscriptSeekController {
	seekTo: (seconds: number, options?: { autoplay?: boolean }) => void
}

/**
 * Starts continuous playback from the selected transcript sentence instead of limiting playback to one segment.
 */
export function playTranscriptFromSegment(
	controller: TranscriptSeekController,
	startSeconds: number,
) {
	controller.seekTo(startSeconds, { autoplay: true })
}
