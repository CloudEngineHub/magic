import { act, fireEvent, render, screen } from "@testing-library/react"
import fs from "node:fs"
import path from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { analyticsReport } = vi.hoisted(() => ({ analyticsReport: vi.fn() }))

vi.mock("@/services/analytics", () => ({ analyticsService: { report: analyticsReport } }))

/**
 * The congratulation a new account is shown the first time one of its topics finishes.
 *
 * Four things decide whether it opens, and each has a group below. The account has to still be new,
 * which is the backend's list rather than anything this client remembers. The execution that ended
 * has to have ended *well*. No guided run may be on screen, because a run owns the window while it
 * is up. And this browser must not have congratulated this account already — the one-shot rule the
 * delivered-file tour uses as well, and the reason storage is cleared between tests rather than
 * between files.
 *
 * The event is handed in rather than raised: the store's own map has its own tests, and what is
 * under test here is what this dialog *does* with an execution ending. The subscription is captured
 * from a stand-in store, which also lets the scope be asserted — a dialog for a topic is only worth
 * anything if it is listening to the topic it is on.
 *
 * The points are the last group's business: they are the backend's figure for the reward row, so the
 * same test would fail if a `100` were written into the component.
 *
 * The namespace the dialog asks for is recorded rather than assumed, because a namespace is a *file*
 * and picking the wrong one is silent: `t` answers with the key it was given, so every word on
 * screen turns into `homeOnboarding.firstWork.title` and nothing else complains.
 */
const {
	translate,
	MAGIC_ID,
	TOPIC_ID,
	CHAT_TOPIC_ID,
	routeParams,
	topicStoreHolder,
	navigateToSuperHome,
	namespaces,
} = vi.hoisted(() => ({
	translate: (key: string, values?: Record<string, unknown>) =>
		values === undefined ? key : `${key}:${JSON.stringify(values)}`,
	MAGIC_ID: "magic-guide-first-work",
	TOPIC_ID: "topic-1",
	CHAT_TOPIC_ID: "chat-topic-1",
	routeParams: {} as Record<string, string>,
	/**
	 * The page's topic, as the dialog sees it. Built by the store's own factory below rather than
	 * here, because a stand-in only counts as a store if it comes from the same `mobx` instance the
	 * dialog's `observer` reads — and the module registry is reset for every test.
	 */
	topicStoreHolder: {} as { current: PageTopicStore },
	navigateToSuperHome: vi.fn(),
	/** Every namespace the dialog has asked for, in order. */
	namespaces: [] as string[],
}))

vi.mock("react-i18next", () => ({
	useTranslation: (namespace: string) => {
		namespaces.push(namespace)
		return {
			i18n: { language: "en_US" },
			t: translate,
		}
	},
}))

vi.mock("react-router", () => ({ useParams: () => routeParams }))

vi.mock("@/layouts/BaseLayout/components/MagicSidebar/hooks/useNavigateToSuperHome", () => ({
	useNavigateToSuperHome: () => ({
		superRouteUrl: "",
		navigateToSuperHome,
		handleNavigateToSuperHome: vi.fn(),
	}),
}))

/**
 * The store's event bus, as the dialog sees it: a subscription it can be handed events through. The
 * scope is kept alongside the callback because "which topic" is half of what this dialog claims.
 */
const { subscriptions } = vi.hoisted(() => ({
	subscriptions: [] as Array<{
		type: string
		callback: (event: { payload: { status: string } }) => void
		options?: { scope?: { topicId?: string } }
	}>,
}))

vi.mock("@/pages/superMagic/stores", () => ({
	superMagicStore: {
		subscribe: (
			type: string,
			callback: (event: { payload: { status: string } }) => void,
			options?: { scope?: { topicId?: string } },
		) => {
			const subscription = { type, callback, options }
			subscriptions.push(subscription)
			return () => {
				const index = subscriptions.indexOf(subscription)
				if (index !== -1) subscriptions.splice(index, 1)
			}
		},
	},
}))

/**
 * The slice of the page's store this dialog reads, plus the one way a test walks the page along.
 *
 * It is shaped after the real `TopicStore` because the shape is the point: `selectedTopic` is
 * observable, the page moves by writing it, and that write is what re-renders this dialog — an
 * `observer` — which is what re-runs the effect that owns the subscription. A plain object would
 * leave that path untested, since `observer` is itself a `React.memo` and an identical re-render is
 * skipped rather than run.
 *
 * The write goes through a method for the real store's reason too: `makeAutoObservable` turns
 * methods into actions, and MobX insists that an observed value is written from inside one.
 */
