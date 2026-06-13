import type { Dispatch, RefObject, SetStateAction } from "react"
import { useId, useMemo } from "react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import { Input } from "@/components/shadcn-ui/input"
import type { ArticleDetail, OutlineNode, ReferenceFileValue } from "../../types"
import { STYLE_PRESETS, ALL_PLATFORMS, getVisualPresetsForPlatform } from "../../types"
import type { SelfMediaPlatform } from "../../../../../../types"
import type { SelfMediaFileStorageService } from "../../../../services/SelfMediaFileStorageService"
import ArticleOutlineEditor from "./ArticleOutlineEditor"
import CardContentEditor from "./CardContentEditor"
import AiActionButton from "../ai/AiActionButton"
import VisualPresetPicker from "../picker/VisualPresetPicker"
import ReferenceFilePicker from "../picker/ReferenceFilePicker"
import InlineVoiceButton from "../ui/InlineVoiceButton"
import { MagicPromptEditor } from "@/components/base/MagicPromptEditor"
import { Folder } from "lucide-react"
import PlatformBrandIcon from "../../../PlatformBrandIcon"
import { selfMediaOverlayStyles } from "../../../selfMediaOverlayStyles"

interface ArticleCardWorkspaceProps {
	article: ArticleDetail
	hideHeader: boolean
	showFolderField: boolean
	isCardPlatform: boolean
	hasOutline: boolean
	generatingOutline: boolean
	outlineModel: string
	optimizePopoverOpen: boolean
	optimizeInstruction: string
	outlineActionRef: RefObject<HTMLDivElement | null>
	fileStorageService?: SelfMediaFileStorageService | null
	onFieldChange: <K extends keyof ArticleDetail>(field: K, value: ArticleDetail[K]) => void
	onCardCountChange: (count: number) => void
	onReferenceFilesChange: (files: ReferenceFileValue[]) => void
	onOutlineButtonClick: () => void
	onOptimizeInstructionChange: Dispatch<SetStateAction<string>>
	onOutlineModelChange: Dispatch<SetStateAction<string>>
	onAiOptimize: (instruction: string) => void
	onOutlineChange: (outline: OutlineNode[]) => void
	onRemoveCard: (index: number) => void
	onPersistDraft?: () => void
	onUploadToProject: (file: File, materialId: string) => void
}

