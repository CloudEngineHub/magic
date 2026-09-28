import { Loader2, Check, AlertCircle } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"
import { ScrollArea } from "@/components/shadcn-ui/scroll-area"
import { cn } from "@/utils/cn"
import { useSpeakerNotesResize } from "../hooks/useSpeakerNotesResize"
import { useNotesOverviewScroll } from "../hooks/useNotesOverviewScroll"
import SpeakerNotesEditor, { type SaveState } from "./SpeakerNotesEditor"
import PPTNotesSlideLoading from "./PPTNotesSlideLoading"
import type { PPTSpeakerNotesPanelProps } from "./pptNotesTypes"

/** One keyed editor per file keeps drafts and pending saves intact across both views. */
export default function PPTSpeakerNotesPanel(props: PPTSpeakerNotesPanelProps) {
	const { t } = useTranslation("super")
	const drafts = useRef(new Map<string, string>())
	const [overviewSelected, setShowAll] = useState(false)
	const isPresenter = props.layout === "presenter"
	const showAll = overviewSelected && !isPresenter
	const [openedAll, setOpenedAll] = useState(false)
	const { panelRef, height, overlay, inFlowHeight, resizeHandleProps } = useSpeakerNotesResize()
	const visible = props.visible !== false
	const slideKey = props.fileId || String(props.slideIndex)
	const activeKeyRef = useRef(slideKey)
	activeKeyRef.current = slideKey
	const currentSlide = props.slides?.find((slide) => slide.slideIndex === props.slideIndex) ?? {
		key: slideKey,
		fileId: props.fileId,
		slideIndex: props.slideIndex,
		rawContent: props.rawContent,
	}
	const { viewportRef, currentNoteRef } = useNotesOverviewScroll(
		showAll && visible,
		currentSlide.key,
		currentSlide.slideIndex,
	)
	// Once opened, retain editors while hidden: changing views must not discard failed saves.
	const slides = openedAll && props.slides ? props.slides : [currentSlide]
	const isOverlay = overlay && !isPresenter
	const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({})
	// Only aggregate files still in this deck; a removed page cannot leave a stale status.
	const states = (props.slides ?? [currentSlide]).map((slide) => saveStates[slide.key])
	const hasDrafts = (props.slides ?? [currentSlide]).some((slide) =>
		drafts.current.has(slide.key),
	)
	const status = states.includes("saving")
		? "saving"
		: states.includes("error")
			? "error"
			: states.includes("unsaved") || hasDrafts
				? "unsaved"
				: states.includes("saved")
					? "saved"
					: "idle"
	const statusLabel =
		status === "saving"
			? t("ppt.speakerNotes.saving")
			: status === "error"
				? t("ppt.speakerNotes.saveFailed")
				: status === "unsaved"
					? t("ppt.speakerNotes.unsaved")
					: status === "saved"
						? t("ppt.speakerNotes.saved")
						: null
	const StatusIcon = status === "saving" ? Loader2 : status === "error" ? AlertCircle : Check
	const { onPendingChangesChange } = props
	// Single-page mode unmounts the old editor, but its draft remains in this panel's cache.
	// Keep it protected even after that editor's transient save status is removed.
	const pendingChanges =
		hasDrafts || status === "saving" || status === "error" || status === "unsaved"
	useEffect(() => {
		onPendingChangesChange?.(pendingChanges)
	}, [pendingChanges, onPendingChangesChange])

	return (
		<>
			{visible && isOverlay ? (
				<div
					aria-hidden
					data-testid="ppt-speaker-notes-spacer"
					className="pointer-events-none shrink-0"
					style={{ height: inFlowHeight }}
				/>
			) : null}
			<section
				ref={panelRef}
				data-testid="ppt-speaker-notes-panel"
				data-layout={props.layout ?? "default"}
				data-overlay={isOverlay ? "true" : undefined}
				hidden={!visible}
				style={isPresenter ? undefined : { height }}
				className={cn(
					"min-h-0 flex-col overflow-hidden border-t border-border/60 bg-background",
					// The overview uses the existing stage as its boundary, including embedded previews.
					isOverlay
						? "absolute inset-x-0 bottom-0 z-[5] shadow-[0_-8px_32px_oklch(0_0_0/0.12)]"
						: "shrink-0",
					isPresenter && "col-start-2 row-start-2 h-full min-w-0 rounded-xl border",
					visible ? "flex" : "hidden",
				)}
			>
				{/* Both views share the saved panel height and the same resize controls. */}
				{!isPresenter && (
					<button
						type="button"
						aria-label={t("ppt.speakerNotes.resize")}
						className="group flex h-2 w-full shrink-0 cursor-ns-resize touch-none items-center justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
						{...resizeHandleProps}
					>
						<span className="h-0.5 w-7 rounded-full bg-border transition-colors group-hover:bg-muted-foreground/50" />
					</button>
				)}
				{((!isPresenter && props.slides && props.slides.length > 1) || statusLabel) && (
					<div className="flex shrink-0 items-center gap-1 border-b border-border/60 px-3 py-1">
						{!isPresenter && props.slides && props.slides.length > 1 && (
							<>
								<Button
									variant={showAll ? "ghost" : "secondary"}
									size="sm"
									className="h-7 px-2 text-xs"
									aria-pressed={!showAll}
									onClick={() => setShowAll(false)}
								>
									{t("ppt.speakerNotes.currentPage")}
								</Button>
								<Button
									variant={showAll ? "secondary" : "ghost"}
									size="sm"
									className="h-7 px-2 text-xs"
									aria-pressed={showAll}
									onClick={() => {
										setOpenedAll(true)
										setShowAll(true)
									}}
								>
									{t("ppt.speakerNotes.allPages", { count: props.slides.length })}
								</Button>
							</>
						)}
						{statusLabel && (
							<span
								role="status"
								aria-live="polite"
								data-testid="ppt-notes-save-status"
								className={cn(
									"ml-auto flex shrink-0 items-center gap-1.5 text-xs",
									status === "error"
										? "text-destructive"
										: "text-muted-foreground",
								)}
							>
								{status !== "unsaved" && (
									<StatusIcon
										className={cn(
											"size-4",
											status === "saving" && "animate-spin",
										)}
									/>
								)}
								{statusLabel}
							</span>
						)}
					</div>
				)}
				<ScrollArea
					viewportRef={viewportRef}
					className="min-h-0 flex-1"
					// Let notes determine their content height; this viewport owns scrolling in every view.
					viewportClassName="overscroll-contain"
				>
					{slides.map((slide) => (
						<div
							key={slide.key}
							ref={slide.key === currentSlide.key ? currentNoteRef : undefined}
							hidden={!showAll && slide.key !== currentSlide.key}
							className={cn(showAll && "border-b border-border/60 last:border-b-0")}
						>
							{slide.rawContent === undefined ? (
								<PPTNotesSlideLoading
									slide={slide}
									isCurrentPage={slide.key === currentSlide.key}
									onLoad={props.onLoadSlide}
									enabled={showAll && visible}
								/>
							) : (
								<SpeakerNotesEditor
									{...props}
									overview={showAll}
									isCurrentPage={slide.key === currentSlide.key}
									onSaveStateChange={(state) =>
										setSaveStates((previous) => {
											if (previous[slide.key] === state) return previous
											const next = { ...previous }
											if (state === undefined) delete next[slide.key]
											else next[slide.key] = state
											return next
										})
									}
									slideIndex={slide.slideIndex}
									fileId={slide.fileId}
									rawContent={slide.rawContent}
									allowEdit={props.allowEdit && Boolean(slide.fileId)}
									onGenerate={
										props.allowEdit && slide.fileId && props.onGenerate
											? (action) => {
													// Overview actions stay bound to their own file, even if the canvas navigates during save.
													if (
														showAll ||
														activeKeyRef.current === slideKey
													)
														props.onGenerate?.(action, slide.fileId)
												}
											: undefined
									}
									initialDraft={drafts.current.get(slide.key)}
									onDraftChange={(draft) => {
										if (draft === undefined) drafts.current.delete(slide.key)
										else drafts.current.set(slide.key, draft)
									}}
									onDraftSaved={(draft) => {
										if (drafts.current.get(slide.key) === draft)
											drafts.current.delete(slide.key)
									}}
								/>
							)}
						</div>
					))}
				</ScrollArea>
			</section>
		</>
	)
}
