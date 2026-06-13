import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useTranslation } from "react-i18next"
import type { JSONContent } from "@tiptap/react"
import { ChevronsUpDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/shadcn-ui/badge"
import { MagicPromptEditor } from "@/components/base/MagicPromptEditor"
import type { MagicPromptEditorRef } from "@/components/base/MagicPromptEditor/types"
import { buildFileReferenceMention } from "../../../../services/selfMediaPromptBuilder"
import type { ReferenceFileValue, VisualPresetOption } from "../../types"
import { PresetRealCard } from "./PresetPreviewCards"
import ReferenceFilePicker from "./ReferenceFilePicker"

const PREVIEW_PANEL_WIDTH = 320
const PREVIEW_PANEL_GAP = 8
const PREVIEW_VIEWPORT_PADDING = 16
const PREVIEW_CLOSE_DELAY_MS = 320

const PRESET_LAYOUT_MARK_VARIANTS = {
	"code-dispatch": "dispatch",
	"dark-tech": "terminal",
	"film-vintage": "media",
	"gradient-editorial": "editorial",
	"ins-gradient": "media",
	"ins-modern": "frame",
	"ins-minimal": "frame",
	"ins-retro": "media",
	"neo-brutalism": "bold-card",
	"paper-column": "column",
	"personal-insight": "insight",
	"product-launch-preset": "launch",
	"signal-grid": "grid",
	"warm-journal": "journal",
} as const

type PresetLayoutMarkVariant =
	| (typeof PRESET_LAYOUT_MARK_VARIANTS)[keyof typeof PRESET_LAYOUT_MARK_VARIANTS]
	| "custom"
	| "none"

interface PreviewState {
	left: number
	side: "left" | "right"
	top: number
	value: string
}

function getPreviewPosition(
	trigger: HTMLElement,
	side: "left" | "right",
): Pick<PreviewState, "left" | "top"> {
	const rect = trigger.getBoundingClientRect()
	const viewportWidth =
		typeof window === "undefined" ? PREVIEW_PANEL_WIDTH * 2 : window.innerWidth
	const rawLeft =
		side === "left"
			? rect.left - PREVIEW_PANEL_WIDTH - PREVIEW_PANEL_GAP
			: rect.right + PREVIEW_PANEL_GAP
	const maxLeft = viewportWidth - PREVIEW_PANEL_WIDTH - PREVIEW_VIEWPORT_PADDING

	return {
		left: Math.max(PREVIEW_VIEWPORT_PADDING, Math.min(rawLeft, maxLeft)),
		top: rect.top + rect.height / 2,
	}
}

function extractAccentColor(swatch?: string): string {
	const colors = swatch?.match(/#[0-9a-f]{3,8}\b|rgba?\([^)]+\)|hsla?\([^)]+\)/gi) ?? []

	return colors.at(-1) ?? "#18181b"
}

function getPresetLayoutMarkVariant(value: string): PresetLayoutMarkVariant {
	if (value === "custom") return "custom"
	if (value === "none") return "none"

	return PRESET_LAYOUT_MARK_VARIANTS[value as keyof typeof PRESET_LAYOUT_MARK_VARIANTS] ?? "frame"
}

function PresetLayoutMark({
	className,
	preset,
}: {
	className?: string
	preset: VisualPresetOption
}) {
	const accentColor =
		preset.value === "code-dispatch" ? "#dd0000" : extractAccentColor(preset.swatch)
	const variant = getPresetLayoutMarkVariant(preset.value)
	const isDark = variant === "terminal"
	const lineClass = isDark ? "bg-white/75" : "bg-zinc-950/70"
	const mutedLineClass = isDark ? "bg-white/30" : "bg-zinc-950/18"
	const surfaceClass = isDark
		? "border-zinc-950/80 bg-zinc-950"
		: "border-zinc-950/10 bg-[#fbfbfa]"

	const accentStyle = { backgroundColor: accentColor }

	return (
		<div
			aria-hidden="true"
			className={cn(
				"relative overflow-hidden rounded-xl border p-1.5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.72),0_4px_12px_rgba(24,24,27,0.08)]",
				surfaceClass,
				className,
			)}
			data-layout-mark-variant={variant}
			data-testid={`visual-preset-layout-mark-${preset.value}`}
		>
			<span className="absolute inset-x-0 top-0 h-1" style={accentStyle} />
			{variant === "none" ? (
				<div className="flex h-full items-center justify-center">
					<span className="h-3.5 w-3.5 rounded-full border border-dashed border-zinc-400" />
				</div>
			) : variant === "custom" ? (
				<div className="relative h-full rounded-md border border-zinc-950/70 bg-white">
					<span className="absolute left-1/2 top-1/2 h-2.5 w-5 -translate-x-1/2 -translate-y-1/2 -rotate-6 rounded-full bg-zinc-950" />
				</div>
			) : variant === "bold-card" ? (
				<div className="relative h-full overflow-hidden rounded-md bg-[#fafaf8]">
					<div className="absolute inset-0 bg-[repeating-linear-gradient(transparent,transparent_6px,#dedbd1_7px)]" />
					<span className="absolute bottom-0 left-[22%] top-0 w-px bg-[#ff2442]/25" />
					<div className="relative z-[1] flex h-full flex-col items-center justify-center gap-0.5 px-1 pb-2 pt-1">
						<span className="h-1.5 w-6 rounded-full bg-zinc-950" />
						<span className="h-1.5 w-5 rounded-full bg-zinc-950" />
						<span className="h-1 w-6 rounded-full bg-[#ffe566]" />
					</div>
					<div className="absolute inset-x-1 bottom-1 z-[1] flex h-1.5 overflow-hidden rounded-[2px] border border-zinc-950">
						<span className="flex-1 bg-[#ffe566]" />
						<span className="flex-1 bg-[#ff2442]" />
					</div>
				</div>
			) : variant === "dispatch" ? (
				<div className="flex h-full flex-col gap-1 pt-1.5">
					<span className="absolute inset-x-0 top-0 h-1 bg-zinc-950" />
					<div className="mt-1 flex items-center gap-1">
						<span className="h-1.5 w-1.5" style={accentStyle} />
						<span className="h-1 w-5 rounded-full bg-zinc-950/75" />
					</div>
					<span className="h-1 w-7 rounded-full bg-zinc-950/25" />
					<span className="h-1 w-4 rounded-full bg-zinc-950/25" />
					<span className="mt-auto h-2.5 rounded border border-zinc-950/25 bg-white" />
				</div>
			) : variant === "editorial" ? (
				<div className="flex h-full flex-col gap-1 pt-1">
					<span className="border-zinc-950/12 h-3.5 rounded border bg-zinc-950/[0.08]" />
					<span className={cn("mt-auto h-1.5 w-7 rounded-full", lineClass)} />
					<span className={cn("h-1 w-5 rounded-full", mutedLineClass)} />
				</div>
			) : variant === "insight" ? (
				<div className="flex h-full flex-col gap-1.5 pt-1">
					<div className="flex items-center gap-1">
						<span className="h-2.5 w-2.5 rounded-full" style={accentStyle} />
						<span className={cn("h-1 w-5 rounded-full", lineClass)} />
					</div>
					<div className="border-zinc-950/14 rounded border bg-white p-1">
						<span className={cn("mb-1 block h-1 w-6 rounded-full", lineClass)} />
						<span className={cn("block h-1 w-4 rounded-full", mutedLineClass)} />
					</div>
				</div>
			) : variant === "grid" ? (
				<div className="grid h-full grid-cols-2 grid-rows-2 gap-px pt-1">
					<span className="rounded-sm border border-zinc-950/45 bg-white" />
					<span className="rounded-sm border border-zinc-950/45 bg-white" />
					<span className="rounded-sm border border-zinc-950/45 bg-white" />
					<span className="rounded-sm border border-zinc-950/45 bg-white" />
				</div>
			) : variant === "terminal" ? (
				<div className="flex h-full flex-col justify-end gap-1 pt-2">
					<span className={cn("h-1.5 w-7 rounded-full", lineClass)} />
					<span className={cn("h-1 w-5 rounded-full", mutedLineClass)} />
					<span className="mt-0.5 h-2.5 w-full rounded border border-white/20" />
				</div>
			) : variant === "media" || variant === "journal" ? (
				<div className="flex h-full flex-col gap-1 pt-1">
					<span className={cn("h-1.5 w-6 rounded-full", lineClass)} />
					<span className={cn("h-1 w-4 rounded-full", mutedLineClass)} />
					<span className="border-zinc-950/18 mt-auto h-3.5 rounded border bg-zinc-950/[0.06]" />
				</div>
			) : variant === "column" ? (
				<div className="flex h-full gap-1 pt-1">
					<span className="bg-zinc-950/18 h-full w-px" />
					<div className="flex flex-1 flex-col gap-1">
						<span className={cn("h-1.5 w-7 rounded-full", lineClass)} />
						<span className={cn("h-1 w-5 rounded-full", mutedLineClass)} />
						<span className="border-zinc-950/18 mt-auto h-3 rounded border bg-zinc-950/[0.04]" />
					</div>
				</div>
			) : variant === "profile" ? (
				<div className="flex h-full flex-col gap-1.5 pt-1">
					<div className="flex items-center gap-1">
						<span className="h-2.5 w-2.5 rounded-full" style={accentStyle} />
						<span className={cn("h-1 w-5 rounded-full", lineClass)} />
					</div>
					<span className={cn("h-1.5 w-7 rounded-full", lineClass)} />
					<span className={cn("h-1 w-5 rounded-full", mutedLineClass)} />
				</div>
			) : variant === "launch" ? (
				<div className="flex h-full flex-col justify-end gap-1 pt-2">
					<span className={cn("h-1.5 w-7 rounded-full", lineClass)} />
					<span className={cn("h-1 w-4 rounded-full", mutedLineClass)} />
					<span className="border-zinc-950/12 h-3 rounded border bg-zinc-950/[0.04]" />
				</div>
			) : (
				<div className="flex h-full flex-col justify-center gap-1">
					<span className={cn("h-1.5 w-7 rounded-full", lineClass)} />
					<span className={cn("h-1 w-5 rounded-full", mutedLineClass)} />
					<span className={cn("h-1 w-6 rounded-full", mutedLineClass)} />
				</div>
			)}
		</div>
	)
}

function PresetHoverPreview({
	isOpen,
	position,
	preset,
	label,
	description,
	scrollHint,
	side,
	onMouseEnter,
	onMouseLeave,
}: {
	isOpen: boolean
	onMouseEnter?: () => void
	onMouseLeave?: () => void
	position?: Pick<PreviewState, "left" | "top">
	preset: VisualPresetOption
	label: string
	description: string
	scrollHint: string
	side: "left" | "right"
}) {
	if (!preset.preview || !isOpen || !position || typeof document === "undefined") return null
	const imageUrl = preset.preview.imageUrl

	return createPortal(
		<div
			aria-hidden="true"
			className="fixed z-[1000] w-[320px] max-w-[calc(100vw-32px)] -translate-y-1/2 rounded-2xl border border-zinc-200/70 bg-white p-2 text-left opacity-100 shadow-[0_18px_48px_rgba(24,24,27,0.13)] ring-1 ring-zinc-950/[0.04] transition-opacity duration-150"
			data-preview-side={side}
			data-preview-portal="body"
			data-testid={`visual-preset-hover-preview-${preset.value}`}
			data-self-media-preset-preview-image={imageUrl}
			data-self-media-preset-preview-source={preset.preview.sourcePath}
			onClick={(event) => event.stopPropagation()}
			onMouseDown={(event) => event.stopPropagation()}
			onMouseEnter={onMouseEnter}
			onMouseLeave={onMouseLeave}
			style={{ left: position.left, top: position.top }}
		>
			{imageUrl ? (
				<div className="relative">
					<div
						className="max-h-[min(48vh,360px)] overflow-y-auto rounded-xl border border-zinc-200/70 bg-zinc-100/70 shadow-inner"
						data-testid={`visual-preset-long-image-scroll-${preset.value}`}
					>
						<img
							alt=""
							className="block w-full select-none"
							data-testid={`visual-preset-long-image-${preset.value}`}
							draggable={false}
							src={imageUrl}
						/>
					</div>
					<div
						className="pointer-events-none absolute right-2 top-2 z-10 flex items-center gap-1 rounded-full border border-white/80 bg-zinc-950/90 px-2 py-1 text-[10px] font-[760] leading-none text-white shadow-[0_8px_22px_rgba(24,24,27,0.28)] ring-1 ring-zinc-950/10 backdrop-blur-md"
						data-testid={`visual-preset-scroll-hint-${preset.value}`}
					>
						<ChevronsUpDown aria-hidden="true" className="h-3 w-3" />
						<span>{scrollHint}</span>
					</div>
				</div>
			) : (
				<div className="grid grid-cols-2 gap-2">
					<PresetRealCard
						value={preset.value}
						variant="cover"
						testId={`visual-preset-real-card-${preset.value}-cover`}
					/>
					<PresetRealCard
						value={preset.value}
						variant="content"
						testId={`visual-preset-real-card-${preset.value}-content`}
					/>
				</div>
			)}
			<div
				className="mt-2 min-w-0 border-t border-zinc-200/70 px-1 pb-1 pt-2"
				data-testid={`visual-preset-hover-copy-${preset.value}`}
			>
				<div className="truncate text-[13px] font-[820] leading-tight text-[#18181b]">
					{label}
				</div>
				<div className="mt-1 line-clamp-2 text-[11px] font-[560] leading-snug text-[#71717a]">
					{description}
				</div>
			</div>
		</div>,
		document.body,
	)
}

interface VisualPresetPickerProps {
	presets: VisualPresetOption[]
	value: string
	onChange: (value: string) => void
	/** Custom description text for "custom" mode */
	customDescription?: string
	onCustomDescriptionChange?: (value: string) => void
	/** Rich JSON content for custom visual description */
	customDescriptionJson?: JSONContent
	onCustomDescriptionJsonChange?: (json: JSONContent) => void
	/** Visual reference files for "custom" mode */
	visualReferenceFiles?: ReferenceFileValue[]
	onVisualReferenceFilesChange?: (files: ReferenceFileValue[]) => void
	/** Called when editor loses focus */
	onBlur?: () => void
	/** Size variant */
	size?: "sm" | "md"
}

export default function VisualPresetPicker({
	presets,
	value,
	onChange,
	customDescription,
	onCustomDescriptionChange,
	customDescriptionJson,
	onCustomDescriptionJsonChange,
	visualReferenceFiles,
	onVisualReferenceFilesChange,
	onBlur,
	size = "sm",
}: VisualPresetPickerProps) {
	const { t } = useTranslation("super")
	const selected = value || "none"
	const isMd = size === "md"
	const columnCount = isMd ? 2 : 3
	const editorRef = useRef<MagicPromptEditorRef>(null)
	const closePreviewTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null)
	const [previewState, setPreviewState] = useState<PreviewState | null>(null)

	const cancelClosePreview = useCallback(() => {
		if (!closePreviewTimerRef.current) return
		window.clearTimeout(closePreviewTimerRef.current)
		closePreviewTimerRef.current = null
	}, [])

	const openPreview = useCallback(
		(trigger: HTMLElement, presetValue: string, side: "left" | "right") => {
			cancelClosePreview()
			setPreviewState({
				...getPreviewPosition(trigger, side),
				side,
				value: presetValue,
			})
		},
		[cancelClosePreview],
	)

	const closePreview = useCallback(
		(presetValue: string) => {
			cancelClosePreview()
			setPreviewState((current) => (current?.value === presetValue ? null : current))
		},
		[cancelClosePreview],
	)

	const scheduleClosePreview = useCallback(
		(presetValue: string) => {
			cancelClosePreview()
			closePreviewTimerRef.current = window.setTimeout(() => {
				setPreviewState((current) => (current?.value === presetValue ? null : current))
				closePreviewTimerRef.current = null
			}, PREVIEW_CLOSE_DELAY_MS)
		},
		[cancelClosePreview],
	)

	useEffect(() => cancelClosePreview, [cancelClosePreview])

	/** When reference files are selected, insert them as @mention nodes into the editor */
	const handleVisualReferenceFilesChange = useCallback(
		(files: ReferenceFileValue[]) => {
			// Still store them for data persistence
			onVisualReferenceFilesChange?.(files)

			// Insert new files as @mention nodes into the editor
			const editor = editorRef.current?.getEditor()
			if (!editor) return

			// Find files that are newly added (not already in current value)
			const currentFiles = visualReferenceFiles || []
			const currentPaths = new Set(currentFiles.map((f) => f.file_path))
			const newFiles = files.filter((f) => f.file_path && !currentPaths.has(f.file_path))

			if (newFiles.length === 0) return

			// Move cursor to end and insert mention nodes
			editor.commands.focus("end")
			for (const file of newFiles) {
				if (!file.file_path) continue
				const ext =
					file.name.lastIndexOf(".") !== -1
						? file.name.slice(file.name.lastIndexOf(".") + 1)
						: ""
				const mentionNode = buildFileReferenceMention({
					file_id: file.file_id || "",
					file_name: file.name,
					file_path: file.file_path,
					file_extension: ext,
				})
				editor.commands.insertContent([{ type: "text", text: " " }, mentionNode])
			}
		},
		[onVisualReferenceFilesChange, visualReferenceFiles],
	)

	return (
		<div>
			<div className={cn("grid gap-1.5", isMd ? "grid-cols-2 gap-2" : "grid-cols-3")}>
				{presets.map((preset, index) => {
					const isSelected = selected === preset.value
					const label = t(preset.labelKey)
					const description = t(preset.descriptionKey)
					const previewSide = (index + 1) % columnCount === 0 ? "left" : "right"
					return (
						<button
							key={preset.value}
							type="button"
							data-testid={`visual-preset-option-${preset.value}`}
							className={cn(
								"group relative flex items-center gap-2 overflow-visible rounded-lg border-0 bg-zinc-50/70 text-left shadow-none ring-1 ring-zinc-950/[0.06] transition-all duration-200 hover:z-[1001] hover:bg-zinc-100/70 hover:ring-zinc-950/10 focus-visible:z-[1001]",
								isMd ? "py-2 pl-2 pr-2.5" : "py-1.5 pl-1.5 pr-2",
								isSelected && "bg-white ring-1 ring-zinc-950/30",
							)}
							onClick={() => onChange(preset.value)}
							onBlur={() => closePreview(preset.value)}
							onFocus={(event) =>
								openPreview(event.currentTarget, preset.value, previewSide)
							}
							onMouseEnter={(event) =>
								openPreview(event.currentTarget, preset.value, previewSide)
							}
							onMouseLeave={() => scheduleClosePreview(preset.value)}
						>
							<PresetLayoutMark
								className={cn("shrink-0", isMd ? "h-10 w-10" : "h-8 w-8")}
								preset={preset}
							/>
							<span
								className={cn(
									"min-w-0 flex-1 truncate font-bold leading-tight",
									isMd ? "text-xs" : "text-[11px]",
									isSelected ? "text-foreground" : "text-muted-foreground",
								)}
							>
								{label}
							</span>
							{isSelected && (
								<Badge className="absolute right-1 top-1 h-4 min-w-4 rounded-full px-0">
									<svg
										width="8"
										height="8"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										strokeWidth="3"
										strokeLinecap="round"
										strokeLinejoin="round"
									>
										<polyline points="20 6 9 17 4 12" />
									</svg>
								</Badge>
							)}
							<PresetHoverPreview
								isOpen={previewState?.value === preset.value}
								position={
									previewState?.value === preset.value ? previewState : undefined
								}
								preset={preset}
								label={label}
								description={description}
								scrollHint={t("detail.selfMedia.initPanel.visuals.scrollHint")}
								side={
									previewState?.value === preset.value
										? previewState.side
										: previewSide
								}
								onMouseEnter={cancelClosePreview}
								onMouseLeave={() => scheduleClosePreview(preset.value)}
							/>
						</button>
					)
				})}
			</div>

			{/* Custom mode inputs */}
			{selected === "custom" && onCustomDescriptionChange && (
				<div className={cn(isMd ? "mt-3" : "mt-2")}>
					<MagicPromptEditor
						ref={editorRef}
						value={customDescriptionJson}
						textValue={customDescription ?? ""}
						onChange={(json: JSONContent) => onCustomDescriptionJsonChange?.(json)}
						onTextChange={(text: string) => onCustomDescriptionChange(text)}
						onBlur={onBlur}
						placeholder={t(
							"detail.selfMedia.initPanel.stepDetail.visualCustomPlaceholder",
						)}
						enableMention
						enableVoice={false}
						enableAIPolish={false}
						rows={2}
						className={cn(
							"rounded-none border-0 border-b border-zinc-200 bg-zinc-50/40 shadow-none ring-0 ring-offset-0 focus-within:border-zinc-950 focus-within:bg-primary/[0.03] focus-within:ring-0 focus-within:ring-offset-0",
							isMd ? "text-sm" : "text-xs",
						)}
						bottomToolbar={
							onVisualReferenceFilesChange ? (
								<div className="flex items-center border-t border-zinc-200/70 bg-zinc-50/40 px-3 py-1.5">
									<ReferenceFilePicker
										compact
										label={t(
											"detail.selfMedia.initPanel.stepDetail.visualReferenceLabel",
										)}
										value={visualReferenceFiles || []}
										onChange={handleVisualReferenceFilesChange}
									/>
								</div>
							) : undefined
						}
					/>
				</div>
			)}
		</div>
	)
}
