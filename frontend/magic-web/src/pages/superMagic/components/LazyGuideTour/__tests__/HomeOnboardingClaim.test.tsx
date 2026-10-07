import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * What a finished run reports, and what it does *not*.
 *
 * The completion call is the only place the client says "this task is done", and the backend is the
 * only side that can say it — the points and the task's state are one verdict, and the API is
 * idempotent precisely so the two cannot come apart. So the rule these tests pin is narrow and
 * absolute: **the task is recorded as done only when the call succeeded.** A failure — a lost
 * connection, `9306` (the grant failed), `9307` (too many at once) — has to leave the row exactly as
 * it was, still offering "开始体验", because that is the only way the user can make the retry.
 *
 * The two tasks that must *never* be claimed at all are the other half of the rule: the AI-work task
 * is finished by a backend system event and answers `9303` to any client that asks, so a run of it
 * reports nothing and re-reads the list instead.
 */
const { translate } = vi.hoisted(() => ({ translate: (key: string) => key }))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		i18n: { language: "en_US" },
		t: translate,
	}),
}))

vi.mock("@/routes/hooks/useNavigate", () => ({ default: () => vi.fn() }))

vi.mock("@/stores/layout", () => ({
	sidebarStore: { collapsed: false, setCollapsed: vi.fn() },
}))

const { toasts, completeOnboardingTask, getOnboardingTasks } = vi.hoisted(() => ({
	toasts: [] as string[],
	completeOnboardingTask: vi.fn(),
	getOnboardingTasks: vi.fn(),
}))

/*
 * Only the two calls are replaced. Everything else the module exports — the codes, the helpers that
 * read a failed request apart — stays real, because that is what is under test here.
 */
vi.mock("@/apis/modules/onboarding", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/apis/modules/onboarding")>()
	return { ...actual, completeOnboardingTask, getOnboardingTasks }
})

vi.mock("@/components/base/MagicToaster/utils", () => ({
	default: {
		error: (options: { content: string }) => {
			toasts.push(options.content)
		},
		info: vi.fn(),
	},
}))

vi.mock("@/utils/pubsub", () => ({
	default: { publish: vi.fn(), subscribe: vi.fn() },
	PubSubEvents: { Set_Input_Message: "set-input-message" },
}))

vi.mock("@/pages/superMagic/utils/clawBrand", () => ({
	getClawBrandTranslationValues: () => ({}),
}))

const MAGIC_ID = "magic-guide-claim"
const WORKBENCH = "workbench"

const NEXT = "homeOnboarding.actions.next"
const FINISH = "homeOnboarding.actions.standaloneFinish"

const markers: HTMLElement[] = []

/** A region of the home page the workbench run highlights, as the page publishes it. */
function publishAnchor(anchorName: string) {
	const marker = document.createElement("div")
	marker.setAttribute("data-guide-anchor", anchorName)
	document.body.appendChild(marker)
	markers.push(marker)
}

/** A fresh manager and tour, so one test's run cannot decide what the next one starts from. */
async function loadTour() {
	vi.resetModules()
	const onboarding = await import("../GuideTourManager")
	const tour = await import("../HomeOnboardingTour")
	return { onboarding, tour }
}

/** The primary action is the last button of the popover, as the tour's footer lays it out. */
function primaryAction() {
	const buttons = within(screen.getByRole("dialog")).getAllByRole("button")
	return buttons[buttons.length - 1]
}

beforeEach(() => {
	vi.useFakeTimers()
	toasts.length = 0
	completeOnboardingTask.mockReset()
	getOnboardingTasks.mockReset()
	getOnboardingTasks.mockResolvedValue({ tasks: [] })
})

afterEach(() => {
	vi.useRealTimers()
	markers.splice(0).forEach((marker) => marker.remove())
})

