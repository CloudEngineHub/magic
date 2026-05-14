import { EditorContent } from "@tiptap/react"
import { ArrowUp, Loader2, Plus, Square, X } from "lucide-react"
import { useDebounceFn } from "ahooks"
import { observer } from "mobx-react-lite"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/shadcn-ui/button"
import { cn } from "@/lib/utils"
import type {
	SceneEditorContext,
	SceneEditorNodes,
} from "@/pages/superMagic/components/MainInputContainer/components/editors/types"
import { MessageEditorStoreProvider } from "@/pages/superMagic/components/MessageEditor/stores"
import SuperMagicVoiceInput from "@/pages/superMagic/components/MessageEditor/components/VoiceInput"
import type { VoiceInputStatus } from "@/components/business/VoiceInput"
import { TopicMode } from "@/pages/superMagic/pages/Workspace/TopicMode"
import type { SceneItem } from "@/pages/superMagic/types/skill"
import { useSceneSelection } from "@/pages/superMagic/components/MainInputContainer/hooks"
import { useCurrentSceneConfig } from "@/pages/superMagic/components/MainInputContainer/hooks/useCurrentSceneConfig"
import { sceneStateStore } from "@/pages/superMagic/components/MainInputContainer/stores"
import superMagicModeService from "@/services/superMagic/SuperMagicModeService"
import MobileComposerAddSheet from "./MobileComposerAddSheet"
import MobileComposerAttachments from "./MobileComposerAttachments"
import MobileComposerHeader from "./MobileComposerHeader"
import MobileScenePanels from "./MobileScenePanels"
import useMobileComposerLogic from "./useMobileComposerLogic"

interface MobileComposerProps {
	editorContext: SceneEditorContext
	editorNodes?: SceneEditorNodes
	scenes?: SceneItem[]
	enableReEditMessageFromPubSub?: boolean
}

const mobileComposerEditorClassName = cn(
	"max-h-[100px] min-h-0 overflow-hidden text-sm text-foreground",
	"[&_.ProseMirror]:m-0 [&_.ProseMirror]:max-h-[100px] [&_.ProseMirror]:overflow-y-auto",
	"[&_.ProseMirror]:break-words [&_.ProseMirror]:text-sm [&_.ProseMirror]:outline-none",
	"[&_.ProseMirror_p]:m-0 [&_.ProseMirror_p]:break-all [&_.ProseMirror_p]:p-0",
	"[&_.ProseMirror_.is-editor-empty:first-child]:relative",
	"[&_.ProseMirror_.is-editor-empty:first-child::before]:pointer-events-none",
	"[&_.ProseMirror_.is-editor-empty:first-child::before]:absolute",
	"[&_.ProseMirror_.is-editor-empty:first-child::before]:left-0",
	"[&_.ProseMirror_.is-editor-empty:first-child::before]:top-0",
	"[&_.ProseMirror_.is-editor-empty:first-child::before]:block",
	"[&_.ProseMirror_.is-editor-empty:first-child::before]:max-w-full",
	"[&_.ProseMirror_.is-editor-empty:first-child::before]:overflow-hidden",
	"[&_.ProseMirror_.is-editor-empty:first-child::before]:whitespace-nowrap",
	"[&_.ProseMirror_.is-editor-empty:first-child::before]:text-ellipsis",
	"[&_.ProseMirror_.is-editor-empty:first-child::before]:text-muted-foreground",
	"[&_.ProseMirror_.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]",
)

const voiceRecordingWaveformClassName = cn(
	"flex h-9 flex-1 items-center justify-center gap-1 overflow-hidden px-2",
)

function createMobileVoiceWaveformLevels(barCount = 44) {
	return Array.from({ length: barCount }, (_, index) => {
		const middle = (barCount - 1) / 2
		const distanceFromMiddle = middle > 0 ? Math.abs(index - middle) / middle : 0
		return Math.max(0.18, 0.62 - distanceFromMiddle * 0.32)
	})
}