interface PageTopicStore {
	selectedTopic: { chat_topic_id: string } | null
	/** The page opening a topic, which is how the dialog comes to be scoped to a new one. */
	openTopic(chatTopicId: string): void
}

vi.mock("@/pages/superMagic/stores/core", async () => {
	const { makeAutoObservable } = await import("mobx")
	const store: PageTopicStore = {
		selectedTopic: null,
		openTopic(chatTopicId: string) {
			store.selectedTopic = { chat_topic_id: chatTopicId }
		},
	}
	topicStoreHolder.current = makeAutoObservable(store)
	return { topicStore: topicStoreHolder.current }
})

const { getOnboardingTasks, completeOnboardingTask } = vi.hoisted(() => ({
	getOnboardingTasks: vi.fn(),
	completeOnboardingTask: vi.fn(),
}))

vi.mock("@/apis/modules/onboarding", () => ({ getOnboardingTasks, completeOnboardingTask }))

const TITLE = "homeOnboarding.firstWork.title"
const CARD_TITLE = "homeOnboarding.firstWork.card.title"
const CARD_DESCRIPTION = "homeOnboarding.firstWork.card.description"
const START = "homeOnboarding.firstWork.actions.start"
const LATER = "homeOnboarding.firstWork.actions.later"
const POINTS = "homeOnboarding.firstWork.points"
const CLOSE = "homeOnboarding.firstWork.close"

/** Every key the dialog draws, so that nothing it shows can be left out of the check below. */
const DRAWN_KEYS = [TITLE, CARD_TITLE, CARD_DESCRIPTION, START, LATER, POINTS, CLOSE]

/** One reward row as the backend sends it. */
function task(code: string, points: number) {
	return {
		code,
		points,
		validity_days: 7,
		status: "COMPLETED",
		reward_status: "GRANTED",
		completed_at: "2026-10-08T09:00:00Z",
		reward_granted_at: "2026-10-08T09:00:00Z",
		expires_at: "2026-12-31T00:00:00Z",
	}
}

/** An account the backend still counts as new, with the AI-work row it has just finished. */
function backendStillListsTasks(points = 100, code = "first_ai_work") {
	getOnboardingTasks.mockResolvedValue({ tasks: [task(code, points)] })
}

/**
 * Fresh modules for every test. The reward list and the "a run is up" flag are module state, and a
 * test that arranged one of them must not decide what the next one starts from.
 */
async function loadDialog() {
	vi.resetModules()
	const onboarding = await import("../GuideTourManager")
	const dialog = await import("../HomeOnboardingFirstWorkCongrats")
	return { onboarding, Dialog: dialog.default }
}

/**
 * Mounts the dialog on the project page, with the topic the route named already selected. What the
 * backend says and what the run is doing are arranged before the first render, since the dialog reads
 * both when the event arrives rather than watching them.
 */
async function mountDialog(arrange?: (modules: Awaited<ReturnType<typeof loadDialog>>) => void) {
	const modules = await loadDialog()
	// The page has opened the topic its route names; that is the topic the dialog scopes to.
	topicStoreHolder.current.openTopic(CHAT_TOPIC_ID)
	arrange?.(modules)
	const rendered = render(<modules.Dialog userMagicId={MAGIC_ID} />)
	await act(async () => {
		await Promise.resolve()
	})
	return { ...modules, ...rendered }
}

/** The backend's list lands, which is what "this account is still new" is read from. */
async function listArrives(onboarding: Awaited<ReturnType<typeof loadDialog>>["onboarding"]) {
	await act(async () => {
		await onboarding.ensureHomeOnboardingRewardList(MAGIC_ID)
	})
}

/** The topic the page is on has finished running, as the store would announce it. */
function topicFinishes(status: "finished" | "error" = "finished") {
	act(() => {
		for (const subscription of [...subscriptions]) {
			subscription.callback({ payload: { status } })
		}
	})
}

function congratsDialog() {
	return screen.queryByRole("dialog", { name: TITLE })
}

beforeEach(() => {
	subscriptions.splice(0)
	namespaces.splice(0)
	routeParams.projectId = "project-1"
	routeParams.topicId = TOPIC_ID
	getOnboardingTasks.mockReset()
	completeOnboardingTask.mockReset()
	navigateToSuperHome.mockReset()
	analyticsReport.mockReset()
	// The one-shot answer outlives a page load, which is the point of it, so it is cleared by hand.
	window.localStorage.clear()
})

