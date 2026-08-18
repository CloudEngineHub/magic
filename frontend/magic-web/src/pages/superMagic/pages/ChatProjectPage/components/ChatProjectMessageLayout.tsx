import { useMemo, useRef, type ReactNode } from "react"
import MagicSplitter from "@/components/base/MagicSplitter"
import { cn } from "@/lib/utils"
import { CONVERSATION_INPUT_HEIGHT_CONFIG } from "@/pages/superMagic/components/ConversationInputResize/constants"
import ConversationInputResizeHandle from "@/pages/superMagic/components/ConversationInputResize/ConversationInputResizeHandle"
import { ConversationInputLayoutProvider } from "@/pages/superMagic/components/ConversationInputResize/context"
import { useConversationInputHeight } from "@/pages/superMagic/components/ConversationInputResize/useConversationInputHeight"

interface ChatProjectMessageLayoutProps {
	messageList: ReactNode
	input: ReactNode
	isConversationPanelCollapsed: boolean
	scope?: string
	/** Allow callers with extra input controls to raise the shared minimum height. */
	inputMinHeight?: number
}

/** Preserve the existing minimum for conversation layouts without extra controls. */
const DEFAULT_INPUT_MIN_HEIGHT = 200

/** Arrange project conversation content while sharing the desktop input height state machine. */
export default function ChatProjectMessageLayout({
	messageList,
	input,
	isConversationPanelCollapsed,
	scope = "topic-page",
	inputMinHeight = DEFAULT_INPUT_MIN_HEIGHT,
}: ChatProjectMessageLayoutProps) {
	const layoutRef = useRef<HTMLDivElement>(null)
	const inputRef = useRef<HTMLDivElement>(null)
	const inputHeight = useConversationInputHeight({
		scope,
		enabled: !isConversationPanelCollapsed,
		containerRef: inputRef,
		availableRef: layoutRef,
		minHeight: inputMinHeight,
		...CONVERSATION_INPUT_HEIGHT_CONFIG,
	})
	const inputLayoutContext = useMemo(
		() => ({
			fillHeight: inputHeight.fillHeight,
		}),
		[inputHeight.fillHeight],
	)
	return (
		<div
			ref={layoutRef}
			className="h-full min-h-0 w-full"
			data-testid="chat-project-message-layout"
		>
			{/* Keep the Ant bar hidden because the shared handle owns the visible resize interaction. */}
			<MagicSplitter
				layout="vertical"
				className="h-full min-h-0 w-full"
				onResizeStart={inputHeight.onSplitterResizeStart}
				onResize={inputHeight.onSplitterResize}
				onResizeEnd={inputHeight.onSplitterResizeEnd}
			>
				<MagicSplitter.Panel
					className={isConversationPanelCollapsed ? "invisible" : "min-h-0"}
					resizable={!isConversationPanelCollapsed}
				>
					{messageList}
				</MagicSplitter.Panel>
				<MagicSplitter.Panel
					min={inputMinHeight}
					size={inputHeight.effectiveHeight}
					max={inputHeight.maxHeight}
					className={isConversationPanelCollapsed ? "invisible" : "min-h-0"}
					resizable={!isConversationPanelCollapsed}
				>
					<div
						ref={inputRef}
						className={cn(
							"relative flex min-h-0 w-full items-end justify-center overflow-hidden",
							inputHeight.fillHeight && "h-full",
						)}
					>
						{inputHeight.enabled ? (
							// Keep the hover affordance aligned with the centered editor card on wide panels.
							<div className="absolute inset-x-2 top-0 mx-auto h-2 max-w-3xl">
								<ConversationInputResizeHandle
									value={inputHeight.effectiveHeight}
									min={inputMinHeight}
									max={inputHeight.maxHeight}
									onResizeStart={inputHeight.startPointerResize}
									onResize={inputHeight.resizeByPointerDelta}
									onResizeEnd={inputHeight.finishPointerResize}
									onDoubleClick={inputHeight.restoreAutoHeight}
								/>
							</div>
						) : null}
						<ConversationInputLayoutProvider value={inputLayoutContext}>
							{input}
						</ConversationInputLayoutProvider>
					</div>
				</MagicSplitter.Panel>
			</MagicSplitter>
		</div>
	)
}
