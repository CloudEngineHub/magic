import { memo, useEffect, useState, type PointerEvent, type ReactNode } from "react"
import {
	AnimatePresence,
	motion,
	useMotionValue,
	useReducedMotion,
	useSpring,
	useTransform,
	type MotionValue,
} from "framer-motion"
import { useTranslation } from "react-i18next"
import { Check, Sparkles } from "lucide-react"
import { cn } from "@/utils/cn"
import type { ShowcaseKind } from "../showcase"
import AiCanvasComposerFrame from "./AiCanvasComposerFrame"
import ArtworkPlaceholder from "./ArtworkPlaceholder"

/** One built-in artwork placed on the hero board. */
export interface BoardArtwork {
	key: string
	kind: ShowcaseKind
	url: string
	/** The artwork after the board note's edit; enables the in-place edit animation. */
	editedUrl?: string
}

interface AiCanvasHeroProps {
	/** Built-in showcase artworks; empty slots fall back to vector placeholders. */
	artworks: BoardArtwork[]
	children: ReactNode
	footer?: ReactNode
}

function ArtworkImage({ artwork, kind }: { artwork?: BoardArtwork; kind: ShowcaseKind }) {
	const fallback = <ArtworkPlaceholder kind={kind} className="size-full" />
	if (artwork?.url) {
		return <img src={artwork.url} alt="" draggable={false} className="size-full object-cover" />
	}
	return fallback
}

/**
 * Demo loop of the annotation edit on the character card:
 * | phase   | duration | what the board shows                                       |
 * | before  | 2.8s     | original artwork                                           |
 * | editing | 1.8s     | flowing connector, selection box, edited image wipes in    |
 * | after   | 3.4s     | edited artwork with a "done" tag, then fades back to before |
 */
export type EditPhase = "before" | "editing" | "after"

const EDIT_PHASE_DURATIONS: Record<EditPhase, number> = {
	before: 2800,
	editing: 1800,
	after: 3400,
}
const NEXT_EDIT_PHASE: Record<EditPhase, EditPhase> = {
	before: "editing",
	editing: "after",
	after: "before",
}

/** Tracks tab visibility so timer-driven board loops stop scheduling in background tabs. */
function usePageVisible() {
	const [visible, setVisible] = useState(
		() => typeof document === "undefined" || document.visibilityState === "visible",
	)
	useEffect(() => {
		const handleVisibility = () => setVisible(document.visibilityState === "visible")
		document.addEventListener("visibilitychange", handleVisibility)
		return () => document.removeEventListener("visibilitychange", handleVisibility)
	}, [])
	return visible
}

/**
 * Runs the edit demo loop. It stays on "before" when disabled (reduced motion or no edited
 * artwork) and pauses while the tab is hidden, so a background tab schedules no timers.
 */
function useEditPhase(enabled: boolean): EditPhase {
	const [phase, setPhase] = useState<EditPhase>("before")
	const visible = usePageVisible()

	useEffect(() => {
		if (!enabled) {
			setPhase("before")
			return
		}
		if (!visible) return
		const timer = window.setTimeout(
			() => setPhase((current) => NEXT_EDIT_PHASE[current]),
			EDIT_PHASE_DURATIONS[phase],
		)
		return () => window.clearTimeout(timer)
	}, [enabled, phase, visible])

	return enabled ? phase : "before"
}

/**
 * Artwork that plays the edit: the edited image is revealed top to bottom behind a soft light
 * band (the "brush" of the AI), held, then faded out. The clip reset is delayed until the
 * fade ends so the image never visibly snaps back.
 */
