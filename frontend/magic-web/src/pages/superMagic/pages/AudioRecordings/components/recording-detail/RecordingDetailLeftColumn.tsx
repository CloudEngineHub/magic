import { useMemo } from "react"
import type { RefObject } from "react"
import { parseTranscriptMarkdown } from "../../utils/transcript-parser"
import type { RecordingTranscriptSegment } from "../../types/recording-detail"
import { RecordingDetailAudioPlayer } from "./RecordingDetailAudioPlayer"
import { RecordingDetailTranscriptPanel } from "./RecordingDetailTranscriptPanel"

interface RecordingDetailLeftColumnProps {
	audioRef: RefObject<HTMLAudioElement>
	audioUrl: string
	transcriptMarkdown?: string
	currentTime: number
	duration: number
	progress: number
	playing: boolean
	expanded: boolean
	playbackRate: number
	speakerNameMap: Record<string, string>
	onToggle: () => void
	onSeek: (seconds: number) => void
	onPlaySegment: (segment: RecordingTranscriptSegment) => void
	onExpandedChange: (expanded: boolean) => void
	onPlaybackRateChange: (rate: number) => void
	onOpenSpeakerSettings: () => void
}

/** Left workbench column combining inline player and transcript list. */
export function RecordingDetailLeftColumn({
	audioRef,
	audioUrl,
	transcriptMarkdown,
	currentTime,
	duration,
	progress,
	playing,
	expanded,
	playbackRate,
	speakerNameMap,
	onToggle,
	onSeek,
	onPlaySegment,
	onExpandedChange,
	onPlaybackRateChange,
	onOpenSpeakerSettings,
}: RecordingDetailLeftColumnProps) {
	const segments = useMemo(
		() => (transcriptMarkdown ? parseTranscriptMarkdown(transcriptMarkdown) : []),
		[transcriptMarkdown],
	)

	return (
		<>
			<RecordingDetailAudioPlayer
				audioRef={audioRef}
				audioUrl={audioUrl}
				currentTime={currentTime}
				duration={duration}
				progress={progress}
				playing={playing}
				expanded={expanded}
				playbackRate={playbackRate}
				onToggle={onToggle}
				onSeek={onSeek}
				onExpandedChange={onExpandedChange}
				onPlaybackRateChange={onPlaybackRateChange}
			/>
			<RecordingDetailTranscriptPanel
				segments={segments}
				currentTime={currentTime}
				speakerNameMap={speakerNameMap}
				onSegmentClick={(segment) =>
					onPlaySegment({
						...segment,
					})
				}
				onOpenSpeakerSettings={onOpenSpeakerSettings}
			/>
		</>
	)
}
