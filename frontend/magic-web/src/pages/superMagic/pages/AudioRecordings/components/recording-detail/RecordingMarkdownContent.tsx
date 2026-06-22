import { useMemo } from "react"
import { useLatest } from "ahooks"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { cn } from "@/lib/utils"
import {
	injectMarkdownSpeakerLinks,
	injectMarkdownTimeLinks,
} from "../../utils/markdown-time-links"
import {
	createRecordingMarkdownComponents,
	type RecordingMarkdownLayout,
} from "./recording-markdown-components"
import { RECORDING_MARKDOWN_REHYPE_PLUGINS } from "./recording-markdown-rehype-plugins"

export interface RecordingMarkdownContentProps {
	content: string
	className?: string
	layout?: RecordingMarkdownLayout
	speakerNameMap?: Record<string, string>
	onSpeakerClick?: (speakerId: string) => void
	onTimeClick?: (seconds: number) => void
	timeLinkTestId?: string
	speakerLinkTestId?: string
}

/** Renders completed markdown and turns generated time marks into audio seek actions. */
export function RecordingMarkdownContent({
	content,
	className,
	layout = "desktop",
	speakerNameMap = {},
	onSpeakerClick,
	onTimeClick,
	timeLinkTestId = "recording-detail-time-link",
	speakerLinkTestId = "recording-detail-speaker-link",
}: RecordingMarkdownContentProps) {
	const markdown = injectMarkdownSpeakerLinks(injectMarkdownTimeLinks(content), speakerNameMap)
	// Keep ReactMarkdown component overrides stable during playback RAF re-renders so chip clicks are not lost mid-press.
	const onSpeakerClickRef = useLatest(onSpeakerClick)
	const onTimeClickRef = useLatest(onTimeClick)
	const components = useMemo(
		() =>
			createRecordingMarkdownComponents({
				onSpeakerClick: (speakerId) => onSpeakerClickRef.current?.(speakerId),
				onTimeClick: (seconds) => onTimeClickRef.current?.(seconds),
				timeLinkTestId,
				speakerLinkTestId,
			}),
		[onSpeakerClickRef, onTimeClickRef, speakerLinkTestId, timeLinkTestId],
	)

	return (
		<div
			className={cn(
				"recording-md-prose",
				layout === "mobile" ? "recording-md-prose--mobile" : "recording-md-prose--desktop",
				className,
			)}
			data-testid="recording-detail-markdown-content"
			data-layout={layout}
		>
			<ReactMarkdown
				remarkPlugins={[remarkGfm]}
				rehypePlugins={RECORDING_MARKDOWN_REHYPE_PLUGINS}
				urlTransform={(url) => url}
				components={components}
			>
				{markdown}
			</ReactMarkdown>
		</div>
	)
}
