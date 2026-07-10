import {
	useCallback,
	useMemo,
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
import LinkedEditorInputsBar from "../connection/LinkedEditorInputsBar"
import {
	type LinkedEditorInputsState,
	useLinkedEditorInputs,
} from "../connection/useLinkedEditorInputs"
import { composePromptWithLinkedText } from "../connection/linkedTextPrompt"
import type { LinkedEditorMediaPolicy } from "../connection/linkedEditorInputs"

interface ImageEditorSurfaceProps {
	imageElement: ImageElement
	config: ImageEditorConfig
	editorRef: MutableRefObject<MessageEditorRef | null>
	shouldShow: () => boolean
	floatingId: string
	selectionPersistenceKey: string
	placeholder: string
	onSend: (linkedEditorInputs: LinkedEditorInputsState) => void | Promise<void>
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
	const linkedMediaPolicy = useMemo<LinkedEditorMediaPolicy>(() => {
		const maxCount = maxReferenceFiles ?? 0
		return {
			supportedKinds: maxCount > 0 ? ["image"] : [],
			manualReferences: currentReferenceFiles.map((path) => ({
				kind: "image",
				path,
			})),
			maxTotalCount: maxCount,
			maxCountByKind: { image: maxCount },
		}
	}, [currentReferenceFiles, maxReferenceFiles])
	const linkedEditorInputs = useLinkedEditorInputs({
		targetElementId: imageElement.id,
		targetKind: "image",
		mediaPolicy: linkedMediaPolicy,
	})
	const canSendPrompt = Boolean(
		composePromptWithLinkedText(linkedEditorInputs.textPrompt, prompt).trim(),
	)
	const linkedActiveImagePaths = useMemo(
		() =>
			linkedEditorInputs.activeMediaReferences
				.filter((reference) => reference.kind === "image")
				.map((reference) => reference.path),
		[linkedEditorInputs.activeMediaReferences],
	)
	const effectiveCurrentReferenceFiles = useMemo(
		() => mergeUniquePaths(currentReferenceFiles, linkedActiveImagePaths),
		[currentReferenceFiles, linkedActiveImagePaths],
	)
	const effectiveIsReferenceFileLimitReached =
		maxReferenceFiles !== undefined &&
		effectiveCurrentReferenceFiles.length >= maxReferenceFiles

	const { matchableItems, mentionDataService, mentionExtension, mentionEnabled } =
		useCanvasReferenceMention({
			matchableItems: config.matchableItems,
			maxReferenceFiles,
			currentReferenceFiles: effectiveCurrentReferenceFiles,
			isReferenceFileLimitReached:
				isReferenceFileLimitReached || effectiveIsReferenceFileLimitReached,
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
			if (
				!config.selectedReferenceSlot?.path &&
				(config.isReferenceFileLimitReached || effectiveIsReferenceFileLimitReached)
			) {
				return
			}
			handlers.triggerFileSelect()
		},
		[
			config.isReferenceFileLimitReached,
			config.selectedReferenceSlot?.path,
			effectiveIsReferenceFileLimitReached,
			handlers,
		],
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
				currentReferenceFiles: effectiveCurrentReferenceFiles,
				maxReferenceFiles,
			})
		},
		[canAcceptReferenceDrop, matchableItems, effectiveCurrentReferenceFiles, maxReferenceFiles],
	)

	const canAcceptLocalFiles = useCallback(
		(files: File[]) => {
			return checkLocalReferenceResourceDrop({
				isDropEnabled: canAcceptReferenceDrop,
				files,
				accept: fileInputAccept,
				currentReferenceFileCount: effectiveCurrentReferenceFiles.length,
				maxReferenceFiles,
			})
		},
		[
			canAcceptReferenceDrop,
			fileInputAccept,
			maxReferenceFiles,
			effectiveCurrentReferenceFiles,
		],
	)

	const getHoverDropState = useCallback(
		() =>
			getReferenceResourceHoverState({
				isDropEnabled: canAcceptReferenceDrop,
				currentReferenceFileCount: effectiveCurrentReferenceFiles.length,
				maxReferenceFiles,
			}),
		[canAcceptReferenceDrop, maxReferenceFiles, effectiveCurrentReferenceFiles],
	)

	const getLocalHoverState = useCallback(
		(dataTransfer: DataTransfer | null) =>
			getReferenceResourceLocalHoverState({
				isDropEnabled: canAcceptReferenceDrop,
				dataTransfer,
				accept: fileInputAccept,
				currentReferenceFileCount: effectiveCurrentReferenceFiles.length,
				maxReferenceFiles,
			}),
		[
			canAcceptReferenceDrop,
			fileInputAccept,
			maxReferenceFiles,
			effectiveCurrentReferenceFiles,
		],
	)

	const handleProjectFilesDrop = useCallback(
		(files: ReferenceDropProjectFile[]) => {
			const normalizedFiles = normalizeProjectDropFiles(
				files,
				matchableItems,
				effectiveCurrentReferenceFiles,
			)
			editorRef.current?.insertMentionItems(
				normalizedFiles.map((file) => createReferenceResourcePanelItemFromDropFile(file)),
			)
		},
		[effectiveCurrentReferenceFiles, editorRef, matchableItems],
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

	const handleSend = useCallback(() => onSend(linkedEditorInputs), [linkedEditorInputs, onSend])

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
			{linkedEditorInputs ? (
				<LinkedEditorInputsBar
					textConnections={linkedEditorInputs.textConnections}
					onRemoveConnection={linkedEditorInputs.removeConnection}
				/>
			) : null}
			<MessageEditor
				ref={editorRef}
				autoFocus={autoFocus}
				autoFocusAtDocumentEnd={autoFocusAtDocumentEnd}
				fullWidth
				selectionPersistenceKey={selectionPersistenceKey}
				placeholder={placeholder}
				value={prompt}
				onChange={handlers.setPrompt}
				onEnter={handleSend}
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
				linkedMediaItems={linkedEditorInputs?.mediaItems}
				onRemoveLinkedConnection={linkedEditorInputs?.removeConnection}
				renderSendButton={() => (
					<Button
						className={styles.sendButton}
						onClick={handleSend}
						disabled={isSending || !canSendPrompt || !config.selectedModelId}
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

function mergeUniquePaths(paths: string[], extraPaths: string[]): string[] {
	const merged: string[] = []
	const seen = new Set<string>()
	for (const path of [...paths, ...extraPaths]) {
		if (!path || seen.has(path)) continue
		seen.add(path)
		merged.push(path)
	}
	return merged
}