describe("home onboarding: claiming a finished task's reward", () => {
	it("records the task as done only when the backend confirms the points", async () => {
		const { onboarding } = await loadTour()
		completeOnboardingTask.mockResolvedValue({ points: 50 })

		const result = await onboarding.claimHomeOnboardingReward(MAGIC_ID, WORKBENCH)

		// The URL carries the backend's own code, never the flow id this client names the task by.
		expect(completeOnboardingTask).toHaveBeenCalledWith("super_magic_intro")
		expect(result).toEqual({ ok: true, points: 50 })
		expect(onboarding.isHomeOnboardingCompleted(MAGIC_ID, WORKBENCH)).toBe(true)
	})

	it("leaves the task unfinished — and therefore enterable again — when the call fails", async () => {
		const { onboarding } = await loadTour()
		completeOnboardingTask.mockRejectedValue({ code: 9306, message: "发放失败" })

		const result = await onboarding.claimHomeOnboardingReward(MAGIC_ID, WORKBENCH)

		expect(result).toMatchObject({ ok: false, code: 9306, retryable: true })
		// The whole point: a row that still says "开始体验" is what lets the user walk the flow again
		// and have the grant retried. Marking it done here would leave a finished-looking task with
		// no points.
		expect(onboarding.isHomeOnboardingCompleted(MAGIC_ID, WORKBENCH)).toBe(false)
	})

	it("treats a request that never reached the backend as worth retrying", async () => {
		const { onboarding } = await loadTour()
		completeOnboardingTask.mockRejectedValue(new Error("Network Error"))

		const result = await onboarding.claimHomeOnboardingReward(MAGIC_ID, WORKBENCH)

		// No business code at all: the answer is "we do not know", and asking again is free.
		expect(result).toMatchObject({ ok: false, code: null, retryable: true })
		expect(onboarding.isHomeOnboardingCompleted(MAGIC_ID, WORKBENCH)).toBe(false)
	})

	it("does not invite a retry for a task that cannot be completed any more", async () => {
		const { onboarding } = await loadTour()
		completeOnboardingTask.mockRejectedValue({ code: 9305, message: "进度数据异常" })

		const result = await onboarding.claimHomeOnboardingReward(MAGIC_ID, WORKBENCH)

		// Broken server-side progress: repeating the call cannot fix it, and the copy says so
		// instead of asking the user to try again.
		expect(result).toMatchObject({ ok: false, code: 9305, retryable: false })
		expect(onboarding.homeOnboardingClaimFailureKey(9305)).toBe("homeOnboarding.claim.broken")
	})

	it("says nothing at all when the deployment stops offering the feature", async () => {
		const { onboarding } = await loadTour()
		completeOnboardingTask.mockRejectedValue({ code: 9301, message: "功能未开启" })

		const result = await onboarding.claimHomeOnboardingReward(MAGIC_ID, WORKBENCH)

		// A feature switch that went off is not an error to report — the surface disappears quietly.
		expect(result).toMatchObject({ ok: false, code: 9301, retryable: false })
		expect(onboarding.homeOnboardingClaimFailureKey(9301)).toBeNull()
	})

	it("never claims the AI-work task, which only a backend system event can finish", async () => {
		const { onboarding } = await loadTour()

		expect(onboarding.canManuallyCompleteHomeOnboardingTask("first-ai-work")).toBe(false)
		expect(onboarding.canManuallyCompleteHomeOnboardingTask(WORKBENCH)).toBe(true)
		// And the code the client would have to send is the backend's, not the flow id.
		expect(onboarding.HOME_ONBOARDING_TASK_CODE[WORKBENCH]).toBe("super_magic_intro")
		expect(onboarding.HOME_ONBOARDING_TASK_CODE["first-ai-work"]).toBe("first_ai_work")
	})
})

describe("home onboarding: what a run through to its last step reports", () => {
	it("claims the workbench's points, and marks it done once the backend agrees", async () => {
		const { onboarding, tour } = await loadTour()
		completeOnboardingTask.mockResolvedValue({ points: 50 })

		// The page has already done its part: all four home anchors are on screen, so every step
		// finds its target on the frame it opens and the walk is about the closing report.
		publishAnchor(onboarding.HomeOnboardingAnchor.WorkspaceSidebar)
		publishAnchor(onboarding.HomeOnboardingAnchor.WorkspaceList)
		publishAnchor(onboarding.HomeOnboardingAnchor.RoleSwitcher)
		publishAnchor(onboarding.HomeOnboardingAnchor.MessageComposer)

		onboarding.startHomeOnboarding(WORKBENCH)
		render(<tour.default page="home" userMagicId={MAGIC_ID} />)

		// Four steps: three plain advances and the closing one, which names the reward.
		for (let step = 0; step < 3; step += 1) {
			expect(primaryAction().textContent).toBe(NEXT)
			await act(async () => {
				fireEvent.click(primaryAction())
			})
		}
		expect(primaryAction().textContent).toBe(FINISH)

		await act(async () => {
			fireEvent.click(primaryAction())
		})

		expect(completeOnboardingTask).toHaveBeenCalledWith("super_magic_intro")
		expect(onboarding.isHomeOnboardingCompleted(MAGIC_ID, WORKBENCH)).toBe(true)
		expect(toasts).toEqual([])
	})

	it("leaves the task unfinished when the claim fails, so the card still offers it", async () => {
		const { onboarding, tour } = await loadTour()
		completeOnboardingTask.mockRejectedValue({ code: 9306, message: "发放失败" })

		publishAnchor(onboarding.HomeOnboardingAnchor.WorkspaceSidebar)
		publishAnchor(onboarding.HomeOnboardingAnchor.WorkspaceList)
		publishAnchor(onboarding.HomeOnboardingAnchor.RoleSwitcher)
		publishAnchor(onboarding.HomeOnboardingAnchor.MessageComposer)

		onboarding.startHomeOnboarding(WORKBENCH)
		render(<tour.default page="home" userMagicId={MAGIC_ID} />)

		for (let step = 0; step < 3; step += 1) {
			await act(async () => {
				fireEvent.click(primaryAction())
			})
		}
		await act(async () => {
			fireEvent.click(primaryAction())
		})

		// The run is over either way — the walk really did finish — but the account's state is not
		// this client's to write, so the row stays open and the error is spelled out.
		expect(onboarding.isHomeOnboardingCompleted(MAGIC_ID, WORKBENCH)).toBe(false)
		expect(toasts).toEqual(["homeOnboarding.claim.retry"])
	})
})