function EditingArtwork({
	artwork,
	kind,
	phase,
}: {
	artwork?: BoardArtwork
	kind: ShowcaseKind
	phase: EditPhase
}) {
	const revealed = phase !== "before"
	return (
		<div className="relative size-full">
			<ArtworkImage artwork={artwork} kind={kind} />
			{artwork?.editedUrl ? (
				<>
					<motion.img
						src={artwork.editedUrl}
						alt=""
						draggable={false}
						className="absolute inset-0 size-full object-cover"
						initial={false}
						animate={{
							clipPath: revealed ? "inset(0% 0% 0% 0%)" : "inset(0% 0% 100% 0%)",
							opacity: revealed ? 1 : 0,
						}}
						transition={
							revealed
								? {
										clipPath: { duration: 1.4, ease: [0.65, 0, 0.35, 1] },
										opacity: { duration: 0.01 },
									}
								: {
										opacity: { duration: 0.8, ease: "easeOut" },
										clipPath: { duration: 0, delay: 0.8 },
									}
						}
					/>
					<motion.div
						className="absolute inset-x-0 h-12 bg-gradient-to-b from-transparent via-white/70 to-transparent"
						initial={false}
						animate={
							phase === "editing"
								? { top: ["-15%", "100%"], opacity: [1, 1, 0] }
								: { top: "-15%", opacity: 0 }
						}
						transition={{
							duration: phase === "editing" ? 1.4 : 0,
							ease: [0.65, 0, 0.35, 1],
						}}
					/>
				</>
			) : null}
		</div>
	)
}

/** Tag above the edited card: "editing" while the wipe runs, then "done" during the hold. */
function EditStatusTag({ phase }: { phase: EditPhase }) {
	const { t } = useTranslation("aiCanvas")
	return (
		<AnimatePresence mode="wait">
			{phase !== "before" ? (
				<motion.span
					key={phase}
					initial={{ opacity: 0, y: 4 }}
					animate={{ opacity: 1, y: 0 }}
					exit={{ opacity: 0, y: -4 }}
					transition={{ duration: 0.25 }}
					className={cn(
						"absolute -top-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium text-white shadow-sm",
						phase === "editing" ? "bg-sky-500" : "bg-emerald-500",
					)}
				>
					{phase === "editing" ? (
						<Sparkles size={12} className="animate-pulse" />
					) : (
						<Check size={12} />
					)}
					{phase === "editing" ? t("home.board.editing") : t("home.board.edited")}
				</motion.span>
			) : null}
		</AnimatePresence>
	)
}

/** Seconds each storyboard frame stays active during playback. */
const STORYBOARD_FRAME_SECONDS = 1.6

/**
 * Storyboard strip that "plays": frames light up one after another while a playhead fills
 * the timeline under them. Without motion every frame stays fully visible and no playhead
 * runs.
 */
function StoryboardStrip({
	frames,
	animated,
}: {
	frames: Array<BoardArtwork | undefined>
	animated: boolean
}) {
	const visible = usePageVisible()
	const [active, setActive] = useState(0)
	const playing = animated && visible

	useEffect(() => {
		if (!playing) return
		const timer = window.setInterval(
			() => setActive((current) => (current + 1) % frames.length),
			STORYBOARD_FRAME_SECONDS * 1000,
		)
		return () => window.clearInterval(timer)
	}, [frames.length, playing])

	return (
		<div className="flex flex-col gap-1.5">
			<div className="flex gap-1">
				{frames.map((frame, index) => {
					const isActive = !animated || index === active
					return (
						<div
							key={frame?.key ?? index}
							className={cn(
								"aspect-video w-24 overflow-hidden ring-sky-500 transition-[opacity,box-shadow] duration-300 xl:w-28",
								animated && index === active && "ring-2",
								isActive ? "opacity-100" : "opacity-55",
							)}
						>
							<ArtworkImage artwork={frame} kind="storyboard" />
						</div>
					)
				})}
			</div>
			{animated ? (
				// Timeline: the fill restarts with each frame and reaches that frame's third.
				<div className="relative mx-0.5 h-1 overflow-hidden rounded-full bg-muted">
					<motion.div
						key={active}
						className="absolute inset-y-0 left-0 rounded-full bg-sky-500"
						initial={{ width: `${(active / frames.length) * 100}%` }}
						animate={{ width: `${((active + 1) / frames.length) * 100}%` }}
						transition={{ duration: STORYBOARD_FRAME_SECONDS, ease: "linear" }}
					/>
				</div>
			) : null}
		</div>
	)
}

