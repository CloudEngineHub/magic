import type { AnchorHTMLAttributes } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { cn } from "@/lib/utils"
import {
	injectMarkdownSpeakerLinks,
	injectMarkdownTimeLinks,
	parseMarkdownSpeakerLink,
	parseMarkdownTimeLink,
} from "../utils/markdown-time-links"

interface MobileRecordingMarkdownContentProps {
	content: string
	className?: string
	speakerNameMap?: Record<string, string>
	onSpeakerClick?: (speakerId: string) => void
	onTimeClick?: (seconds: number) => void
}

/** Renders completed markdown and turns generated time marks into audio seek actions. */
export function MobileRecordingMarkdownContent({
	content,
	className,
	speakerNameMap = {},
	onSpeakerClick,
	onTimeClick,
}: MobileRecordingMarkdownContentProps) {
	const markdown = injectMarkdownSpeakerLinks(injectMarkdownTimeLinks(content), speakerNameMap)

	return (
		<div
			className={cn(
				"prose prose-sm prose-headings:scroll-mt-20 prose-headings:text-foreground prose-p:my-3 prose-a:text-foreground prose-strong:text-foreground prose-ul:my-3 prose-ol:my-3 prose-li:my-1 max-w-none break-words text-[14px] leading-7 text-foreground",
				className,
			)}
			data-testid="mobile-recording-markdown-content"
		>
			<ReactMarkdown
				remarkPlugins={[remarkGfm]}
				urlTransform={(url) => url}
				components={{
					a: (props) => (
						<MarkdownAnchor
							{...props}
							onSpeakerClick={onSpeakerClick}
							onTimeClick={onTimeClick}
						/>
					),
					code: (props) => <MarkdownCode {...props} onTimeClick={onTimeClick} />,
				}}
			>
				{markdown}
			</ReactMarkdown>
		</div>
	)
}

/** Converts inline code-wrapped magic-time links into playable time controls. */
function MarkdownCode({
	children,
	onTimeClick,
}: {
	children?: React.ReactNode
	onTimeClick?: (seconds: number) => void
}) {
	const text = String(children ?? "").trim()
	const match = text.match(/^\[([^\]]+)]\(magic-time:\/\/\/?([^)]+)\)$/)
	const seconds = match ? Number(match[2]) : null

	if (match && Number.isFinite(seconds)) {
		return (
			<button
				type="button"
				className="inline-flex rounded-full bg-foreground px-1.5 py-0.5 align-baseline text-[12px] font-medium leading-4 text-background"
				onClick={() => onTimeClick?.(seconds as number)}
				data-testid="mobile-recording-time-link"
			>
				{match[1]}
			</button>
		)
	}

	return <code>{children}</code>
}

/** Keeps regular links intact while internal magic-time links seek the shared audio player. */
function MarkdownAnchor({
	href,
	children,
	onSpeakerClick,
	onTimeClick,
	...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
	onSpeakerClick?: (speakerId: string) => void
	onTimeClick?: (seconds: number) => void
}) {
	const seconds = parseMarkdownTimeLink(href)
	const speakerId = parseMarkdownSpeakerLink(href)

	if (seconds != null) {
		return (
			<button
				type="button"
				className="inline-flex rounded-full bg-foreground px-1.5 py-0.5 align-baseline text-[12px] font-medium leading-4 text-background"
				onClick={() => onTimeClick?.(seconds)}
				data-testid="mobile-recording-time-link"
			>
				{children}
			</button>
		)
	}

	if (speakerId) {
		return (
			<button
				type="button"
				className="mx-0.5 inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-100 px-2 py-0.5 align-baseline text-[12px] font-medium leading-4 text-foreground active:opacity-70"
				onClick={() => onSpeakerClick?.(speakerId)}
				data-testid="mobile-recording-speaker-link"
			>
				<span className="size-1.5 rounded-full bg-blue-500" />
				{children}
			</button>
		)
	}

	return (
		<a {...rest} href={href} target="_blank" rel="noreferrer">
			{children}
		</a>
	)
}
