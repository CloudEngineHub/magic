import MentionContextMenu from "./components/MentionContextMenu"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks"
import { EditorContent, type Editor } from "@/infrastructure/editors/tiptap/react"
import FlexBox from "@/components/base/FlexBox"
import DragOverlay from "./components/DragOverlay"
import { memo } from "react"
import type { RefObject, DragEvent, ClipboardEvent, ReactNode } from "react"
import type { MessageEditorSize } from "./types"
import TabIcon from "./assets/tab.svg"
import { cn } from "@/utils/cn"
import { useEditorPortalSync } from "./hooks/useEditorPortalSync"
import {
	messageEditorContainerVariants,
	messageEditorInnerVariants,
	messageEditorContentVariants,
	messageEditorToolbarVariants,
	messageEditorToolbarLeftVariants,
	messageEditorToolbarRightVariants,
	messageEditorTextContainerVariants,
} from "./variants"
import AiCompletionTip from "@/pages/chatNew/components/MessageEditor/components/AiCompletionTip"
import { SummaryGuideDOMId } from "@/pages/superMagic/components/MessagePanel/components/TopicExamples/SummaryGuide"
import { GuideTourElementId } from "@/pages/superMagic/components/LazyGuideTour"
import { useIsMobile } from "@/hooks/useIsMobile"

interface MessageEditorViewProps {
	className?: string
	containerClassName?: string
	headerContent?: ReactNode
	size: MessageEditorSize
	getWorkspaceFilesList?: () => AttachmentItem[]
	getCurrentProjectId?: () => string | undefined
	tiptapEditor: Editor | null
	domRef: RefObject<HTMLDivElement>
	isDragOver: boolean
	dragEvents: {
		onDragEnter: (e: DragEvent) => void
		onDragLeave: (e: DragEvent) => void
		onDragOver: (e: DragEvent) => void
		onDrop: (e: DragEvent) => void
	}
	onPaste: (e: ClipboardEvent) => void
	onCompositionStart: () => void
	onCompositionEnd: () => void
	topBarLeftContent?: ReactNode
	topBarRightContent?: ReactNode
	bottomLeftContent?: ReactNode
	bottomRightContent?: ReactNode
	outsideBottomContent?: ReactNode
	outsideTopContent?: ReactNode
	uploadModal?: ReactNode
	promptCarouselNode?: ReactNode
	taskDataNode?: ReactNode
	messageQueueNode?: ReactNode
	showAiCompletion: boolean
}

function MessageEditorView({
	className,
	containerClassName,
	headerContent,
	size,
	tiptapEditor,
	getWorkspaceFilesList,
	getCurrentProjectId,
	domRef,
	isDragOver,
	dragEvents,
	onPaste,
	onCompositionStart,
	onCompositionEnd,
	topBarLeftContent,
	topBarRightContent,
	bottomLeftContent,
	bottomRightContent,
	outsideBottomContent,
	outsideTopContent,
	uploadModal,
	promptCarouselNode,
	showAiCompletion,
}: MessageEditorViewProps) {
	const isMobile = useIsMobile()

	// Fix: ensure EditorContent re-renders when editor.contentComponent changes
	// (works around tiptap PureEditorContent stale portal reference bug)
	useEditorPortalSync(tiptapEditor)

	return (
		<>
			<FlexBox vertical className="h-full gap-2">
				{outsideTopContent}
				<div
					className={cn(
						messageEditorContainerVariants({
							size,
							focused: tiptapEditor?.isFocused ?? false,
							mobile: isMobile,
						}),
						containerClassName,
					)}
					onDragEnter={dragEvents.onDragEnter}
					onDragLeave={dragEvents.onDragLeave}
					onDragOver={dragEvents.onDragOver}
					onDrop={dragEvents.onDrop}
					onPasteCapture={onPaste}
					data-testid="super-message-editor-container"
					data-queue-editor-surface
				>
					<FlexBox
						vertical
						className={cn(messageEditorInnerVariants({ size }))}
						data-testid="super-message-editor-inner"
					>
						{(topBarLeftContent || topBarRightContent || headerContent) && (
							<div
								className="flex shrink-0 items-center gap-2 [&:empty]:hidden"
								data-testid="super-message-editor-header"
							>
								<div className="shrink-0 [&:empty]:hidden">{topBarLeftContent}</div>
								<div className="min-w-0 flex-1 [&:empty]:hidden">
									{headerContent}
								</div>
								{topBarRightContent && (
									<div className="ml-auto shrink-0">{topBarRightContent}</div>
								)}
							</div>
						)}
						<div className={cn(messageEditorTextContainerVariants({ size }))}>
							<MentionContextMenu
								editor={tiptapEditor}
								getWorkspaceFilesList={getWorkspaceFilesList}
								getCurrentProjectId={getCurrentProjectId}
							>
								<EditorContent
									ref={domRef}
									editor={tiptapEditor}
									className={cn(
										messageEditorContentVariants({ size }),
										className,
									)}
									onCompositionStart={onCompositionStart}
									onCompositionEnd={onCompositionEnd}
									data-testid="super-message-editor-content"
									id={SummaryGuideDOMId.MessageEditorContent}
								/>
							</MentionContextMenu>
							{promptCarouselNode}
						</div>
						{showAiCompletion && <AiCompletionTip icon={TabIcon as string} />}
						<div
							className={messageEditorToolbarVariants({ size })}
							data-testid="super-message-editor-toolbar"
						>
							<div
								className={messageEditorToolbarLeftVariants({ size })}
								id={GuideTourElementId.ModelSelector}
								data-testid="super-message-editor-toolbar-left"
							>
								{bottomLeftContent}
							</div>
							<div
								className={messageEditorToolbarRightVariants({ size })}
								data-testid="super-message-editor-toolbar-right"
							>
								{bottomRightContent}
							</div>
						</div>
					</FlexBox>
					<DragOverlay visible={isDragOver} />
				</div>
				{uploadModal}
			</FlexBox>
			{outsideBottomContent}
		</>
	)
}

const MemoizedMessageEditorView = memo(MessageEditorView)

export { MemoizedMessageEditorView as MessageEditorView }