/** Diagonal highlight that sweeps across a product shot every few seconds, like a glint. */
function ProductGlint({ animated }: { animated: boolean }) {
	if (!animated) return null
	return (
		<motion.div
			className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-white/60 to-transparent"
			initial={{ x: "0%" }}
			animate={{ x: "400%" }}
			transition={{ duration: 1.4, ease: "easeInOut", repeat: Infinity, repeatDelay: 3.6 }}
		/>
	)
}

/**
 * Path of the design expert's cursor over the poster, relative to its resting spot at the
 * poster's lower-left corner: it checks the sky, moves to the sun, then the cliff, and returns.
 */
const POSTER_CURSOR_PATH = {
	x: [0, 70, 150, 110, 0],
	y: [0, -190, -120, -40, 0],
	times: [0, 0.25, 0.5, 0.75, 1],
}

const HANDLE_POSITIONS = [
	"-left-[4.5px] -top-[4.5px]",
	"-right-[4.5px] -top-[4.5px]",
	"-bottom-[4.5px] -left-[4.5px]",
	"-bottom-[4.5px] -right-[4.5px]",
] as const

/** A canvas element: a name tag above a framed image, like elements on the real canvas. */
function BoardNode({
	label,
	className,
	selected = false,
	children,
}: {
	label: string
	className?: string
	selected?: boolean
	children: ReactNode
}) {
	return (
		<div className={cn("flex flex-col gap-1.5", className)}>
			<span className="px-0.5 text-[11px] font-medium text-muted-foreground">{label}</span>
			<div className="relative">
				<div className="overflow-hidden bg-background p-1 shadow-[0_18px_40px_-18px_rgb(15_23_42/0.45)] ring-1 ring-border">
					{children}
				</div>
				{selected ? (
					// Square selection box hugging the element, as on the real canvas; each 8px handle
					// is offset by half its size plus half the 1px border so its center sits on the
					// box corner.
					<div className="absolute -inset-px border border-sky-500">
						{HANDLE_POSITIONS.map((position) => (
							<span
								key={position}
								className={cn(
									"absolute size-2 border border-sky-500 bg-background",
									position,
								)}
							/>
						))}
					</div>
				) : null}
			</div>
		</div>
	)
}

/** Positions a board layer and moves it with the pointer; deeper layers move further. */
function ParallaxLayer({
	x,
	y,
	depth,
	className,
	children,
}: {
	x: MotionValue<number>
	y: MotionValue<number>
	depth: number
	className?: string
	children: ReactNode
}) {
	const translateX = useTransform(x, (value) => value * depth)
	const translateY = useTransform(y, (value) => value * depth)
	return (
		<motion.div className={cn("absolute", className)} style={{ x: translateX, y: translateY }}>
			{children}
		</motion.div>
	)
}

/**
 * Places each artwork on at most one board slot, in two passes: every slot first takes an
 * unused artwork of its own kind, then still-empty slots take leftovers in visual-weight order
 * (poster, character, product, storyboard frames). Slots left empty render placeholders.
 */
export function assignBoardSlots(artworks: BoardArtwork[]) {
	const slotKinds: ShowcaseKind[] = [
		"poster",
		"character",
		"product",
		"storyboard",
		"storyboard",
		"storyboard",
	]
	const used = new Set<string>()
	const assigned: Array<BoardArtwork | undefined> = slotKinds.map((kind) => {
		const match = artworks.find((item) => item.kind === kind && !used.has(item.key))
		if (match) used.add(match.key)
		return match
	})
	const leftovers = artworks.filter((item) => !used.has(item.key))
	const filled = assigned.map((artwork) => artwork ?? leftovers.shift())
	const [poster, character, product, ...storyboard] = filled
	return { poster, character, product, storyboard }
}

/** Character sheet → annotation note; highlighted while the note's edit plays. */
const NOTE_CONNECTOR_PATH = "M10 68 C 10 58, 12 54, 15 52"

const CONNECTOR_PATHS = [
	// Storyboard strip → selected poster, arching over the title.
	"M26 14 C 44 2, 64 2, 80 12",
	// Character sheet → annotation note.
	NOTE_CONNECTOR_PATH,
	// Product shot → poster.
	"M88 74 C 95 62, 95 46, 89 36",
]