function MobileVoiceRecordingWaveform({ levels }: { levels: number[] }) {
	return (
		<div className={voiceRecordingWaveformClassName} data-testid="mobile-voice-waveform">
			{levels.map((level, index) => (
				<span
					key={index}
					className="w-0.5 shrink-0 rounded-full bg-primary transition-[height] duration-100"
					style={{ height: `${Math.max(6, level * 34)}px` }}
					data-testid="mobile-voice-waveform-bar"
				/>
			))}
		</div>
	)
}

function MobileComposerComponent({
	editorContext,
	editorNodes,
	scenes,
	enableReEditMessageFromPubSub = false,
}: MobileComposerProps) {
	const [isAddSheetOpen, setIsAddSheetOpen] = useState(false)
	const logic = useMobileComposerLogic({
		editorContext,
		enableReEditMessageFromPubSub,
	})
	const [isVoicePanelActive, setIsVoicePanelActive] = useState(false)
	const [isVoiceRecording, setIsVoiceRecording] = useState(false)
	const [isVoiceConfirming, setIsVoiceConfirming] = useState(false)
	const [voiceWaveformLevels, setVoiceWaveformLevels] = useState(() =>
		createMobileVoiceWaveformLevels(),
	)
	const [voiceRecordingStartedAt, setVoiceRecordingStartedAt] = useState<number | null>(null)
	const [voiceRecordingElapsedSeconds, setVoiceRecordingElapsedSeconds] = useState(0)
	const voiceInputTextRef = useRef("")
	const isVoiceConfirmingRef = useRef(false)
	const voicePanelIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const isRecordSummaryMode = editorContext.topicMode === TopicMode.RecordSummary
	const effectiveScenes =
		scenes ??
		superMagicModeService.getModeConfigWithLegacy(
			logic.effectiveTopicMode,
			undefined,
			false,
			editorContext.agentCode ?? logic.selectedTopic?.agent_code,
		)?.mode.playbooks
	const { hasOnlyScene } = useSceneSelection({
		scenes: effectiveScenes,
		sceneStateStore,
	})
	const { panels: currentScenePanels, isLoading: isScenePanelLoading } = useCurrentSceneConfig({
		topicMode: editorContext.topicMode,
	})
	const hasScenePanels = isScenePanelLoading || currentScenePanels.length > 0
	const shouldRenderPanelsInHeader = hasOnlyScene || (!effectiveScenes?.length && hasScenePanels)

	const files = logic.store.fileUploadStore.files
	const shouldShowInterrupt = logic.isTaskRunning
	const editorModeSwitchNode = isRecordSummaryMode
		? (editorContext.editorModeSwitch?.({ disabled: false }) ?? null)
		: null
	const sendButtonDisabled = useMemo(() => {
		if (shouldShowInterrupt) return false
		if (logic.isPreparingSend) return true
		if (!logic.store.fileUploadStore.isAllFilesUploaded) return true
		if (logic.showLoading) return false
		return logic.store.editorStore.isEmpty
	}, [
		logic.isPreparingSend,
		logic.showLoading,
		logic.store.editorStore.isEmpty,
		logic.store.fileUploadStore.isAllFilesUploaded,
		shouldShowInterrupt,
	])
	const { run: handleActionClick } = useDebounceFn(
		() => {
			if (shouldShowInterrupt) {
				logic.handleInterrupt()
				return
			}

			logic.handleSend()
		},
		{
			wait: 300,
			leading: true,
			trailing: false,
		},
	)

	const clearVoicePanelIdleTimer = useCallback(() => {
		if (!voicePanelIdleTimerRef.current) return

		clearTimeout(voicePanelIdleTimerRef.current)
		voicePanelIdleTimerRef.current = null
	}, [])

	const resetVoicePanel = useCallback(() => {
		clearVoicePanelIdleTimer()
		voiceInputTextRef.current = ""
		isVoiceConfirmingRef.current = false
		setIsVoicePanelActive(false)
		setIsVoiceRecording(false)
		setIsVoiceConfirming(false)
		setVoiceWaveformLevels(createMobileVoiceWaveformLevels())
		setVoiceRecordingStartedAt(null)
		setVoiceRecordingElapsedSeconds(0)
	}, [clearVoicePanelIdleTimer])

	const handleVoiceRecordingChange = useCallback(
		(isRecording: boolean) => {
			if (!isRecording) {
				setIsVoiceRecording(false)
				return
			}

			clearVoicePanelIdleTimer()
			voiceInputTextRef.current = ""
			isVoiceConfirmingRef.current = false
			setIsVoicePanelActive(true)
			setIsVoiceRecording(true)
			setIsVoiceConfirming(false)
			setVoiceWaveformLevels(createMobileVoiceWaveformLevels())
			setVoiceRecordingStartedAt(Date.now())
			setVoiceRecordingElapsedSeconds(0)
		},
		[clearVoicePanelIdleTimer],
	)

	const handleVoiceStatusChange = useCallback(
		(status: VoiceInputStatus) => {
			if (status === "connecting" || status === "recording" || status === "processing") {
				clearVoicePanelIdleTimer()
				setIsVoicePanelActive(true)
				return
			}

			if (status === "error") {
				resetVoicePanel()
				return
			}

			if (status !== "idle") return

			clearVoicePanelIdleTimer()
			voicePanelIdleTimerRef.current = setTimeout(() => {
				if (isVoiceConfirmingRef.current) return
				setIsVoicePanelActive(false)
			}, 180)
		},
		[clearVoicePanelIdleTimer, resetVoicePanel],
	)

	const handleDeferredVoiceTextChange = useCallback((text: string) => {
		voiceInputTextRef.current = text
	}, [])

	const appendVoiceTextToEditor = useCallback(
		(text: string) => {
			const editor = logic.tiptapEditor
			if (!editor || editor.isDestroyed) return
			if (!text) return

			const insertPosition = Math.max(1, editor.state.doc.content.size - 1)
			editor.chain().focus().insertContentAt(insertPosition, text).run()
			logic.store.editorStore.setValue(editor.getJSON())
		},
		[logic.store.editorStore, logic.tiptapEditor],
	)

	const handleCancelVoiceInput = useCallback(() => {
		logic.voiceInputRef.current?.disconnect()
		resetVoicePanel()
	}, [logic.voiceInputRef, resetVoicePanel])

	const handleConfirmVoiceInput = useCallback(async () => {
		if (isVoiceConfirmingRef.current) return

		isVoiceConfirmingRef.current = true
		setIsVoiceConfirming(true)

		try {
			await Promise.resolve(logic.voiceInputRef.current?.stopRecording())
			appendVoiceTextToEditor(voiceInputTextRef.current.trim())
			resetVoicePanel()
		} finally {
			isVoiceConfirmingRef.current = false
			setIsVoiceConfirming(false)
		}
	}, [appendVoiceTextToEditor, logic.voiceInputRef, resetVoicePanel])

	useEffect(() => {
		if (!isVoiceRecording || !voiceRecordingStartedAt) return

		const timer = window.setInterval(() => {
			setVoiceRecordingElapsedSeconds(
				Math.max(0, Math.floor((Date.now() - voiceRecordingStartedAt) / 1000)),
			)
		}, 1000)

		return () => window.clearInterval(timer)
	}, [isVoiceRecording, voiceRecordingStartedAt])

	useEffect(() => {
		return () => {
			clearVoicePanelIdleTimer()
		}
	}, [clearVoicePanelIdleTimer])

	const voiceRecordingDurationText = useMemo(() => {
		const minutes = Math.floor(voiceRecordingElapsedSeconds / 60)
		const seconds = voiceRecordingElapsedSeconds % 60
		return `${minutes}:${seconds.toString().padStart(2, "0")}`
	}, [voiceRecordingElapsedSeconds])

	const taskAndQueueNodes = (
		<div className="flex flex-col gap-2 [&:empty]:hidden">
			{editorNodes?.taskDataNode}
			{editorNodes?.messageQueueNode}
		</div>
	)
	const headerScenePanelsNode = shouldRenderPanelsInHeader ? (
		<MobileScenePanels editorContext={editorContext} compact />
	) : null
	const voiceInputNode = logic.voiceInputEnabled ? (
		<SuperMagicVoiceInput
			ref={logic.voiceInputRef}
			initValue={logic.store.editorStore.value}
			tiptapEditor={logic.tiptapEditor}
			updateValue={logic.store.editorStore.setValue}
			iconSize={24}
			className="size-10 !bg-transparent"
			commitMode="deferred"
			onStatusChange={handleVoiceStatusChange}
			onRecordingChange={handleVoiceRecordingChange}
			onDeferredTextChange={handleDeferredVoiceTextChange}
			onWaveformLevelsChange={setVoiceWaveformLevels}
			waveformBarCount={44}
		/>
	) : null
	const voiceRecordingContent = isVoicePanelActive ? (
		<div
			className="absolute inset-0 z-10 flex items-center bg-background px-3 py-2"
			data-testid="mobile-voice-recording-panel"
		>
			<div className="flex min-h-10 w-full items-center gap-3">
				<Button
					type="button"
					variant="ghost"
					size="icon"
					className="size-9 shrink-0 rounded-full bg-muted p-0 text-foreground shadow-none hover:bg-muted/80"
					onClick={handleCancelVoiceInput}
					aria-label="cancel voice input"
					data-testid="mobile-voice-cancel-button"
				>
					<X className="size-4" />
				</Button>
				<MobileVoiceRecordingWaveform levels={voiceWaveformLevels} />
				<span
					className="min-w-10 text-right text-sm font-medium tabular-nums text-muted-foreground"
					data-testid="mobile-voice-recording-duration"
				>
					{voiceRecordingDurationText}
				</span>
				<Button
					type="button"
					size="icon"
					className="size-9 shrink-0 rounded-full bg-primary p-0 text-background shadow-none"
					onClick={handleConfirmVoiceInput}
					disabled={isVoiceConfirming}
					aria-label="confirm voice input"
					data-testid="mobile-voice-confirm-button"
				>
					{isVoiceConfirming ? (
						<Loader2 className="size-4 animate-spin" />
					) : (
						<ArrowUp className="size-5" />
					)}
				</Button>
			</div>
		</div>
	) : null

	const composerInnerContent = (
		<>
			<MobileComposerAttachments files={files} onRemove={logic.handleRemoveUploadedFile} />

			<div
				className="px-4 pb-2 pt-3"
				onPaste={logic.handlePaste}
				onCompositionStart={logic.handleCompositionStart}
				onCompositionEnd={logic.handleCompositionEnd}
			>
				<div
					ref={logic.domRef}
					className={mobileComposerEditorClassName}
					data-testid="mobile-composer-editor"
				>
					<EditorContent editor={logic.tiptapEditor} />
				</div>
			</div>

			<div className="flex items-center justify-between gap-2 px-1.5 py-1.5">
				<div className="flex items-center">
					<Button
						type="button"
						variant="ghost"
						size="icon"
						className="size-10 rounded-none bg-transparent p-0 shadow-none hover:bg-transparent"
						onClick={() => setIsAddSheetOpen(true)}
						aria-label="open more tools"
						data-testid="mobile-composer-open-sheet-button"
					>
						<Plus className="size-6" />
					</Button>
					{logic.selectedPluginCount > 0 && (
						<span
							className={cn(
								"flex h-6 shrink-0 items-center justify-center rounded-full bg-foreground px-2 text-sm font-semibold leading-none text-background",
								logic.selectedPluginCount < 10 && "w-6 px-0",
							)}
							data-testid="mobile-composer-open-sheet-plugin-count"
						>
							{logic.selectedPluginCount}
						</span>
					)}
				</div>

				<div className="flex items-center gap-1">
					{editorModeSwitchNode}
					{voiceInputNode}

					<Button
						type="button"
						size="icon"
						className={cn(
							"size-10 rounded-full bg-primary text-background shadow-none",
							sendButtonDisabled && "opacity-60",
						)}
						disabled={sendButtonDisabled}
						onClick={handleActionClick}
						aria-label={shouldShowInterrupt ? "interrupt task" : "send message"}
						data-testid="mobile-composer-send-button"
					>
						{shouldShowInterrupt ? (
							<Square className="size-4 fill-current" />
						) : logic.isPreparingSend || logic.showLoading ? (
							<Loader2 className="size-6 animate-spin" />
						) : (
							<ArrowUp className="size-6" />
						)}
					</Button>
				</div>
			</div>
		</>
	)
	const composerContent = (
		<div className="relative">
			<div
				className={cn(
					"transition-opacity",
					isVoicePanelActive && "pointer-events-none opacity-0",
				)}
				aria-hidden={isVoicePanelActive}
			>
				{composerInnerContent}
			</div>
			{voiceRecordingContent}
		</div>
	)

	const content = isRecordSummaryMode ? (
		<>
			{taskAndQueueNodes}
			{composerContent}
			<MobileComposerAddSheet
				open={isAddSheetOpen}
				onOpenChange={setIsAddSheetOpen}
				selectedTopic={logic.selectedTopic}
				selectedProject={logic.selectedProject}
				mentionPanelStore={logic.mentionPanelStore}
				onSelectMention={logic.handleSelectMentionItem}
				onAfterMentionSelect={logic.focusComposerEditor}
				onFileUpload={logic.handleFileUploadClick}
				mcpStorageKey={logic.mcpStorageKey}
				useTempStorage={logic.mcpUseTempStorage}
			/>

			{logic.uploadModal}
		</>
	) : (
		<div
			className="flex w-full shrink-0 flex-col gap-2 px-2 pb-3 pt-2"
			data-testid="mobile-composer"
		>
			{taskAndQueueNodes}

			<MobileComposerHeader
				scenes={effectiveScenes}
				selectedTopic={logic.selectedTopic}
				selectedProject={logic.selectedProject}
				topicMode={logic.effectiveTopicMode}
				agentCode={editorContext.agentCode ?? logic.selectedTopic?.agent_code}
				selectorVariant={editorContext.mobileModeSelectorVariant}
				messagesLength={editorContext.messagesLength}
				sceneControlNode={headerScenePanelsNode}
				onModeChange={editorContext.setTopicMode}
			/>

			<div
				className={cn(
					"overflow-hidden rounded-3xl bg-background shadow-[0px_8px_25px_0px_rgba(0,0,0,0.10)] transition-colors",
					logic.isComposerFocused && "ring-1 ring-primary/20",
				)}
				data-testid="mobile-composer-card"
			>
				<div className="border-b border-border px-3 pb-2 pt-2 [&:empty]:hidden">
					{shouldRenderPanelsInHeader ? null : (
						<MobileScenePanels editorContext={editorContext} />
					)}
				</div>
				{composerContent}
			</div>

			<MobileComposerAddSheet
				open={isAddSheetOpen}
				onOpenChange={setIsAddSheetOpen}
				selectedTopic={logic.selectedTopic}
				selectedProject={logic.selectedProject}
				mentionPanelStore={logic.mentionPanelStore}
				onSelectMention={logic.handleSelectMentionItem}
				onAfterMentionSelect={logic.focusComposerEditor}
				onFileUpload={logic.handleFileUploadClick}
				mcpStorageKey={logic.mcpStorageKey}
				useTempStorage={logic.mcpUseTempStorage}
			/>

			{logic.uploadModal}
		</div>
	)

	return <MessageEditorStoreProvider store={logic.store}>{content}</MessageEditorStoreProvider>
}

const MobileComposer = observer(MobileComposerComponent)

export default MobileComposer