describe("what the dialog waits for before it opens", () => {
	it("says nothing until the backend's list has said the account is still new", async () => {
		const mounted = await mountDialog()

		topicFinishes()

		expect(congratsDialog()).toBeNull()
		// Nothing was shown, so nothing was spent: the moment is still owed.
		expect(mounted.onboarding.isHomeOnboardingFirstWorkCongratsSpent(MAGIC_ID)).toBe(false)
	})

	it("opens once the list is in, and reads both halves of the card off it", async () => {
		const mounted = await mountDialog(() => backendStillListsTasks(100))
		await listArrives(mounted.onboarding)

		topicFinishes()

		expect(congratsDialog()).not.toBeNull()
		expect(screen.getByText(TITLE)).toBeTruthy()
		expect(screen.getByText(CARD_TITLE)).toBeTruthy()
		expect(screen.getByText(CARD_DESCRIPTION)).toBeTruthy()
		expect(screen.getByText(START)).toBeTruthy()
		expect(screen.getByText(LATER)).toBeTruthy()
		expect(mounted.onboarding.isHomeOnboardingFirstWorkCongratsSpent(MAGIC_ID)).toBe(true)
		expect(analyticsReport).toHaveBeenCalledWith("onboarding_reward_popup_exposure", {
			pointsAmount: 100,
		})
	})

	it("takes the points from the backend's row rather than a number of its own", async () => {
		const mounted = await mountDialog(() => backendStillListsTasks(250))
		await listArrives(mounted.onboarding)

		topicFinishes()

		expect(screen.getByText(`${pointsLabel(250)}`)).toBeTruthy()
	})

	it("leaves the badge off when the list has not carried that row", async () => {
		const mounted = await mountDialog(() => backendStillListsTasks(100, "super_magic_intro"))
		await listArrives(mounted.onboarding)

		topicFinishes()

		expect(congratsDialog()).not.toBeNull()
		expect(screen.queryByText(pointsLabel(100))).toBeNull()
	})

	it("ignores an execution that ended in anything but success", async () => {
		const mounted = await mountDialog(() => backendStillListsTasks())
		await listArrives(mounted.onboarding)

		topicFinishes("error")

		expect(congratsDialog()).toBeNull()
		expect(mounted.onboarding.isHomeOnboardingFirstWorkCongratsSpent(MAGIC_ID)).toBe(false)
	})

	it("leaves a guided run that owns the screen alone, and keeps the moment for later", async () => {
		const mounted = await mountDialog(() => backendStillListsTasks())
		await listArrives(mounted.onboarding)
		mounted.onboarding.setHomeOnboardingRunActive(true)

		topicFinishes()

		expect(congratsDialog()).toBeNull()
		expect(mounted.onboarding.isHomeOnboardingFirstWorkCongratsSpent(MAGIC_ID)).toBe(false)

		// The run is over: the next execution ending is this dialog's to take.
		mounted.onboarding.setHomeOnboardingRunActive(false)
		topicFinishes()

		expect(congratsDialog()).not.toBeNull()
		expect(mounted.onboarding.isHomeOnboardingFirstWorkCongratsSpent(MAGIC_ID)).toBe(true)
	})
})

describe("which topic it is listening to", () => {
	it("subscribes to the execution the page's own topic ends, and to nothing else", async () => {
		await mountDialog()

		expect(subscriptions).toHaveLength(1)
		expect(subscriptions[0].type).toBe("topic.execution.ended")
		expect(subscriptions[0].options?.scope).toEqual({ topicId: CHAT_TOPIC_ID })
	})

	it("subscribes to nothing off the project page", async () => {
		routeParams.projectId = undefined as unknown as string

		await mountDialog()

		expect(subscriptions).toHaveLength(0)
	})

	it("follows the page to the next topic", async () => {
		const mounted = await mountDialog(() => backendStillListsTasks())
		await listArrives(mounted.onboarding)
		expect(subscriptions).toHaveLength(1)

		// The page walks to another topic. Nothing here re-renders the dialog by hand: the store is
		// the page's own state, and following it is the dialog's job.
		await act(async () => {
			topicStoreHolder.current.openTopic("chat-topic-2")
		})

		expect(subscriptions).toHaveLength(1)
		expect(subscriptions[0].options?.scope).toEqual({ topicId: "chat-topic-2" })
	})
})

