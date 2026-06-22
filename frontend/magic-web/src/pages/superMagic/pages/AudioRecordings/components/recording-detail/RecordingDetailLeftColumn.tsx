import { useMemo } from "react"
import type { RefObject } from "react"
import type { FlatColorSegment } from "../../utils/chapter-color-segments"
import { parseTranscriptMarkdown } from "../../utils/transcript-parser"
import type { RecordingTranscriptSegment } from "../../types/recording-detail"
import { RecordingDetailAudioPlayer } from "./RecordingDetailAudioPlayer"
import { RecordingDetailTranscriptPanel } from "./RecordingDetailTranscriptPanel"

interface RecordingDetailLeftColumnProps {
	audioRef: RefObject<HTMLAudioElement>
	audioUrl: string
	transcriptMarkdown?: string
	currentSec: number
	currentTime: number
	duration: number
	playing: boolean
	expanded: boolean
	playbackRate: number
	colorSegments?: FlatColorSegment[]
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
	currentSec,
	currentTime,
	duration,
	playing,
	expanded,
	playbackRate,
	colorSegments,
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
				currentSec={currentSec}
				duration={duration}
				playing={playing}
				expanded={expanded}
				playbackRate={playbackRate}
				colorSegments={colorSegments}
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
