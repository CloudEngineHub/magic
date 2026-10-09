import { act, fireEvent, render, screen } from "@testing-library/react"
import fs from "node:fs"
import path from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { analyticsReport } = vi.hoisted(() => ({ analyticsReport: vi.fn() }))

vi.mock("@/services/analytics", () => ({ analyticsService: { report: analyticsReport } }))

/**
 * The congratulation a new account is shown the first time one of its topics finishes.
 *
 * **What it opens on, since that is what this file was rebuilt around.** Not an event: the
 * conversation the page is on, read out of the store. The last assistant message of a topic carries
 * the topic's own execution status, so a tail that has come to rest on `finished` is the app's word
 * for the work being done — and unlike the store's end-of-execution notification, that status is
 * still there to be read by a page that opens after it landed, or by one whose topic arrived with
 * its ending already in it. The dialog used to listen for the notification, and the page it was
 * written for never received one: it opened on the project page of a topic that had already
 * finished, and nothing ever told it so.
 *
 * Every case below therefore drives the page's conversation rather than handing the dialog an event,
 * and the first of them is the one that was broken: a conversation that ended before the dialog was
 * even mounted. The reaction is also what makes the assertions here worth anything, which is why the
 * store below is a real `makeAutoObservable` one: a reaction over a plain object never fires, and a
 * stand-in that cannot change under the dialog would pass every case for the wrong reason.
 *
 * The three answers the dialog needs on top of that each have a group: the account has to still be
 * new, which is the backend's list rather than anything this client remembers; no guided run may own
 * the screen; and this browser must not have congratulated this account already — the one-shot rule
 * the delivered-file tour uses as well, and the reason storage is cleared between tests rather than
 * between files.
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
	messageListHolder,
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
	/** The page's conversation, which is the half of the page this dialog is watching. */
	messageListHolder: {} as { current: PageMessageListStore },
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
 * The page's message list, as the dialog reads it: the canonical list per topic, and the node behind
 * each message — the field the store's own merge carries the execution status on, with the item's
 * own `superStatus` as the fallback the dialog keeps for conversations that arrive without one.
 *
 * Writes go through methods because `makeAutoObservable` turns them into actions, and MobX insists
 * that an observed value is written from inside one.
 */
interface PageMessageListStore {
	messages: Map<string, unknown[]>
	messageMap: Map<string, { status?: string }>
	/** Empties the page. A store a test has written to is still written in the next one. */
	reset(): void
	/** The page's conversation for a topic arriving, which is what the store commits. */
	commit(chatTopicId: string, messages: unknown[]): void
	/** The status the topic's execution came to rest on, on the node behind its last message. */
	endAt(superMessageId: string, status: string): void
	getMessageNode(superMessageId?: string): { status?: string } | undefined
}

vi.mock("@/pages/superMagic/stores", async () => {
	const { makeAutoObservable } = await import("mobx")
	const store: PageMessageListStore = {
		messages: new Map<string, unknown[]>(),
		messageMap: new Map<string, { status?: string }>(),
		reset() {
			store.messages.clear()
			store.messageMap.clear()
		},
		commit(chatTopicId, messages) {
			store.messages.set(chatTopicId, messages)
		},
		endAt(superMessageId, status) {
			store.messageMap.set(superMessageId, { status })
		},
		getMessageNode(superMessageId?: string) {
			return store.messageMap.get(superMessageId || "")
		},
	}
	messageListHolder.current = makeAutoObservable(store)
	return { superMagicStore: messageListHolder.current }
})

/**
 * The slice of the page's store this dialog reads, plus the one way a test walks the page along.
 *
 * It is shaped after the real `TopicStore` because the shape is the point: `selectedTopic` is
 * observable, the page moves by writing it, and that write is what re-renders this dialog — an
 * `observer` — which is what re-runs the effect that owns the watch. A plain object would leave that
 * path untested, since `observer` is itself a `React.memo` and an identical re-render is skipped
 * rather than run.
 */
interface PageTopicStore {
	selectedTopic: { chat_topic_id: string } | null
	/** The page opening a topic, which is how the dialog comes to be watching a new one. */
	openTopic(chatTopicId: string): void
	/** The page leaving its topic, which is how every test starts. */
	closeTopic(): void
}