export default function ArticleCardWorkspace({
	article,
	hideHeader,
	showFolderField,
	isCardPlatform,
	hasOutline,
	generatingOutline,
	outlineModel,
	optimizePopoverOpen,
	optimizeInstruction,
	outlineActionRef,
	fileStorageService,
	onFieldChange,
	onCardCountChange,
	onReferenceFilesChange,
	onOutlineButtonClick,
	onOptimizeInstructionChange,
	onOutlineModelChange,
	onAiOptimize,
	onOutlineChange,
	onRemoveCard,
	onPersistDraft,
	onUploadToProject,
}: ArticleCardWorkspaceProps) {
	const { t } = useTranslation("super")
	const cardCountHintId = useId()
	const effectivePlatform = article.platform || "rednote"
	const availableVisualPresets = useMemo(
		() => getVisualPresetsForPlatform(effectivePlatform as SelfMediaPlatform),
		[effectivePlatform],
	)
	const cardCountLabel = t("detail.selfMedia.initPanel.stepDetail.cardCountLabel", "生成卡片数量")
	const cardCountHint = t(
		"detail.selfMedia.initPanel.stepDetail.cardCountHint",
		"小红书/Instagram 建议 6-9 张",
	)
	const isOutlineActionBlocked = !article.title.trim()
	const isPresetStyle = STYLE_PRESETS.some((preset) => preset.value === article.style)
	const isCustomStyleSelected = article.style === "custom" || !isPresetStyle
	const customStyleValue =
		isCustomStyleSelected && article.style !== "custom" ? article.style : ""
	const outlineItemCount = article.outline.length
	const outlineStatus = isOutlineActionBlocked
		? t(
				isCardPlatform
					? "detail.selfMedia.initPanel.stepDetail.cardContentRequiresTitleStatus"
					: "detail.selfMedia.initPanel.stepDetail.outlineRequiresTitleStatus",
				"先填标题",
			)
		: hasOutline
			? t(
					isCardPlatform
						? "detail.selfMedia.initPanel.stepDetail.cardContentReadyStatus"
						: "detail.selfMedia.initPanel.stepDetail.outlineReadyStatus",
					{
						count: outlineItemCount,
						defaultValue: isCardPlatform
							? "卡片已就绪 · {{count}} 张"
							: "大纲已就绪 · {{count}} 节",
					},
				)
			: t(
					isCardPlatform
						? "detail.selfMedia.initPanel.stepDetail.cardContentCanGenerateStatus"
						: "detail.selfMedia.initPanel.stepDetail.outlineCanGenerateStatus",
					isCardPlatform ? "可生成卡片" : "可生成大纲",
				)
	const outlineActionDisabledReason = isOutlineActionBlocked
		? t(
				isCardPlatform
					? "detail.selfMedia.initPanel.stepDetail.cardContentRequiresTitleHint"
					: "detail.selfMedia.initPanel.stepDetail.outlineRequiresTitleHint",
				isCardPlatform
					? "先填写文章标题，AI 才能生成卡片内容。"
					: "先填写文章标题，AI 才能生成大纲。",
			)
		: undefined

	return (
		<div
			className={cn(
				hideHeader
					? "space-y-6 duration-200 animate-in fade-in"
					: "mt-4 space-y-5 border-t border-border/10 pt-5 duration-200 animate-in fade-in slide-in-from-top-3",
			)}
		>
			{hideHeader && showFolderField && (
				<div className="space-y-1.5">
					<label className="block text-xs font-medium text-muted-foreground">
						{t("detail.selfMedia.initPanel.stepDetail.folderLabel", "归档文件夹")}
					</label>
					<div className="relative">
						<Folder
							className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/45"
							size={12}
						/>
						<Input
							type="text"
							className="h-9 pl-7 text-xs"
							placeholder={t(
								"detail.selfMedia.initPanel.stepTopic.folderPlaceholder",
								"文件夹名（选填，留空自动生成）",
							)}
							value={article.folderName || ""}
							onChange={(e) => onFieldChange("folderName", e.target.value)}
							data-testid="self-media-step-topic-folder-name-input"
						/>
					</div>
				</div>
			)}

			<div className="grid grid-cols-1 gap-5 md:grid-cols-12">
				<div className="space-y-2 md:col-span-8">
					<label className="block text-xs font-medium text-muted-foreground">
						{t("detail.selfMedia.initPanel.stepDetail.platformLabel", "目标自媒体平台")}
					</label>
					<div className="flex flex-wrap gap-1.5">
						{ALL_PLATFORMS.filter((p) => !p.disabled).map((p) => (
							<button
								key={p.value}
								type="button"
								aria-pressed={article.platform === p.value}
								className={cn(
									"flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all duration-300",
									article.platform === p.value
										? "border-[#18181b] bg-[#18181b] text-white shadow-[0_10px_20px_rgba(24,24,27,0.12)]"
										: "border-transparent bg-[#f4f4f5] text-[#71717a] hover:bg-[#e4e4e7] hover:text-[#18181b]",
								)}
								onClick={() =>
									onFieldChange("platform", p.value as SelfMediaPlatform)
								}
							>
								<PlatformBrandIcon platform={p.value} className="size-3.5" />
								{t(p.labelKey)}
							</button>
						))}
					</div>
				</div>

				{article.platform !== "wechat-official-accounts" && (
					<div className="space-y-2 md:col-span-4">
						<label className="block text-xs font-medium text-muted-foreground">
							{cardCountLabel}
						</label>
						<div className="flex items-center gap-2">
							<Input
								type="number"
								min={1}
								max={20}
								aria-label={cardCountLabel}
								aria-describedby={cardCountHintId}
								title={cardCountHint}
								className="h-9 w-16 rounded-full border-0 bg-[#f4f4f5] text-center text-xs font-semibold shadow-none focus-visible:ring-[3px] focus-visible:ring-[#18181b]/10"
								value={article.cardCount}
								onChange={(e) => onCardCountChange(parseInt(e.target.value) || 1)}
							/>
							<span id={cardCountHintId} className="sr-only">
								{cardCountHint}
							</span>
							<span className="text-[10px] font-bold text-muted-foreground">
								{t("detail.selfMedia.initPanel.stepDetail.cardCountUnit", "张卡片")}
							</span>
						</div>
					</div>
				)}
			</div>

			<div className="space-y-2">
				<label className="block text-xs font-medium text-muted-foreground">
					{t("detail.selfMedia.initPanel.stepDetail.styleLabel", "文案口吻预设")}
				</label>
				<div className="flex flex-wrap gap-1.5">
					{STYLE_PRESETS.map((preset) => {
						const isActive =
							preset.value === "custom"
								? isCustomStyleSelected
								: article.style === preset.value
						return (
							<button
								key={preset.value}
								type="button"
								aria-pressed={isActive}
								className={cn(
									"cursor-pointer rounded-full border px-3 py-1.5 text-xs font-semibold transition-all duration-300",
									isActive
										? "border-[#18181b] bg-[#18181b] text-white shadow-[0_10px_20px_rgba(24,24,27,0.12)]"
										: "border-transparent bg-[#f4f4f5] text-[#71717a] hover:bg-[#e4e4e7] hover:text-[#18181b]",
								)}
								onClick={() => onFieldChange("style", preset.value)}
							>
								{t(preset.labelKey)}
							</button>
						)
					})}
				</div>
				{isCustomStyleSelected ? (
					<div className="group relative">
						<Input
							type="text"
							className="h-10 rounded-none border-0 border-b border-zinc-200 bg-zinc-50/40 px-4 pr-10 text-sm font-semibold shadow-none focus-visible:border-zinc-950 focus-visible:bg-primary/[0.03] focus-visible:ring-0"
							placeholder={t(
								"detail.selfMedia.initPanel.stepDetail.stylePlaceholder",
								"描述你想要的内容风格...",
							)}
							value={customStyleValue}
							onChange={(e) => onFieldChange("style", e.target.value || "custom")}
						/>
						<InlineVoiceButton
							value={customStyleValue}
							onResult={(text) => onFieldChange("style", text || "custom")}
						/>
					</div>
				) : null}
			</div>

			<div className="space-y-2">
				<label className="block text-xs font-medium text-muted-foreground">
					{t("detail.selfMedia.initPanel.stepDetail.visualLabel", "配图视觉基调")}
				</label>
				<VisualPresetPicker
					presets={availableVisualPresets}
					value={article.visualPreset || "none"}
					onChange={(v) => onFieldChange("visualPreset", v)}
					customDescription={
						article.notes.includes("[视觉描述]")
							? article.notes.split("[视觉描述]")[1]?.split("[/视觉描述]")[0] || ""
							: ""
					}
					onCustomDescriptionChange={(desc) => {
						const base = article.notes
							.replace(/\[视觉描述\].*?\[\/视觉描述\]/g, "")
							.trim()
						const newNotes = desc
							? `${base}\n[视觉描述]${desc}[/视觉描述]`.trim()
							: base
						onFieldChange("notes", newNotes)
					}}
					customDescriptionJson={article.visualDescriptionJson}
					onCustomDescriptionJsonChange={(json) =>
						onFieldChange("visualDescriptionJson", json)
					}
					visualReferenceFiles={article.visualReferenceFiles || []}
					onVisualReferenceFilesChange={(files) =>
						onFieldChange("visualReferenceFiles", files)
					}
					onBlur={onPersistDraft}
				/>
			</div>

			<div className="space-y-1.5">
				<label className="mb-1 block text-xs font-semibold">
					{t(
						"detail.selfMedia.initPanel.stepDetail.descriptionLabel",
						"内容描述与核心观点",
					)}
				</label>
				<MagicPromptEditor
					value={article.descriptionJson}
					textValue={article.description ?? ""}
					onChange={(json) => onFieldChange("descriptionJson", json)}
					onTextChange={(text) => onFieldChange("description", text)}
					onBlur={onPersistDraft}
					placeholder={t("detail.selfMedia.initPanel.stepDetail.descriptionPlaceholder")}
					enableAIPolish
					enableVoice
					enableMention
					rows={3}
					className="rounded-none border-0 border-b border-zinc-200 bg-zinc-50/40 shadow-none ring-0 ring-offset-0 focus-within:border-zinc-950 focus-within:bg-primary/[0.03] focus-within:ring-0 focus-within:ring-offset-0"
					bottomToolbar={
						<div className="flex items-center border-t border-zinc-200/70 bg-zinc-50/40 px-3 py-1.5">
							<ReferenceFilePicker
								value={article.referenceFiles || []}
								onChange={onReferenceFilesChange}
								compact
							/>
							<span className="flex-1" />
						</div>
					}
				/>
			</div>

			<div className="space-y-3">
				<div className="flex items-center justify-between border-b border-[#e4e4e7] pb-2">
					<div className="flex min-w-0 flex-wrap items-center gap-2">
						<label className="text-xs font-medium text-muted-foreground">
							{t(
								isCardPlatform
									? "detail.selfMedia.initPanel.stepDetail.cardContentLabel"
									: "detail.selfMedia.initPanel.stepDetail.outlineLabel",
								"文章大纲规划",
							)}
						</label>
						{outlineStatus ? (
							<span
								aria-live="polite"
								className={cn(
									"rounded-full px-2 py-0.5 text-[10px] font-[760]",
									isOutlineActionBlocked
										? "bg-[#fff7ed] text-[#c2410c]"
										: hasOutline
											? "bg-[#f0fdf4] text-[#15803d]"
											: "bg-[#f4f4f5] text-[#71717a]",
								)}
							>
								{outlineStatus}
							</span>
						) : null}
					</div>
					<div ref={outlineActionRef} className="relative">
						<AiActionButton
							modelValue={outlineModel}
							onModelChange={onOutlineModelChange}
							loading={generatingOutline}
							disabled={isOutlineActionBlocked}
							disabledReason={outlineActionDisabledReason}
							onClick={onOutlineButtonClick}
							variant="primary"
							size="sm"
							label={t(
								hasOutline
									? isCardPlatform
										? "detail.selfMedia.initPanel.stepDetail.cardContentOptimizeBtn"
										: "detail.selfMedia.initPanel.stepDetail.outlineOptimizeBtn"
									: isCardPlatform
										? "detail.selfMedia.initPanel.stepDetail.cardContentGenerateBtn"
										: "detail.selfMedia.initPanel.stepDetail.outlineGenerateBtn",
							)}
							loadingLabel={
								<div className="flex items-center gap-1.5">
									<svg
										className="animate-spin"
										width="10"
										height="10"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										strokeWidth="2.5"
									>
										<path d="M21 12a9 9 0 1 1-6.219-8.56" />
									</svg>
									<span>
										{t(
											hasOutline
												? "detail.selfMedia.initPanel.stepDetail.outlineOptimizing"
												: "detail.selfMedia.initPanel.stepDetail.outlineGenerating",
										)}
									</span>
								</div>
							}
						/>

						{optimizePopoverOpen && hasOutline && !generatingOutline && (
							<div
								className={`absolute right-0 top-full z-[1000] mt-1.5 w-72 p-3 animate-in fade-in-0 zoom-in-95 ${selfMediaOverlayStyles.floatingPanel}`}
							>
								<textarea
									className="min-h-[80px] w-full resize-none rounded-[16px] border-0 bg-[#f8f8f9] px-3 py-2 text-xs shadow-[inset_0_0_0_1px_rgba(24,24,27,0.06)] placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-[#18181b]/15"
									placeholder={t(
										isCardPlatform
											? "detail.selfMedia.initPanel.stepDetail.cardContentOptimizePlaceholder"
											: "detail.selfMedia.initPanel.stepDetail.outlineOptimizePlaceholder",
									)}
									rows={3}
									value={optimizeInstruction}
									onChange={(e) => onOptimizeInstructionChange(e.target.value)}
									autoFocus
								/>
								<div className="mt-2 flex justify-end">
									<button
										type="button"
										className={cn(
											`inline-flex cursor-pointer items-center gap-1 py-1 text-[11px] transition-all active:scale-[0.97] ${selfMediaOverlayStyles.primaryButtonCompact}`,
											!optimizeInstruction.trim() &&
												"cursor-not-allowed opacity-50",
										)}
										disabled={!optimizeInstruction.trim()}
										onClick={() => onAiOptimize(optimizeInstruction)}
									>
										{t(
											"detail.selfMedia.initPanel.stepDetail.outlineOptimizeSubmit",
										)}
									</button>
								</div>
							</div>
						)}
					</div>
				</div>

				{isCardPlatform ? (
					<CardContentEditor
						outline={article.outline}
						cardCount={article.cardCount}
						onChange={onOutlineChange}
						onRemoveCard={onRemoveCard}
						onBlur={onPersistDraft}
						uploadToProject={fileStorageService ? onUploadToProject : undefined}
					/>
				) : (
					<ArticleOutlineEditor
						outline={article.outline}
						onChange={onOutlineChange}
						onBlur={onPersistDraft}
						uploadToProject={fileStorageService ? onUploadToProject : undefined}
					/>
				)}
			</div>
		</div>
	)
}
