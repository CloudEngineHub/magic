import { render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * The mask of the "prompt-ready" step — the one flow that has to leave part of the page reachable.
 *
 * That step frames the composer and the send button, and both of them are meant to be used: the
 * prefilled prompt is an ordinary editable document and sends itself from that button. So the
 * overlay cannot take the pointer wholesale the way the other steps' overlays do — its mask is
 * drawn by an SVG, which is a picture and not a hit-test — and for a while the dimmed page
 * underneath answered the mouse as if no tour were running at all.
 *
 * What this file pins is the cover that closes that gap without closing the two cut-outs: every
 * point of the window is either inside one of them or inside a part of the cover, nothing of the
 * cover lies over either of them, and the row between the composer and the toolbar it sits on —
 * the row a cover built from the union of the two boxes would leave open — is covered as well.
 *
 * One `t` for the whole file, as the other tour specs keep one: the tour memoises its callbacks on
 * the translation function, and a fresh one per render would send the anchor-waiting effect into a
 * loop.
 */
const { translate } = vi.hoisted(() => ({ translate: (key: string) => key }))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ i18n: { language: "en_US" }, t: translate }),
}))

vi.mock("@/routes/hooks/useNavigate", () => ({ default: () => vi.fn() }))

vi.mock("@/services/analytics", () => ({ analyticsService: { report: vi.fn() } }))

vi.mock("@/stores/layout", () => ({
	sidebarStore: { collapsed: false, setCollapsed: vi.fn() },
}))

vi.mock("@/components/base/MagicToaster/utils", () => ({
	default: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
}))

vi.mock("@/utils/pubsub", () => ({
	default: { publish: vi.fn(), subscribe: vi.fn() },
	PubSubEvents: { Set_Input_Message: "set-input-message" },
}))

vi.mock("@/pages/superMagic/utils/clawBrand", () => ({
	getClawBrandTranslationValues: () => ({}),
}))

const MAGIC_ID = "magic-guide-send-cover"

const SEND_TITLE = "homeOnboarding.featured.send.title"

/**
 * The step the flow would already be on, so the mount lands straight in it instead of walking the
 * picker first.
 */
const PROMPT_READY = "prompt-ready"

interface Box {
	left: number
	top: number
	width: number
	height: number
}

/** The composer's editor: the cut-out the user types in. */
const COMPOSER: Box = { left: 60, top: 300, width: 820, height: 100 }

/** The send button in the toolbar below it: the cut-out the step actually asks for. */
const SEND: Box = { left: 950, top: 420, width: 44, height: 44 }

/** How far apart the sampled points are. Fine enough that no box of these sizes can fall between. */
const SAMPLE_STEP = 8

const markers: HTMLElement[] = []

/** A region of the page the tour measures, handed its box — jsdom lays nothing out. */
function publishAnchor(anchorName: string, box: Box) {
	const marker = document.createElement("div")
	marker.setAttribute("data-guide-anchor", anchorName)
	marker.getBoundingClientRect = () =>
		({
			...box,
			right: box.left + box.width,
			bottom: box.top + box.height,
			x: box.left,
			y: box.top,
			toJSON: () => box,
		}) as DOMRect
	document.body.appendChild(marker)
	markers.push(marker)
}

/**
 * The parts of the cover, read off the overlay rather than out of the component's state: what the
 * page sees is these boxes and where they were put, and that is what has to hold.
 *
 * They are the overlay's only `pointer-events-auto` divs — the card is a `section` and everything
 * else in this step is explicitly `pointer-events-none`, being drawn rather than meant to be used.
 */
function coverBoxes(dialog: HTMLElement): Box[] {
	return Array.from(dialog.querySelectorAll<HTMLElement>("div.pointer-events-auto")).map(
		(node) => ({
			left: Number.parseFloat(node.style.left),
			top: Number.parseFloat(node.style.top),
			width: Number.parseFloat(node.style.width),
			height: Number.parseFloat(node.style.height),
		}),
	)
}

/** Whether a point falls in a box, edges on the low side and off on the high one. */
function holdsPoint(box: Box, x: number, y: number) {
	return x >= box.left && x < box.left + box.width && y >= box.top && y < box.top + box.height
}

/** Whether two boxes share any area at all — touching along an edge is not sharing one. */
function overlaps(box: Box, other: Box) {
	return (
		box.left < other.left + other.width &&
		other.left < box.left + box.width &&
		box.top < other.top + other.height &&
		other.top < box.top + box.height
	)
}

