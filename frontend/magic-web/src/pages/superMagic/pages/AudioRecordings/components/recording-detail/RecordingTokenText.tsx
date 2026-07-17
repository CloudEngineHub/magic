import { parseRecordingTimeToSeconds } from "../../utils/time"
import {
	RecordingSpeakerChip,
	RecordingTimeChip,
	resolveSpeakerLabel,
} from "./recording-markdown-components"

const INLINE_RECORDING_TOKEN_REGEX = /\bSpeaker-[\w-]+\b|\d{1,3}:[0-5]\d(?::[0-5]\d)?/g
const SPEAKER_TOKEN_REGEX = /^Speaker-[\w-]+$/

export interface RecordingTokenTextProps {
	text: string
	speakerNameMap: Record<string, string>
	onSpeakerClick?: (speakerId: string) => void
	onTimeClick?: (seconds: number) => void
	speakerTestId?: string
	timeTestId?: string
}

/** Renders inline recording tokens in structured cards without invoking block Markdown layout. */
export function RecordingTokenText({
	text,
	speakerNameMap,
	onSpeakerClick,
	onTimeClick,
	speakerTestId = "recording-detail-token-speaker",
	timeTestId = "recording-detail-token-time",
}: RecordingTokenTextProps) {
	return (
		<>
			{splitRecordingInlineText(text).map((part, index) => {
				if (part.type === "speaker") {
					return (
						<RecordingSpeakerChip
							key={`${part.value}-${index}`}
							label={resolveSpeakerLabel(part.value, speakerNameMap)}
							speakerId={part.value}
							onSpeakerClick={onSpeakerClick}
							testId={speakerTestId}
							stopPropagation
						/>
					)
				}

				if (part.type === "time") {
					return (
						<RecordingTimeChip
							key={`${part.value}-${index}`}
							label={part.value}
							seconds={parseRecordingTimeToSeconds(part.value)}
							onTimeClick={onTimeClick}
							testId={timeTestId}
							stopPropagation
						/>
					)
				}

				return <span key={`${part.value}-${index}`}>{part.value}</span>
			})}
		</>
	)
}

type RecordingInlineTextPart =
	| { type: "text"; value: string }
	| { type: "speaker"; value: string }
	| { type: "time"; value: string }

/** Splits a plain inline text field into display fragments while preserving original spacing. */
function splitRecordingInlineText(text: string): RecordingInlineTextPart[] {
	const parts: RecordingInlineTextPart[] = []
	let lastIndex = 0

	INLINE_RECORDING_TOKEN_REGEX.lastIndex = 0
	let match: RegExpExecArray | null
	while ((match = INLINE_RECORDING_TOKEN_REGEX.exec(text)) !== null) {
		if (match.index > lastIndex) {
			parts.push({ type: "text", value: text.slice(lastIndex, match.index) })
		}

		const value = match[0]
		parts.push({
			type: SPEAKER_TOKEN_REGEX.test(value) ? "speaker" : "time",
			value,
		})
		lastIndex = match.index + value.length
	}

	if (lastIndex < text.length) {
		parts.push({ type: "text", value: text.slice(lastIndex) })
	}

	return parts.length > 0 ? parts : [{ type: "text", value: text }]
}