describe("the one-shot rule", () => {
	it("congratulates once per account per browser, and not again on the next execution", async () => {
		const first = await mountDialog(() => backendStillListsTasks())
		await listArrives(first.onboarding)
		topicFinishes()
		expect(congratsDialog()).not.toBeNull()

		// Left through the second exit, which is a way of being shown the dialog rather than a way
		// of escaping it.
		await act(async () => {
			fireEvent.click(screen.getByText(LATER))
		})
		expect(congratsDialog()).toBeNull()
		topicFinishes()
		expect(congratsDialog()).toBeNull()
		first.unmount()

		// A fresh page, the same browser and the same account: the answer came from storage, so it
		// is still spent.
		const second = await mountDialog(() => backendStillListsTasks())
		await listArrives(second.onboarding)
		topicFinishes()

		expect(congratsDialog()).toBeNull()
	})

	it("keeps one account's flag to itself, so the next account is still owed its own", async () => {
		const mounted = await mountDialog(() => backendStillListsTasks())
		await listArrives(mounted.onboarding)
		topicFinishes()

		expect(mounted.onboarding.isHomeOnboardingFirstWorkCongratsSpent(MAGIC_ID)).toBe(true)
		expect(mounted.onboarding.isHomeOnboardingFirstWorkCongratsSpent("another-account")).toBe(
			false,
		)
	})
})

describe("the two exits", () => {
	it("closes in place, and does not claim the task on the way out", async () => {
		const mounted = await mountDialog(() => backendStillListsTasks())
		await listArrives(mounted.onboarding)
		topicFinishes()

		await act(async () => {
			fireEvent.click(screen.getByText(LATER))
		})

		expect(congratsDialog()).toBeNull()
		expect(navigateToSuperHome).not.toHaveBeenCalled()
		expect(analyticsReport).toHaveBeenCalledWith("onboarding_reward_popup_click", {
			action: "later",
		})
		// The backend finishes this task by itself; the client only ever reads the row.
		expect(completeOnboardingTask).not.toHaveBeenCalled()
	})

	it("leaves for the workspace from the primary action", async () => {
		const mounted = await mountDialog(() => backendStillListsTasks())
		await listArrives(mounted.onboarding)
		topicFinishes()

		await act(async () => {
			fireEvent.click(screen.getByText(START))
		})

		expect(navigateToSuperHome).toHaveBeenCalledTimes(1)
		expect(congratsDialog()).toBeNull()
		expect(analyticsReport).toHaveBeenCalledWith("onboarding_reward_popup_click", {
			action: "start_new_task",
		})
	})

	it("reports the close control separately", async () => {
		const mounted = await mountDialog(() => backendStillListsTasks())
		await listArrives(mounted.onboarding)
		topicFinishes()

		await act(async () => {
			fireEvent.click(screen.getByLabelText(CLOSE))
		})

		expect(congratsDialog()).toBeNull()
		expect(analyticsReport).toHaveBeenCalledWith("onboarding_reward_popup_click", {
			action: "close",
		})
	})
})

/**
 * A namespace is a file, and the wrong one is silent rather than empty: `t` hands back the key it
 * was given, so the dialog draws `homeOnboarding.firstWork.title` and nothing anywhere complains.
 * The namespace is therefore taken from the dialog itself and then used to open the file, so the two
 * can only agree by being the same thing — which is how the tour's own file was found to be
 * `super/guideTour` rather than the `super` the first draft asked for.
 */
describe("where its words come from", () => {
	it("takes every word from the file its namespace names", async () => {
		await mountDialog()

		expect(namespaces).toEqual(["super/guideTour"])

		const problems: string[] = []

		for (const locale of ["zh_CN", "en_US"]) {
			const filePath = path.resolve(
				process.cwd(),
				`src/assets/locales/${locale}/${namespaces[0]}.json`,
			)
			const words = JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown

			for (const key of DRAWN_KEYS) {
				if (typeof readKey(words, key) !== "string")
					problems.push(`${locale} has no ${key}`)
			}

			// The figure is filled in at render time, so a translation that drops the placeholder
			// would leave a bare "+ 积分" — readable, and wrong in a way only this check sees.
			if (!String(readKey(words, POINTS)).includes("{{points}}")) {
				problems.push(`${locale} dropped the placeholder from ${POINTS}`)
			}
		}

		expect(problems).toEqual([])
	})
})

/** Walks a dot path through a locale, the way `t` does. */
function readKey(locale: unknown, key: string): unknown {
	return key.split(".").reduce<unknown>((node, segment) => {
		if (node == null || typeof node !== "object") return undefined
		return (node as Record<string, unknown>)[segment]
	}, locale)
}

function pointsLabel(points: number) {
	return `homeOnboarding.firstWork.points:${JSON.stringify({ points })}`
}
