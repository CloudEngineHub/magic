import { EditorContent } from "@tiptap/react"
import { ArrowUp, Loader2, Plus, Square, X } from "lucide-react"
import { useDebounceFn } from "ahooks"
import { observer } from "mobx-react-lite"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/shadcn-ui/button"
import { cn } from "@/lib/utils"
import type { VoiceInputStatus } from "@/components/business/VoiceInput"
import type {
	SceneEditorContext,
	SceneEditorNodes,
} from "@/pages/superMagic/components/MainInputContainer/components/editors/types"
import { MessageEditorStoreProvider } from "@/pages/superMagic/components/MessageEditor/stores"
import SuperMagicVoiceInput from "@/pages/superMagic/components/MessageEditor/components/VoiceInput"
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

const voiceRecordingWaveformClassName =
	"flex h-10 min-w-0 flex-1 items-center justify-between overflow-hidden text-muted-foreground"

function createMobileVoiceWaveformLevels(): number[] {
	return Array.from({ length: 44 }, (_, index) => {
		const center = (44 - 1) / 2
		const distanceFromCenter = Math.abs(index - center) / center
		return 0.16 + (1 - distanceFromCenter) * 0.18
	})
}

function MobileVoiceRecordingWaveform({ levels }: { levels: number[] }) {
	return (
		<div
			className={voiceRecordingWaveformClassName}
			data-testid="mobile-composer-voice-waveform"
		>
			{levels.map((level, index) => (
				<div
					key={index}
					className="w-0.5 shrink-0 rounded-full bg-current transition-[height] duration-150 ease-out"
					style={{ height: Math.max(4, 40 * Math.min(1, Math.max(0.16, level))) }}
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
	const [isVoicePanelActive, setIsVoicePanelActive] = useState(false)
	const [isVoiceRecording, setIsVoiceRecording] = useState(false)
	const [isVoiceConfirming, setIsVoiceConfirming] = useState(false)
	const [voiceWaveformLevels, setVoiceWaveformLevels] = useState(createMobileVoiceWaveformLevels)
	const [voiceRecordingStartedAt, setVoiceRecordingStartedAt] = useState<number | null>(null)
	const [voiceRecordingElapsedSeconds, setVoiceRecordingElapsedSeconds] = useState(0)
	const voiceInputTextRef = useRef("")
	const isVoiceConfirmingRef = useRef(false)
	const voicePanelIdleTimerRef = useRef<number | null>(null)
	const logic = useMobileComposerLogic({
		editorContext,
		enableReEditMessageFromPubSub,
	})
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

		window.clearTimeout(voicePanelIdleTimerRef.current)
		voicePanelIdleTimerRef.current = null
	}, [])
	const handleVoiceRecordingChange = useCallback(
		(nextIsRecording: boolean) => {
			setIsVoiceRecording(nextIsRecording)
			if (nextIsRecording) {
				clearVoicePanelIdleTimer()
				setIsVoicePanelActive(true)
				voiceInputTextRef.current = ""
				setVoiceWaveformLevels(createMobileVoiceWaveformLevels())
				setVoiceRecordingElapsedSeconds(0)
				setVoiceRecordingStartedAt(Date.now())
				return
			}

			setVoiceRecordingStartedAt(null)
		},
		[clearVoicePanelIdleTimer],
	)
	const handleVoiceStatusChange = useCallback(
		(nextStatus: VoiceInputStatus) => {
			if (
				nextStatus === "connecting" ||
				nextStatus === "recording" ||
				nextStatus === "processing"
			) {
				clearVoicePanelIdleTimer()
				setIsVoicePanelActive(true)
				return
			}

			if (nextStatus === "error") {
				clearVoicePanelIdleTimer()
				setIsVoicePanelActive(false)
				return
			}

			if (nextStatus !== "idle") return

			clearVoicePanelIdleTimer()
			voicePanelIdleTimerRef.current = window.setTimeout(() => {
				setIsVoicePanelActive(false)
				voicePanelIdleTimerRef.current = null
			}, 180)
		},
		[clearVoicePanelIdleTimer],
	)
	const handleDeferredVoiceTextChange = useCallback((nextText: string) => {
		voiceInputTextRef.current = nextText
	}, [])
	const appendVoiceTextToEditor = useCallback(
		(text: string) => {
			const normalizedText = text.trim()
			if (!normalizedText) return

			const editor = logic.tiptapEditor
			if (!editor || editor.isDestroyed) return

			const insertPosition = Math.max(1, editor.state.doc.content.size - 1)
			editor.chain().focus().insertContentAt(insertPosition, normalizedText).run()
			logic.store.editorStore.setValue(editor.getJSON())
		},
		[logic.store.editorStore, logic.tiptapEditor],
	)
	const handleCancelVoiceInput = useCallback(() => {
		logic.voiceInputRef.current?.disconnect()
		clearVoicePanelIdleTimer()
		setIsVoicePanelActive(false)
		setIsVoiceRecording(false)
		setIsVoiceConfirming(false)
		isVoiceConfirmingRef.current = false
		voiceInputTextRef.current = ""
		setVoiceWaveformLevels(createMobileVoiceWaveformLevels())
		setVoiceRecordingStartedAt(null)
		setVoiceRecordingElapsedSeconds(0)
	}, [clearVoicePanelIdleTimer, logic.voiceInputRef])
	const handleConfirmVoiceInput = useCallback(async () => {
		if (isVoiceConfirmingRef.current) return

		isVoiceConfirmingRef.current = true
		setIsVoiceConfirming(true)
		try {
			await logic.voiceInputRef.current?.stopRecording()
			appendVoiceTextToEditor(voiceInputTextRef.current)
		} finally {
			clearVoicePanelIdleTimer()
			setIsVoicePanelActive(false)
			setIsVoiceRecording(false)
			isVoiceConfirmingRef.current = false
			setIsVoiceConfirming(false)
			voiceInputTextRef.current = ""
			setVoiceWaveformLevels(createMobileVoiceWaveformLevels())
			setVoiceRecordingStartedAt(null)
			setVoiceRecordingElapsedSeconds(0)
		}
	}, [appendVoiceTextToEditor, clearVoicePanelIdleTimer, logic.voiceInputRef])
	const formattedVoiceRecordingTime = useMemo(() => {
		const minutes = Math.floor(voiceRecordingElapsedSeconds / 60)
		const seconds = voiceRecordingElapsedSeconds % 60
		return `${minutes}:${seconds.toString().padStart(2, "0")}`
	}, [voiceRecordingElapsedSeconds])
	const isVoiceInputInitializing = isVoicePanelActive && !isVoiceRecording
	const shouldShowVoiceRecordingUi = isVoicePanelActive || isVoiceRecording

	useEffect(() => {
		if (!voiceRecordingStartedAt) return

		const timerId = window.setInterval(() => {
			setVoiceRecordingElapsedSeconds(
				Math.max(0, Math.floor((Date.now() - voiceRecordingStartedAt) / 1000)),
			)
		}, 250)

		return () => window.clearInterval(timerId)
	}, [voiceRecordingStartedAt])

	useEffect(() => {
		return () => {
			clearVoicePanelIdleTimer()
		}
	}, [clearVoicePanelIdleTimer])

	const taskAndQueueNodes = (
		<div className="flex flex-col gap-2 [&:empty]:hidden">
			{editorNodes?.taskDataNode}
			{editorNodes?.messageQueueNode}
		</div>
	)
	const voiceInputNode = (
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
	)
	const voiceRecordingContent = (
		<div
			className="flex h-10 w-full shrink-0 items-center gap-2 px-3"
			data-testid="mobile-composer-voice-recording"
		>
			<Button
				type="button"
				variant="ghost"
				size="icon"
				className="size-10 shrink-0 rounded-full border border-border bg-transparent text-foreground shadow-none ring-offset-2 transition-colors hover:bg-background focus-visible:ring-2 focus-visible:ring-foreground/20"
				onClick={handleCancelVoiceInput}
				aria-label="cancel voice input"
				data-testid="mobile-composer-cancel-voice-button"
			>
				<X className="size-6" strokeWidth={1.5} />
			</Button>

			{isVoiceInputInitializing ? (
				<div
					className="flex min-w-0 flex-1 items-center justify-center"
					data-testid="mobile-composer-voice-connecting-loading"
				>
					<Loader2 className="size-5 animate-spin text-muted-foreground" />
				</div>
			) : (
				<>
					<MobileVoiceRecordingWaveform levels={voiceWaveformLevels} />

					<span
						className="shrink-0 text-[13px] tabular-nums leading-4 text-muted-foreground"
						data-testid="mobile-composer-voice-recording-time"
					>
						{formattedVoiceRecordingTime}
					</span>
				</>
			)}

			<Button
				type="button"
				size="icon"
				className="size-10 shrink-0 rounded-full bg-primary text-primary-foreground shadow-none ring-offset-2 transition-opacity focus-visible:ring-2 focus-visible:ring-foreground/25 disabled:pointer-events-none disabled:opacity-40"
				onClick={handleConfirmVoiceInput}
				disabled={isVoiceInputInitializing || isVoiceConfirming}
				aria-label="confirm voice input"
				data-testid="mobile-composer-confirm-voice-button"
			>
				{isVoiceConfirming ? (
					<Loader2 className="size-5 animate-spin" />
				) : (
					<ArrowUp className="size-6" strokeWidth={1.5} />
				)}
			</Button>
		</div>
	)
	const headerScenePanelsNode = shouldRenderPanelsInHeader ? (
		<MobileScenePanels editorContext={editorContext} compact />
	) : null

	const composerInnerContent = (
		<div className="relative">
			<div
				className={cn(
					"transition-opacity",
					shouldShowVoiceRecordingUi &&
					"pointer-events-none absolute inset-x-0 top-0 opacity-0",
				)}
				aria-hidden={shouldShowVoiceRecordingUi}
			>
				<MobileComposerAttachments
					files={files}
					onRemove={logic.handleRemoveUploadedFile}
				/>

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
						{logic.voiceInputEnabled && voiceInputNode}

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
			</div>
			{shouldShowVoiceRecordingUi && (
				<div className="flex items-center py-2">{voiceRecordingContent}</div>
			)}
		</div>
	)

	const content = isRecordSummaryMode ? (
		<>
			{taskAndQueueNodes}
			{composerInnerContent}
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
				{composerInnerContent}
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