vi.mock("@/pages/superMagic/stores/core", async () => {
	const { makeAutoObservable } = await import("mobx")
	const store: PageTopicStore = {
		selectedTopic: null,
		openTopic(chatTopicId: string) {
			store.selectedTopic = { chat_topic_id: chatTopicId }
		},
		closeTopic() {
			store.selectedTopic = null
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

/** The user's own message, which carries no execution status of its own. */
function userMessage() {
	return { role: "user", app_message_id: "app-user-1", status: "read" }
}

/** The assistant's message, whose status is the topic's rather than its own. */
function assistantMessage(superMessageId: string, superStatus: string) {
	return { role: "assistant", super_message_id: superMessageId, superStatus }
}

/**
 * The page's conversation for a topic arriving, ending on an assistant message whose execution came
 * to rest on `status`. Both halves of what the dialog reads are written — the list, and the node
 * behind the last message — because the real store writes both.
 *
 * The node's id is derived from the topic, since nodes are keyed by their own id in a map that spans
 * the workspace, exactly as the real store keeps them: two topics made to share one node would have
 * the ending of either read as the ending of both.
 *
 * `node: false` leaves the node out, which is the conversation the dialog's fallback exists for.
 */
function conversationEndsAt(status: string, { chatTopicId = CHAT_TOPIC_ID, node = true } = {}) {
	const superMessageId = `super-${chatTopicId}`
	act(() => {
		messageListHolder.current.commit(chatTopicId, [
			userMessage(),
			assistantMessage(superMessageId, status),
		])
		if (node) messageListHolder.current.endAt(superMessageId, status)
	})
}

/**
 * Fresh modules for every test. The reward list and the "a run is up" flag are module state, and a
 * test that arranged one of them must not decide what the next one starts from.
 *
 * The page's stores are the exception, and the reason `beforeEach` empties them by hand: the mock is
 * not re-evaluated along with the modules under test, so a conversation a test committed is still
 * committed in the next one — with a node whose status wins over the one the next test wrote.
 */
async function loadDialog() {
	vi.resetModules()
	const onboarding = await import("../GuideTourManager")
	const dialog = await import("../HomeOnboardingFirstWorkCongrats")
	return { onboarding, Dialog: dialog.default }
}

/**
 * Mounts the dialog on the project page, with the topic the route named already selected.
 *
 * `arrange` runs after the page's stores exist but *before* the first render, which is what lets a
 * case set up a page the dialog has to make up its mind about on sight: a topic that finished before
 * anybody mounted anything.
 */
async function mountDialog(
	arrange?: (modules: Awaited<ReturnType<typeof loadDialog>>) => void | Promise<void>,
) {
	const modules = await loadDialog()
	// The page has opened the topic its route names; that is the topic the dialog watches.
	topicStoreHolder.current.openTopic(CHAT_TOPIC_ID)
	await arrange?.(modules)
	const rendered = render(<modules.Dialog userMagicId={MAGIC_ID} />)
	await act(async () => {
		await Promise.resolve()
	})
	return { ...modules, ...rendered }
}

/** The backend's list landing, which is what "this account is still new" is read from. */
async function listArrives(onboarding: Awaited<ReturnType<typeof loadDialog>>["onboarding"]) {
	await act(async () => {
		await onboarding.ensureHomeOnboardingRewardList(MAGIC_ID)
	})
}

/**
 * A page that is ready in every other way, with the conversation in `status`. Every case starts from
 * one of these: the subject is what the dialog does about the conversation, not what it does about
 * the account or the run.
 */
async function mountWithConversationEndingAt(status: string, node = true) {
	const mounted = await mountDialog(async ({ onboarding }) => {
		backendStillListsTasks()
		conversationEndsAt(status, { node })
		await onboarding.ensureHomeOnboardingRewardList(MAGIC_ID)
	})
	return mounted
}

function congratsDialog() {
	return screen.queryByRole("dialog", { name: TITLE })
}

beforeEach(() => {
	namespaces.splice(0)
	routeParams.projectId = "project-1"
	routeParams.topicId = TOPIC_ID
	getOnboardingTasks.mockReset()
	completeOnboardingTask.mockReset()
	navigateToSuperHome.mockReset()
	analyticsReport.mockReset()
	// An empty page in both stores: see `loadDialog`.
	messageListHolder.current?.reset()
	topicStoreHolder.current?.closeTopic()
	// The one-shot answer outlives a page load, which is the point of it, so it is cleared by hand.
	window.localStorage.clear()
})

describe("what the dialog waits for before it opens", () => {
	it("opens for a conversation that had already ended when the page got here", async () => {
		/*
		 * The case the dialog used to lose. Everything is in place before the first render: the topic
		 * finished, the account is new per the backend, nothing is on screen. Nobody will ever
		 * announce that ending — it landed before this page existed — and the dialog has to find it
		 * by looking.
		 */
		const mounted = await mountWithConversationEndingAt("finished")

		expect(congratsDialog()).not.toBeNull()
		expect(mounted.onboarding.isHomeOnboardingFirstWorkCongratsSpent(MAGIC_ID)).toBe(true)
		expect(analyticsReport).toHaveBeenCalledWith("onboarding_reward_popup_exposure", {
			pointsAmount: 100,
		})
	})

	it("opens when the conversation ends while the page is up", async () => {
		const mounted = await mountWithConversationEndingAt("running")
		expect(congratsDialog()).toBeNull()

		conversationEndsAt("finished")

		expect(congratsDialog()).not.toBeNull()
		expect(screen.getByText(TITLE)).toBeTruthy()
		expect(screen.getByText(CARD_TITLE)).toBeTruthy()
		expect(screen.getByText(CARD_DESCRIPTION)).toBeTruthy()
		expect(screen.getByText(START)).toBeTruthy()
		expect(screen.getByText(LATER)).toBeTruthy()
		expect(mounted.onboarding.isHomeOnboardingFirstWorkCongratsSpent(MAGIC_ID)).toBe(true)
	})

	it("says nothing until the backend's list has said the account is still new", async () => {
		const mounted = await mountDialog(() => {
			backendStillListsTasks()
			conversationEndsAt("finished")
		})
		expect(congratsDialog()).toBeNull()
		// Nothing was shown, so nothing was spent: the moment is still owed.
		expect(mounted.onboarding.isHomeOnboardingFirstWorkCongratsSpent(MAGIC_ID)).toBe(false)

		await listArrives(mounted.onboarding)

		expect(congratsDialog()).not.toBeNull()
	})

	it("takes the points from the backend's row rather than a number of its own", async () => {
		await mountDialog(async ({ onboarding }) => {
			backendStillListsTasks(250)
			await onboarding.ensureHomeOnboardingRewardList(MAGIC_ID)
		})

		conversationEndsAt("finished")

		expect(screen.getByText(`${pointsLabel(250)}`)).toBeTruthy()
	})

	it("leaves the badge off when the list has not carried that row", async () => {
		const mounted = await mountDialog(async ({ onboarding }) => {
			backendStillListsTasks(100, "super_magic_intro")
			await onboarding.ensureHomeOnboardingRewardList(MAGIC_ID)
		})

		conversationEndsAt("finished")

		expect(congratsDialog()).not.toBeNull()
		expect(screen.queryByText(pointsLabel(100))).toBeNull()
		expect(mounted.onboarding.isHomeOnboardingFirstWorkCongratsSpent(MAGIC_ID)).toBe(true)
	})

	it("ignores a conversation that came to rest on anything but success", async () => {
		const mounted = await mountWithConversationEndingAt("error")

		expect(congratsDialog()).toBeNull()
		expect(mounted.onboarding.isHomeOnboardingFirstWorkCongratsSpent(MAGIC_ID)).toBe(false)
	})

	it("does not take a tool message's own success for the work being done", async () => {
		const mounted = await mountWithConversationEndingAt("running")

		// A tool has finished, and it is the newest message in the conversation. Its status is the
		// tool's business; the assistant's message is the one that speaks for the topic.
		act(() => {
			messageListHolder.current.commit(CHAT_TOPIC_ID, [
				userMessage(),
				assistantMessage("super-1", "running"),
				{ role: "tool", super_message_id: "super-1-tool", superStatus: "finished" },
			])
			messageListHolder.current.endAt("super-1", "running")
			messageListHolder.current.endAt("super-1-tool", "finished")
		})

		expect(congratsDialog()).toBeNull()
		expect(mounted.onboarding.isHomeOnboardingFirstWorkCongratsSpent(MAGIC_ID)).toBe(false)
	})

	it("still answers for a conversation the store kept no node behind", async () => {
		await mountWithConversationEndingAt("finished", false)

		expect(congratsDialog()).not.toBeNull()
	})

	it("leaves a guided run that owns the screen alone, and opens when it gives it back", async () => {
		const mounted = await mountDialog(async ({ onboarding }) => {
			backendStillListsTasks()
			conversationEndsAt("finished")
			await onboarding.ensureHomeOnboardingRewardList(MAGIC_ID)
			onboarding.setHomeOnboardingRunActive(true)
		})
		expect(congratsDialog()).toBeNull()
		expect(mounted.onboarding.isHomeOnboardingFirstWorkCongratsSpent(MAGIC_ID)).toBe(false)

		// The run is over. Nothing about the conversation changed, and the dialog takes the moment
		// on the strength of the answer that did.
		act(() => {
			mounted.onboarding.setHomeOnboardingRunActive(false)
		})

		expect(congratsDialog()).not.toBeNull()
		expect(mounted.onboarding.isHomeOnboardingFirstWorkCongratsSpent(MAGIC_ID)).toBe(true)
	})
})

describe("which conversation it is watching", () => {
	it("reads the topic the page is on, and not another topic's ending", async () => {
		await mountDialog(async ({ onboarding }) => {
			backendStillListsTasks()
			await onboarding.ensureHomeOnboardingRewardList(MAGIC_ID)
		})

		// A topic elsewhere in the workspace finishes. The page is not on it.
		conversationEndsAt("finished", { chatTopicId: "another-topic" })
		expect(congratsDialog()).toBeNull()

		// This page's own topic is the one that finished.
		conversationEndsAt("finished")
		expect(congratsDialog()).not.toBeNull()
	})

	it("reads nothing off the project page", async () => {
		routeParams.projectId = undefined as unknown as string

		const mounted = await mountWithConversationEndingAt("finished")

		expect(congratsDialog()).toBeNull()
		expect(mounted.onboarding.isHomeOnboardingFirstWorkCongratsSpent(MAGIC_ID)).toBe(false)
	})

	it("follows the page to the next topic", async () => {
		const mounted = await mountWithConversationEndingAt("running")
		conversationEndsAt("finished", { chatTopicId: "chat-topic-2" })
		expect(congratsDialog()).toBeNull()

		// The page walks to a topic that has already finished. Nothing here re-renders the dialog by
		// hand: the store is the page's own state, and following it is the dialog's job.
		await act(async () => {
			topicStoreHolder.current.openTopic("chat-topic-2")
		})

		expect(congratsDialog()).not.toBeNull()
		expect(mounted.onboarding.isHomeOnboardingFirstWorkCongratsSpent(MAGIC_ID)).toBe(true)
	})
})

describe("the one-shot rule", () => {
	it("congratulates once per account per browser, and not again on the next ending", async () => {
		const first = await mountWithConversationEndingAt("finished")
		expect(congratsDialog()).not.toBeNull()

		// Left through the second exit, which is a way of being shown the dialog rather than a way
		// of escaping it.
		await act(async () => {
			fireEvent.click(screen.getByText(LATER))
		})
		expect(congratsDialog()).toBeNull()
		conversationEndsAt("finished")
		expect(congratsDialog()).toBeNull()
		first.unmount()

		// A fresh page, the same browser and the same account: the answer came from storage, so it
		// is still spent.
		await mountWithConversationEndingAt("finished")

		expect(congratsDialog()).toBeNull()
	})

	it("keeps one account's flag to itself, so the next account is still owed its own", async () => {
		const mounted = await mountWithConversationEndingAt("finished")

		expect(mounted.onboarding.isHomeOnboardingFirstWorkCongratsSpent(MAGIC_ID)).toBe(true)
		expect(mounted.onboarding.isHomeOnboardingFirstWorkCongratsSpent("another-account")).toBe(
			false,
		)
	})
})

describe("the two exits", () => {
	it("closes in place, and does not claim the task on the way out", async () => {
		await mountWithConversationEndingAt("finished")

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
		await mountWithConversationEndingAt("finished")

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
		await mountWithConversationEndingAt("finished")

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