/**
 * First screen of the AI canvas home, drawn as a live canvas: storyboard frames, a selected
 * poster, a character sheet and a product shot sit on a dotted board, linked by connectors,
 * with an annotation and the AI's cursor. The composer floats in the middle like a toolbar.
 *
 * Decorative layers are hidden from assistive tech and never take pointer events. Board
 * elements only appear on wide screens so the composer always keeps its space; pointer
 * parallax is disabled when the user prefers reduced motion.
 */
function AiCanvasHero({ artworks, children, footer }: AiCanvasHeroProps) {
	const { t } = useTranslation("aiCanvas")
	const reduceMotion = useReducedMotion()
	const pointerX = useMotionValue(0)
	const pointerY = useMotionValue(0)
	const x = useSpring(pointerX, { stiffness: 60, damping: 20 })
	const y = useSpring(pointerY, { stiffness: 60, damping: 20 })

	const handlePointerMove = (event: PointerEvent<HTMLElement>) => {
		if (reduceMotion) return
		const rect = event.currentTarget.getBoundingClientRect()
		// Offset from the center, mapped to at most ~12px x / 8px y for a depth-1 layer.
		pointerX.set(((event.clientX - rect.left) / rect.width - 0.5) * -24)
		pointerY.set(((event.clientY - rect.top) / rect.height - 0.5) * -16)
	}

	const slots = assignBoardSlots(artworks)
	// Every board animation is off when the user prefers reduced motion.
	const animated = !reduceMotion
	// The character card demonstrates the note's edit when an edited version exists.
	const editPhase = useEditPhase(animated && Boolean(slots.character?.editedUrl))

	return (
		<section
			className="relative isolate flex min-h-[78vh] w-full items-center overflow-hidden border-b border-border/60 px-4 pb-6 pt-16 md:px-10 md:pt-20"
			data-testid="ai-canvas-hero"
			onPointerMove={handlePointerMove}
			onPointerLeave={() => {
				pointerX.set(0)
				pointerY.set(0)
			}}
		>
			{/* Dotted board, fading out toward the bottom edge of the hero. */}
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-0 -z-10"
				style={{
					backgroundImage:
						"radial-gradient(oklch(var(--foreground) / 0.16) 1px, transparent 1.2px)",
					backgroundSize: "24px 24px",
					WebkitMaskImage: "linear-gradient(to bottom, black 60%, transparent 100%)",
					maskImage: "linear-gradient(to bottom, black 60%, transparent 100%)",
				}}
			/>
			{/* Soft color fields; radial gradients fade out on their own so edges never clip. */}
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-0 -z-10"
				style={{
					backgroundImage: [
						"radial-gradient(34rem 22rem at 18% 18%, rgb(196 181 253 / 0.25), transparent 70%)",
						"radial-gradient(34rem 22rem at 84% 70%, rgb(253 224 171 / 0.28), transparent 70%)",
					].join(", "),
				}}
			/>

			{/* Board elements sit behind the composer (z-0) and ignore the pointer entirely. */}
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-0 hidden lg:block"
			>
				<svg
					className="absolute inset-0 size-full"
					viewBox="0 0 100 100"
					preserveAspectRatio="none"
				>
					{CONNECTOR_PATHS.map((path) => (
						<path
							key={path}
							d={path}
							fill="none"
							className="stroke-muted-foreground/40"
							strokeWidth="1.2"
							strokeDasharray="4 5"
							vectorEffect="non-scaling-stroke"
						/>
					))}
					{/* While editing, the note's instruction "flows" along its connector to the card. */}
					<motion.path
						d={NOTE_CONNECTOR_PATH}
						fill="none"
						className="stroke-sky-500"
						strokeWidth="1.6"
						strokeDasharray="4 5"
						vectorEffect="non-scaling-stroke"
						initial={false}
						animate={
							editPhase === "editing"
								? { opacity: 1, strokeDashoffset: [0, 18] }
								: { opacity: 0, strokeDashoffset: 0 }
						}
						transition={
							editPhase === "editing"
								? {
										opacity: { duration: 0.2 },
										strokeDashoffset: {
											duration: 0.6,
											ease: "linear",
											repeat: Infinity,
										},
									}
								: { duration: 0.3 }
						}
					/>
				</svg>

				<ParallaxLayer x={x} y={y} depth={0.6} className="left-[3%] top-[6%]">
					<BoardNode label={t("home.board.storyboard")} className="-rotate-2">
						<StoryboardStrip frames={slots.storyboard} animated={animated} />
					</BoardNode>
				</ParallaxLayer>

				<ParallaxLayer x={x} y={y} depth={1} className="right-[4%] top-[5%]">
					<BoardNode label={t("home.board.poster")} className="rotate-2" selected>
						<div className="aspect-[3/4] w-36 overflow-hidden xl:w-44">
							{/* Slow push-in on the poster, like a camera move on a key visual. */}
							<motion.div
								className="size-full"
								animate={animated ? { scale: [1, 1.08, 1] } : { scale: 1 }}
								transition={{ duration: 14, ease: "easeInOut", repeat: Infinity }}
							>
								<ArtworkImage artwork={slots.poster} kind="poster" />
							</motion.div>
						</div>
					</BoardNode>
					{/* The AI collaborator's cursor, roaming the poster it is working on. */}
					<motion.div
						className="absolute -bottom-8 -left-12 flex items-start gap-1"
						animate={
							animated
								? { x: POSTER_CURSOR_PATH.x, y: POSTER_CURSOR_PATH.y }
								: { x: 0, y: 0 }
						}
						transition={{
							duration: 9,
							ease: "easeInOut",
							times: POSTER_CURSOR_PATH.times,
							repeat: Infinity,
						}}
					>
						<svg width="16" height="16" viewBox="0 0 16 16" className="fill-sky-500">
							<path d="M1 1 L15 6 L8.5 8.5 L6 15 Z" />
						</svg>
						<span className="mt-3 inline-flex items-center gap-1 rounded-full bg-sky-500 px-2 py-0.5 text-[11px] font-medium text-white shadow-sm">
							<Sparkles size={12} />
							{t("home.board.cursor")}
						</span>
					</motion.div>
				</ParallaxLayer>

				<ParallaxLayer x={x} y={y} depth={0.8} className="bottom-[10%] left-[4%]">
					<BoardNode
						label={t("home.board.character")}
						className="relative rotate-1"
						selected={editPhase === "editing"}
					>
						<div className="aspect-[3/4] w-32 overflow-hidden xl:w-36">
							<EditingArtwork
								artwork={slots.character}
								kind="character"
								phase={editPhase}
							/>
						</div>
					</BoardNode>
					<EditStatusTag phase={editPhase} />
				</ParallaxLayer>

				<ParallaxLayer
					x={x}
					y={y}
					depth={0.5}
					className="left-[13%] top-[42%] hidden 2xl:block"
				>
					<div className="w-40 -rotate-3 rounded-lg bg-amber-100 p-3 text-xs leading-5 text-amber-950 shadow-lg dark:bg-amber-200">
						{t("home.board.note")}
					</div>
				</ParallaxLayer>

				<ParallaxLayer x={x} y={y} depth={0.9} className="bottom-[8%] right-[5%]">
					<BoardNode label={t("home.board.product")} className="-rotate-2">
						<div className="relative aspect-square w-32 overflow-hidden xl:w-36">
							<ArtworkImage artwork={slots.product} kind="product" />
							<ProductGlint animated={animated} />
						</div>
					</BoardNode>
				</ParallaxLayer>
			</div>

			<div className="relative mx-auto flex w-full max-w-3xl flex-col items-center gap-6">
				<div className="flex flex-col items-center gap-3 text-center">
					<span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/80 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
						<Sparkles size={16} aria-hidden="true" />
						{t("home.title")}
					</span>
					<h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-5xl">
						{t("home.heroTitle")}
					</h1>
					<p className="max-w-xl text-sm text-muted-foreground md:text-base">
						{t("home.subtitle")}
					</p>
					{footer}
				</div>
				{/* The composer floats over the board in the canvas-specific frame. */}
				<AiCanvasComposerFrame>{children}</AiCanvasComposerFrame>
			</div>
		</section>
	)
}

export default memo(AiCanvasHero)
