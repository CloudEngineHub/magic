import {
	useCallback,
	useState,
	type ClipboardEvent,
	type CSSProperties,
	type MutableRefObject,
} from "react"
import { ArrowUp, LoaderCircle } from "lucide-react"
import { useCanvas } from "../../../app/providers/CanvasProvider"
import type { ImageElement } from "../../../runtime/document/types"
import type { ReferenceResourceSourceType } from "../message/reference-assets/reference-resource.types"
import type {
	ReferenceResourcePanelItem,
	ReferenceResourcePanelSelectContext,
} from "../../../public/props"
import MessageEditor, { type MessageEditorRef } from "../message/MessageEditor"
import { useCanvasReferenceMention } from "../message/useCanvasReferenceMention"
import { useMentionSync } from "../message/useMentionSync"
import { removeMentionFromString } from "../message/tiptap/contentUtils"
import { ReferenceResourceDropSurface } from "../message/reference-assets/ReferenceResourceDropSurface"
import { createReferenceResourcePanelItemFromDropFile } from "../message/reference-assets/createReferenceResourcePanelItem"
import {
	checkLocalReferenceResourceDrop,
	checkProjectReferenceResourceDrop,
	getReferenceResourceHoverState,
	getReferenceResourceLocalHoverState,
	normalizeProjectDropFiles,
	type ReferenceDropProjectFile,
	useReferenceResourceDrop,
} from "../message/reference-assets/useReferenceResourcePanelDataService"
import useElementPositionEffect from "../../../app/hooks/layout/useElementPositionEffect"
import { useFloatingComponent } from "../../../app/hooks/layout/useFloatingComponent"
import { Button } from "../../primitives/shadcn/button"
import ImageEditorControls from "./ImageEditorControls"
import type { ImageEditorConfig } from "./useImageEditorConfig"
import styles from "./index.module.css"
import type { MediaResourceFullscreenPreviewItem } from "../../fullscreen/media-resource/index"

interface ImageEditorSurfaceProps {
	imageElement: ImageElement
	config: ImageEditorConfig
	editorRef: MutableRefObject<MessageEditorRef | null>
	shouldShow: () => boolean
	floatingId: string
	selectionPersistenceKey: string
	placeholder: string
	onSend: () => void | Promise<void>
	isSending: boolean
	autoFocus?: boolean
	autoFocusAtDocumentEnd?: boolean
	isDropEnabled?: boolean
	className?: string
	style?: CSSProperties
	onPreviewMediaResource?: (resource: MediaResourceFullscreenPreviewItem) => void
}

