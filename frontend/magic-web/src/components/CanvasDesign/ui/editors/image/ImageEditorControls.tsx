import {
	forwardRef,
	useCallback,
	useEffect,
	useMemo,
	useState,
	type CSSProperties,
	type ForwardedRef,
	type ReactNode,
} from "react"
import { Select, SelectContent, SelectItem, SelectTrigger } from "../../primitives/shadcn/select"
import styles from "./index.module.css"
import { ChevronsUpDown } from "lucide-react"
import { useCanvasDesignI18n } from "../../../app/providers/I18nProvider"
import ResolutionSelect from "../../primitives/custom/ResolutionSelect/index"
import EditorModelSelect from "../video/model-config/EditorModelSelect"
import type { ImageEditorConfig } from "./useImageEditorConfig"
import ReferenceResourceSlotPopover from "../message/reference-assets/ReferenceResourceSlotPopover"
import type { ReferenceResourceSourceType } from "../message/reference-assets/reference-resource.types"
import type {
	ReferenceResourcePanelItem,
	ReferenceResourcePanelSelectContext,
} from "../../../public/props"
import SizeIconPreview from "../../primitives/custom/SizeIconPreview/index"
import SourceList, {
	type SourceListOption,
	type SourceListRenderItemParams,
} from "../../panels/source-list/index"
import sourceListStyles from "../../panels/source-list/SourceList.module.css"
import { cn } from "../../../runtime/shared/lib/utils"
import type { MediaResourceFullscreenPreviewItem } from "../../fullscreen/media-resource/index"
import type { LinkedEditorMediaItem, LinkedEditorMediaKind } from "../connection/linkedEditorInputs"
import {
	getLinkedMediaReferenceIdentity,
	mergeLinkedMediaPaths,
	resolveLinkedMediaDisplay,
} from "../connection/linkedEditorInputs"
import { useLinkedMediaSourceListOption } from "../connection/useLinkedMediaSourceListOption"

interface ImageEditorReferencePopoverState {
	slotKey: string
	currentFiles: string[]
	maxReferenceFiles: number | undefined
	isLimitReached: boolean
}

interface ImageEditorReferenceSlotPopoverProps {
	className: string
	style: CSSProperties
	content: ReactNode
	slotKey: string
	isPopoverOpen: boolean
	selectedSlotKey: string | null
	onSelectSlot: () => void
	onPopoverOpenChange: (open: boolean) => void
	onMouseEnter: () => void
	onMouseLeave: () => void
	onSelectSource: (source: ReferenceResourceSourceType) => void
	referencePopoverState: ImageEditorReferencePopoverState
	referenceResourceType: ImageEditorConfig["referenceResourceType"]
	referenceFileInfos: ImageEditorConfig["referenceFileInfos"]
	onProjectSelect?: (
		item: ReferenceResourcePanelItem,
		context?: ReferenceResourcePanelSelectContext,
	) => void
	enableProjectSelectMultiSelect?: boolean
	maxProjectSelectBatchCount?: number
	slotRootRef?: SourceListRenderItemParams["slotRootRef"]
}

const ImageEditorReferenceSlotPopover = forwardRef<
	HTMLDivElement,
	ImageEditorReferenceSlotPopoverProps
>(function ImageEditorReferenceSlotPopover(props, forwardedRef) {
	const {
		className,
		style,
		content,
		slotKey,
		isPopoverOpen,
		selectedSlotKey,
		onSelectSlot,
		onPopoverOpenChange,
		onMouseEnter,
		onMouseLeave,
		onSelectSource,
		referencePopoverState,
		referenceResourceType,
		referenceFileInfos,
		onProjectSelect,
		enableProjectSelectMultiSelect,
		maxProjectSelectBatchCount,
		slotRootRef,
	} = props

	const handleSlotRootRef = useCallback(
		(node: HTMLDivElement | null) => {
			slotRootRef?.(node)
			assignForwardedRef(forwardedRef, node)
		},
		[forwardedRef, slotRootRef],
	)

	return (
		<ReferenceResourceSlotPopover
			className={className}
			style={style}
			content={content}
			slotKey={slotKey}
			slotRootRef={handleSlotRootRef}
			isPopoverOpen={isPopoverOpen}
			selectedSlotKey={selectedSlotKey}
			onActivateSlot={onSelectSlot}
			onPopoverOpenChange={onPopoverOpenChange}
			onMouseEnter={onMouseEnter}
			onMouseLeave={onMouseLeave}
			onSelectSource={onSelectSource}
			maxReferenceFiles={referencePopoverState.maxReferenceFiles}
			currentReferenceFiles={referencePopoverState.currentFiles}
			isReferenceFileLimitReached={referencePopoverState.isLimitReached}
			referenceResourceType={referenceResourceType}
			referenceFileInfos={referenceFileInfos}
			onProjectSelect={onProjectSelect}
			enableProjectSelectMultiSelect={enableProjectSelectMultiSelect}
			maxProjectSelectBatchCount={maxProjectSelectBatchCount}
		/>
	)
})