/** The centre of a box, which is inside it whatever the surrounding layout does. */
function centre(box: Box) {
	return { x: box.left + box.width / 2, y: box.top + box.height / 2 }
}

/**
 * Puts the run on the prompt-ready step. The benefits-card entry drops the stored flow on its way
 * in, so the step is written after it — which is also what a reload mid-flow finds.
 */
async function startPromptReadyRun() {
	vi.resetModules()
	const onboarding = await import("../GuideTourManager")
	const tour = await import("../HomeOnboardingTour")
	onboarding.startHomeOnboarding("first-ai-work", MAGIC_ID)
	onboarding.setHomeOnboardingFlow(PROMPT_READY)
	return { tour }
}

describe("home onboarding: the mask of the prompt-ready step stops the page under it", () => {
	beforeEach(() => {
		vi.useFakeTimers()
		window.localStorage.clear()
	})

	afterEach(() => {
		vi.useRealTimers()
		markers.splice(0).forEach((marker) => marker.remove())
	})

	it("covers everything the two cut-outs do not, and nothing they do", async () => {
		const { tour } = await startPromptReadyRun()
		publishAnchor("message-editor-content", COMPOSER)
		publishAnchor("message-editor-send-button", SEND)

		render(<tour.default page="home" userMagicId={MAGIC_ID} />)

		const dialog = screen.getByRole("dialog")
		// The step itself, rather than the overlay it waits behind before its anchors are measured.
		expect(within(dialog).getByText(SEND_TITLE)).toBeInTheDocument()

		const cover = coverBoxes(dialog)
		expect(cover.length).toBeGreaterThan(0)

		// Nothing of the cover lies over either cut-out: the composer still takes the caret and the
		// send button still takes the click that ends the step.
		expect(cover.filter((box) => overlaps(box, COMPOSER))).toEqual([])
		expect(cover.filter((box) => overlaps(box, SEND))).toEqual([])

		/*
		 * And the rest of the window is covered — not merely mostly covered, which is what lets a
		 * click through to the dimmed page on the one pixel a strip was measured wrong by. Sampled
		 * rather than proved, but sampled over the whole window at a step smaller than the narrowest
		 * strip any layout of these two boxes can leave.
		 */
		const reachable: Array<{ x: number; y: number }> = []
		for (let y = 0; y < window.innerHeight; y += SAMPLE_STEP) {
			for (let x = 0; x < window.innerWidth; x += SAMPLE_STEP) {
				const inCutOut = holdsPoint(COMPOSER, x, y) || holdsPoint(SEND, x, y)
				if (inCutOut || cover.some((box) => holdsPoint(box, x, y))) continue
				reachable.push({ x, y })
			}
		}
		expect(reachable).toEqual([])
	})

	it("covers the toolbar row between the composer and the send button", async () => {
		const { tour } = await startPromptReadyRun()
		publishAnchor("message-editor-content", COMPOSER)
		publishAnchor("message-editor-send-button", SEND)

		render(<tour.default page="home" userMagicId={MAGIC_ID} />)

		const cover = coverBoxes(screen.getByRole("dialog"))

		/*
		 * The composer's editor and the send button are the top and the bottom of one card, and the
		 * toolbar between them holds the model picker and the attachment entry. A cover built from
		 * the union of the two boxes would leave that whole row open, which is the difference this
		 * case is here to catch.
		 */
		const x = COMPOSER.left + 140
		const y = COMPOSER.top + COMPOSER.height + 10
		expect(holdsPoint(COMPOSER, x, y) || holdsPoint(SEND, x, y)).toBe(false)
		expect(cover.some((box) => holdsPoint(box, x, y))).toBe(true)
	})

	it("leaves only the send button reachable when the page has no editor to cut out", async () => {
		const { tour } = await startPromptReadyRun()
		// Only the button the step names is on this page; the composer is not.
		publishAnchor("message-editor-send-button", SEND)

		render(<tour.default page="home" userMagicId={MAGIC_ID} />)

		const cover = coverBoxes(screen.getByRole("dialog"))

		expect(cover.filter((box) => overlaps(box, SEND))).toEqual([])

		// Where the composer would have been, the page is now unreachable like the rest of it.
		const { x, y } = centre(COMPOSER)
		expect(cover.some((box) => holdsPoint(box, x, y))).toBe(true)
	})
})