export default function ImageEditorSurface(props: ImageEditorSurfaceProps) {
	const {
		imageElement,
		config,
		editorRef,
		shouldShow,
		floatingId,
		selectionPersistenceKey,
		placeholder,
		onSend,
		isSending,
		autoFocus,
		autoFocusAtDocumentEnd,
		isDropEnabled = true,
		className,
		style,
		onPreviewMediaResource,
	} = props
	const { canvas } = useCanvas()
	const [hasScrollbar, setHasScrollbar] = useState(false)
	const [hoveredMentionPath, setHoveredMentionPath] = useState<string | null>(null)
	const {
		prompt,
		handlers,
		fileInputRef,
		fileInputAccept,
		maxReferenceFiles,
		currentReferenceFiles,
		isReferenceFileLimitReached,
	} = config

	const { matchableItems, mentionDataService, mentionExtension, mentionEnabled } =
		useCanvasReferenceMention({
			matchableItems: config.matchableItems,
			maxReferenceFiles,
			currentReferenceFiles,
			isReferenceFileLimitReached,
			referenceResourceType: config.referenceResourceType,
		})

	const { syncMentionPaths } = useMentionSync({
		canvas,
		elementId: imageElement.id,
		matchableItems,
		maxReferenceFiles,
		isReferenceFileLimitReached,
		syncFromElement: config.handlers.syncReferenceFilesFromElement,
		protectedReferencePaths: config.protectedReferencePaths,
	})

	const { containerRef } = useElementPositionEffect({
		position: "bottom",
		offset: 12,
		shouldShow,
	})

	const { containerRef: floatingRef } = useFloatingComponent({
		id: floatingId,
		enableWheelForwarding: !hasScrollbar,
	})

	const setRefs = useCallback(
		(node: HTMLDivElement | null) => {
			containerRef.current = node
			floatingRef.current = node
		},
		[containerRef, floatingRef],
	)

	const handleSelectSource = useCallback(
		(source: ReferenceResourceSourceType) => {
			if (source !== "local-upload") return
			handlers.setPopoverOpen(false)
			if (!config.selectedReferenceSlot?.path && config.isReferenceFileLimitReached) {
				return
			}
			handlers.triggerFileSelect()
		},
		[config.isReferenceFileLimitReached, config.selectedReferenceSlot?.path, handlers],
	)

	const handleProjectSelect = useCallback(
		(item: ReferenceResourcePanelItem, context?: ReferenceResourcePanelSelectContext) => {
			const selectedSlot = config.selectedReferenceSlot
			if (selectedSlot?.path) {
				handlers.replaceReferenceFileAt(selectedSlot.slotIndex, {
					path: item.data.file_path,
					src: item.data.file_path,
					fileName: item.data.file_name,
				})
				context?.reset?.()
				return
			}
			editorRef.current?.insertMentionItems([item])
		},
		[config.selectedReferenceSlot, editorRef, handlers],
	)

	const canAcceptReferenceDrop =
		!config.isUploading && Boolean(maxReferenceFiles && maxReferenceFiles > 0)

	const canAcceptProjectFiles = useCallback(
		(files: ReferenceDropProjectFile[]) => {
			return checkProjectReferenceResourceDrop({
				isDropEnabled: canAcceptReferenceDrop,
				files,
				matchableItems,
				currentReferenceFiles,
				maxReferenceFiles,
			})
		},
		[canAcceptReferenceDrop, matchableItems, currentReferenceFiles, maxReferenceFiles],
	)

	const canAcceptLocalFiles = useCallback(
		(files: File[]) => {
			return checkLocalReferenceResourceDrop({
				isDropEnabled: canAcceptReferenceDrop,
				files,
				accept: fileInputAccept,
				currentReferenceFileCount: currentReferenceFiles.length,
				maxReferenceFiles,
			})
		},
		[canAcceptReferenceDrop, fileInputAccept, maxReferenceFiles, currentReferenceFiles],
	)

	const getHoverDropState = useCallback(
		() =>
			getReferenceResourceHoverState({
				isDropEnabled: canAcceptReferenceDrop,
				currentReferenceFileCount: currentReferenceFiles.length,
				maxReferenceFiles,
			}),
		[canAcceptReferenceDrop, maxReferenceFiles, currentReferenceFiles],
	)

	const getLocalHoverState = useCallback(
		(dataTransfer: DataTransfer | null) =>
			getReferenceResourceLocalHoverState({
				isDropEnabled: canAcceptReferenceDrop,
				dataTransfer,
				accept: fileInputAccept,
				currentReferenceFileCount: currentReferenceFiles.length,
				maxReferenceFiles,
			}),
		[canAcceptReferenceDrop, fileInputAccept, maxReferenceFiles, currentReferenceFiles],
	)

	const handleProjectFilesDrop = useCallback(
		(files: ReferenceDropProjectFile[]) => {
			const normalizedFiles = normalizeProjectDropFiles(
				files,
				matchableItems,
				currentReferenceFiles,
			)
			editorRef.current?.insertMentionItems(
				normalizedFiles.map((file) => createReferenceResourcePanelItemFromDropFile(file)),
			)
		},
		[currentReferenceFiles, editorRef, matchableItems],
	)

	const handlePaste = useCallback(
		(event: ClipboardEvent<HTMLDivElement>) => {
			const files = Array.from(event.clipboardData.files)
			if (files.length === 0) return
			if (!canAcceptLocalFiles(files).accepted) return

			event.preventDefault()
			void handlers.uploadFiles(files)
		},
		[canAcceptLocalFiles, handlers],
	)

	const { overlayState, dragEvents } = useReferenceResourceDrop({
		isEnabled: isDropEnabled,
		checkProjectFiles: canAcceptProjectFiles,
		checkLocalFiles: canAcceptLocalFiles,
		getProjectHoverState: getHoverDropState,
		getLocalHoverState,
		onDropProjectFiles: handleProjectFilesDrop,
		onDropLocalFiles: handlers.uploadFiles,
	})

	const handleMentionChange = useCallback(
		(paths: string[], currentPrompt: string) => {
			config.handlers.handlePromptReferencePathsChange(paths)
			syncMentionPaths(paths, currentPrompt)
		},
		[config.handlers, syncMentionPaths],
	)

	const handleReferenceFileRemoveFromPopover = useCallback(
		(path: string) => {
			const currentPrompt = editorRef.current?.getCurrentPrompt() ?? prompt
			const fileName =
				config.referenceFileInfos.find((info) => info.path === path)?.fileName ??
				path.split("/").pop()
			handlers.setPrompt(removeMentionFromString(currentPrompt, path, fileName))
			handlers.handleReferenceFileRemove(path)
		},
		[config.referenceFileInfos, editorRef, handlers, prompt],
	)

	return (
		<ReferenceResourceDropSurface
			ref={setRefs}
			className={className ?? styles.imageMessageEditor}
			data-canvas-ui-component
			style={style}
			dropOverlayState={overlayState}
			dragEvents={dragEvents}
		>
			<input
				ref={fileInputRef}
				type="file"
				accept={fileInputAccept}
				multiple={!config.selectedReferenceSlot?.path}
				style={{ display: "none" }}
				onChange={handlers.handleFileChange}
			/>
			<MessageEditor
				ref={editorRef}
				autoFocus={autoFocus}
				autoFocusAtDocumentEnd={autoFocusAtDocumentEnd}
				fullWidth
				selectionPersistenceKey={selectionPersistenceKey}
				placeholder={placeholder}
				value={prompt}
				onChange={handlers.setPrompt}
				onEnter={onSend}
				onScrollbarChange={setHasScrollbar}
				matchableItems={matchableItems}
				mentionDataService={mentionDataService}
				mentionExtension={mentionExtension}
				onMentionChange={handleMentionChange}
				onMentionItemHoverChange={setHoveredMentionPath}
				mentionEnabled={mentionEnabled}
				onPaste={handlePaste}
			/>
			<ImageEditorControls
				config={config}
				hoveredMentionPath={hoveredMentionPath}
				onSelectSource={handleSelectSource}
				onProjectSelect={handleProjectSelect}
				onReferenceFileRemove={handleReferenceFileRemoveFromPopover}
				onPreviewMediaResource={onPreviewMediaResource}
				renderSendButton={() => (
					<Button
						className={styles.sendButton}
						onClick={onSend}
						disabled={isSending || !prompt.trim() || !config.selectedModelId}
						aria-busy={isSending}
					>
						{isSending ? (
							<LoaderCircle size={16} className="animate-spin" />
						) : (
							<ArrowUp size={16} />
						)}
					</Button>
				)}
			/>
		</ReferenceResourceDropSurface>
	)
}