function assignForwardedRef<T>(ref: ForwardedRef<T>, value: T | null) {
	if (!ref) return
	if (typeof ref === "function") {
		ref(value)
		return
	}
	ref.current = value
}

interface ImageEditorControlsProps {
	config: ImageEditorConfig
	hoveredMentionPath?: string | null
	onSelectSource: (source: ReferenceResourceSourceType) => void
	onProjectSelect?: (
		item: ReferenceResourcePanelItem,
		context?: ReferenceResourcePanelSelectContext,
	) => void
	/** 参考文件删除回调，传入时优先使用（用于同步到 TipTap） */
	onReferenceFileRemove?: (path: string) => void
	onPreviewMediaResource?: (resource: MediaResourceFullscreenPreviewItem) => void
	linkedMediaItems?: LinkedEditorMediaItem[]
	onLinkedMediaSelectionChange?: (connectionId: string, selected: boolean) => void
	renderPromptOptimizationButton?: () => React.ReactNode
	renderSendButton?: () => React.ReactNode
}

export default function ImageEditorControls(props: ImageEditorControlsProps) {
	const {
		config,
		hoveredMentionPath,
		onSelectSource,
		onProjectSelect,
		onReferenceFileRemove,
		onPreviewMediaResource,
		linkedMediaItems = [],
		onLinkedMediaSelectionChange,
		renderPromptOptimizationButton,
		renderSendButton,
	} = props
	const { t } = useCanvasDesignI18n()
	const createLinkedMediaSourceListOption = useLinkedMediaSourceListOption()
	const linkedMediaKindLabelByKind = useMemo<Record<LinkedEditorMediaKind, string>>(
		() => ({
			image: t("connectionEditor.mediaKindImage", "图片"),
			video: t("connectionEditor.mediaKindVideo", "视频"),
			audio: t("connectionEditor.mediaKindAudio", "音频"),
		}),
		[t],
	)

	const {
		selectedModelId,
		modelOptions,
		modelOptionGroups,
		selectedModelOption,
		maxReferenceFiles,
		currentReferenceFiles,
		referenceFileInfos,
		supportedResolutionOptions,
		supportedImageSettingOptions,
		supportedAspectRatioOptions,
		selectedImageGenerationConfig,
		currentSelectValue,
		ratioOption,
		isPopoverOpen,
		referenceResourceType,
		handlers,
	} = config
	const [selectedReferenceSlotKey, setSelectedReferenceSlotKey] = useState<string | null>(null)
	const linkedActiveImagePaths = useMemo(
		() =>
			linkedMediaItems
				.filter(
					(item): item is LinkedEditorMediaItem & { path: string } =>
						item.status === "active" && item.kind === "image" && Boolean(item.path),
				)
				.map((item) => item.path),
		[linkedMediaItems],
	)
	const effectiveReferenceFileCount = mergeLinkedMediaPaths(
		currentReferenceFiles,
		linkedActiveImagePaths,
	).length
	const { manualItems: visibleReferenceFileInfos, linkedItems: visibleLinkedMediaItems } =
		useMemo(
			() =>
				resolveLinkedMediaDisplay(
					referenceFileInfos.map((info, index) => ({ info, index })),
					(entry) => entry.info.path,
					linkedMediaItems,
				),
			[linkedMediaItems, referenceFileInfos],
		)

	useEffect(() => {
		if (!isPopoverOpen) {
			setSelectedReferenceSlotKey(null)
		}
	}, [isPopoverOpen])

	const handleSelectReferenceSlot = useCallback(
		(option: SourceListOption) => {
			setSelectedReferenceSlotKey(option.value)
			handlers.prepareReferenceSlotSelection(option.slotIndex, {
				slotKey: option.value,
				path: option.resourcePath,
			})
		},
		[handlers],
	)

	const canAddReferenceFile =
		maxReferenceFiles === undefined || effectiveReferenceFileCount < maxReferenceFiles

	const referenceSourceListOptions = useMemo<SourceListOption[]>(() => {
		if (!maxReferenceFiles || maxReferenceFiles <= 0) {
			return visibleLinkedMediaItems.map((item, index) =>
				createLinkedMediaSourceListOption({
					item,
					index,
					slotIndex: index,
					label: linkedMediaKindLabelByKind[item.kind],
					previewResourceAriaLabel: t(
						"mediaResourceFullscreenPreview.open",
						"预览媒体资源",
					),
					onPreviewMediaResource,
					onLinkedMediaSelectionChange,
				}),
			)
		}

		const options: SourceListOption[] = visibleReferenceFileInfos.map(({ info, index }) => {
			return {
				kind: "slot",
				label: t("imageEditor.referenceImage", "参考图"),
				value: `image-reference-${index}-${info.path}`,
				slotIndex: index,
				resourcePath: info.path,
				resourceFileName: info.fileName,
				removeResourceAriaLabel: t("imageEditor.removeReferenceResource", "移除该参考资源"),
				previewResourceAriaLabel: t("mediaResourceFullscreenPreview.open", "预览媒体资源"),
				onPreviewResource: onPreviewMediaResource,
				onRemoveResource: () => {
					;(onReferenceFileRemove ?? handlers.handleReferenceFileRemove)(info.path)
				},
			}
		})

		const linkedOptions = visibleLinkedMediaItems.map((item, index) =>
			createLinkedMediaSourceListOption({
				item,
				index,
				slotIndex: currentReferenceFiles.length + index,
				label:
					item.kind === "image"
						? t("imageEditor.referenceImage", "参考图")
						: linkedMediaKindLabelByKind[item.kind],
				previewResourceAriaLabel: t("mediaResourceFullscreenPreview.open", "预览媒体资源"),
				onPreviewMediaResource,
				onLinkedMediaSelectionChange,
			}),
		)
		options.push(...linkedOptions)

		if (canAddReferenceFile) {
			options.push({
				kind: "slot",
				label: t("imageEditor.referenceImage", "参考图"),
				secondaryLabel:
					maxReferenceFiles !== undefined && effectiveReferenceFileCount > 0
						? `(${effectiveReferenceFileCount}/${maxReferenceFiles})`
						: undefined,
				value: `image-reference-empty-${currentReferenceFiles.length}`,
				slotIndex: currentReferenceFiles.length,
			})
		}

		return options
	}, [
		maxReferenceFiles,
		visibleReferenceFileInfos,
		visibleLinkedMediaItems,
		createLinkedMediaSourceListOption,
		linkedMediaKindLabelByKind,
		t,
		onReferenceFileRemove,
		onPreviewMediaResource,
		onLinkedMediaSelectionChange,
		handlers.handleReferenceFileRemove,
		canAddReferenceFile,
		currentReferenceFiles.length,
		effectiveReferenceFileCount,
	])

	const resolveReferencePopoverState = useCallback(
		(option: { slotIndex: number; value: string }): ImageEditorReferencePopoverState => {
			const slotPath = currentReferenceFiles[option.slotIndex]
			const filesWithoutSlot = slotPath
				? currentReferenceFiles.filter(
						(path) =>
							getLinkedMediaReferenceIdentity(path) !==
							getLinkedMediaReferenceIdentity(slotPath),
					)
				: currentReferenceFiles
			const effectiveFilesWithoutSlot = mergeLinkedMediaPaths(
				filesWithoutSlot,
				linkedActiveImagePaths,
			)

			return {
				slotKey: option.value,
				currentFiles: effectiveFilesWithoutSlot,
				maxReferenceFiles,
				isLimitReached:
					maxReferenceFiles !== undefined &&
					effectiveFilesWithoutSlot.length >= maxReferenceFiles,
			}
		},
		[currentReferenceFiles, linkedActiveImagePaths, maxReferenceFiles],
	)

	const renderReferenceSourceListItem = useCallback(
		(params: SourceListRenderItemParams) => {
			const { option, className, style, content, onClick, slotRootRef } = params
			if (option.readOnly) {
				return (
					<div ref={slotRootRef} className={className} style={style} onClick={onClick}>
						{content}
					</div>
				)
			}
			const referencePopoverState = resolveReferencePopoverState(option)
			return (
				<ImageEditorReferenceSlotPopover
					className={cn(
						className,
						Boolean(option.resourcePath && hoveredMentionPath) &&
							getLinkedMediaReferenceIdentity(option.resourcePath) ===
								getLinkedMediaReferenceIdentity(hoveredMentionPath) &&
							sourceListStyles.sourceItemMentionHovered,
					)}
					style={style}
					content={content}
					slotKey={referencePopoverState.slotKey}
					isPopoverOpen={isPopoverOpen}
					selectedSlotKey={selectedReferenceSlotKey}
					onSelectSlot={() => handleSelectReferenceSlot(option)}
					onPopoverOpenChange={handlers.setPopoverOpen}
					onMouseEnter={handlers.handlePopoverMouseEnter}
					onMouseLeave={handlers.handlePopoverMouseLeave}
					onSelectSource={onSelectSource}
					referencePopoverState={referencePopoverState}
					referenceResourceType={referenceResourceType}
					referenceFileInfos={referenceFileInfos}
					onProjectSelect={onProjectSelect}
					enableProjectSelectMultiSelect={!option.resourcePath}
					maxProjectSelectBatchCount={option.resourcePath ? 1 : undefined}
					slotRootRef={slotRootRef}
				/>
			)
		},
		[
			resolveReferencePopoverState,
			isPopoverOpen,
			selectedReferenceSlotKey,
			handlers.setPopoverOpen,
			handlers.handlePopoverMouseEnter,
			handlers.handlePopoverMouseLeave,
			onSelectSource,
			referenceResourceType,
			referenceFileInfos,
			onProjectSelect,
			hoveredMentionPath,
			handleSelectReferenceSlot,
		],
	)

	return (
		<>
			<div className={styles.controllers}>
				{referenceSourceListOptions.length > 0 && (
					<div className={styles.top}>
						<div className={styles.sourceListScroller}>
							<div className={styles.sourceListScrollerContent}>
								<SourceList
									options={referenceSourceListOptions}
									renderItem={renderReferenceSourceListItem}
								/>
							</div>
						</div>
					</div>
				)}
				<div className={styles.bottom}>
					<div className={styles.left}>
						<EditorModelSelect
							selectedModelId={selectedModelId}
							modelOptions={modelOptions}
							modelOptionGroups={modelOptionGroups}
							selectedModelOption={selectedModelOption}
							onModelChange={handlers.handleModelChange}
						/>
					</div>
					<div className={styles.right}>
						{supportedImageSettingOptions.map((setting) => {
							const defaultOption = setting.options.find(
								(option) => option.value === setting.default,
							)
							const selectedValue =
								selectedImageGenerationConfig[setting.requestKey] ||
								defaultOption?.value ||
								setting.options[0]?.value ||
								""
							const selectedOption = setting.options.find(
								(option) => option.value === selectedValue,
							)
							const testIdKey = getSettingTestIdKey(setting.requestKey)

							return (
								<Select
									key={setting.key}
									value={selectedValue}
									onValueChange={(value) =>
										handlers.handleImageSettingChange(setting.requestKey, value)
									}
								>
									<SelectTrigger
										className={styles.selectTrigger}
										data-testid={`image-editor-${testIdKey}-setting-trigger`}
									>
										<span className={styles.selectTriggerText}>
											{selectedOption?.label || selectedValue}
										</span>
										<ChevronsUpDown size={16} />
									</SelectTrigger>
									<SelectContent
										className={styles.selectContent}
										style={{ minWidth: 160 }}
									>
										<div className={styles.selectContentName}>
											{setting.label}
										</div>
										{setting.options.map((option) => (
											<SelectItem
												key={option.value}
												value={option.value}
												className={styles.selectOptionItem}
												data-testid={`image-editor-${testIdKey}-setting-option`}
											>
												<span>{option.label}</span>
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							)
						})}
						{/* 分辨率选择 */}
						<ResolutionSelect
							options={supportedResolutionOptions}
							value={config.selectedResolution}
							onValueChange={handlers.handleResolutionChange}
						/>
						{/* 比例选择 */}
						{supportedAspectRatioOptions.length > 0 && (
							<Select
								value={currentSelectValue || ""}
								onValueChange={handlers.handleRatioChange}
							>
								<SelectTrigger className={styles.selectTrigger}>
									<span className={styles.selectTriggerText}>
										{ratioOption?.label || t("imageEditor.custom", "自定义")}
									</span>
									<ChevronsUpDown size={16} />
								</SelectTrigger>
								<SelectContent
									className={styles.selectContent}
									style={{ minWidth: 200 }}
								>
									<div className={styles.selectContentName}>
										{t("imageEditor.size", "尺寸")}
									</div>
									{supportedAspectRatioOptions.map((option) => {
										if (!option || !option.value) return null
										return (
											<SelectItem
												key={option.value}
												value={option.value}
												className={styles.selectOptionItem}
											>
												<div className={styles.ratioOptionItemContent}>
													<SizeIconPreview
														iconWidth={option.iconWidth}
														iconHeight={option.iconHeight}
														wrapperClassName={styles.icon}
														iconClassName={styles.iconContent}
													/>
													<div
														className={styles.label}
														style={{ width: 60 }}
													>
														{option.label}
													</div>
													<div className={styles.size}>
														{option.width}x{option.height}
													</div>
												</div>
											</SelectItem>
										)
									})}
								</SelectContent>
							</Select>
						)}
						{renderPromptOptimizationButton && renderPromptOptimizationButton()}
						{renderSendButton && renderSendButton()}
					</div>
				</div>
			</div>
		</>
	)
}

function getSettingTestIdKey(key: string): string {
	return key
		.replace(/[^a-z0-9]+/gi, "-")
		.replace(/^-|-$/g, "")
		.toLowerCase()
}
