import { act, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * The two gates in front of the automatic run: the feature's own availability, and the backend's
 * answer for this account.
 *
 * The benefits card reads the backend's answer for itself — its rows come back empty and it renders
 * nothing — but the automatic run has no rows to read: it asks `checkIfHomeOnboardingNeeded`, which
 * answers from the progress mirror, and a deployment that does not offer the feature seeds no
 * progress, because there is none to seed. Every task therefore still reads as unfinished and the
 * introduction dialog would open in an organization the feature does not exist in — which is the
 * second group below.
 *
 * The first group is the earlier question, and the reason both gates sit on the same component:
 * new-user onboarding belongs to the SaaS personal plan, so a private deployment and a team
 * organization must not mount it at all. "Not mounted" is asserted as "never asked": the reward
 * list is the feature's first request, and a component that mounts and only then hides would have
 * already sent it.
 *
 * These tests drive the wrapper itself, because that is where both answers have to be read.
 */
const { translate, MAGIC_ID, deployment, organization } = vi.hoisted(() => ({
	translate: (key: string) => key,
	MAGIC_ID: "magic-guide-gate",
	/** The deployment and the organization the wrapper under test is looking at. */
	deployment: { privateDeployment: false },
	organization: { organizationListReady: true, isPersonalOrganization: true },
}))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		i18n: { language: "en_US" },
		t: translate,
	}),
}))

vi.mock("@/models/user/hooks", () => ({
	useUserInfo: () => ({ userInfo: { magic_id: MAGIC_ID } }),
	useOrganization: () => organization,
}))

/*
 * Only `isPrivateDeployment` is replaced: everything else in the module is real, so the rest of the
 * feature's imports keep working off the environment the suite runs in.
 */
vi.mock("@/utils/env", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/utils/env")>()),
	isPrivateDeployment: () => deployment.privateDeployment,
}))

// The wrapper decides the workspace page from the route: no ids at all means the home page, which
// is the only page the automatic run belongs to.
vi.mock("react-router", async (importOriginal) => ({
	...(await importOriginal<typeof import("react-router")>()),
	useParams: () => ({}),
}))

const { getOnboardingTasks, completeOnboardingTask } = vi.hoisted(() => ({
	getOnboardingTasks: vi.fn(),
	completeOnboardingTask: vi.fn(),
}))

/*
 * Only the two calls are replaced, and only their own module: the codes and the helpers that read a
 * failed request apart come from `onboarding-codes`, which the manager imports statically and which
 * stays real here. That is what lets a `9301` rejection travel all the way to the gate as a genuine
 * "unsupported" answer rather than as a mock's stand-in for one.
 */
vi.mock("@/apis/modules/onboarding", () => ({ getOnboardingTasks, completeOnboardingTask }))

vi.mock("@/routes/hooks/useNavigate", () => ({ default: () => vi.fn() }))

vi.mock("@/stores/layout", () => ({
	sidebarStore: { collapsed: false, setCollapsed: vi.fn() },
}))

vi.mock("@/utils/pubsub", () => ({
	default: { publish: vi.fn(), subscribe: vi.fn() },
	PubSubEvents: { Set_Input_Message: "set-input-message" },
}))

vi.mock("@/components/base/MagicToaster/utils", () => ({
	default: { error: vi.fn(), info: vi.fn() },
}))

vi.mock("@/pages/superMagic/utils/clawBrand", () => ({
	getClawBrandTranslationValues: () => ({}),
}))

/** The introduction dialog is the automatic run's only surface, and its own accessible name. */
const INTRO = "homeOnboarding.welcome.title"

/** One reward row as the backend sends it. `status` is the part the gate's callers act on. */
function task(code: string, status: "PENDING" | "COMPLETED") {
	return {
		code,
		points: 30,
		validity_days: 7,
		status,
		reward_status: status === "COMPLETED" ? ("GRANTED" as const) : ("PENDING" as const),
		completed_at: null,
		reward_granted_at: null,
		expires_at: "2026-12-31T00:00:00Z",
	}
}

/** A fresh wrapper and manager, so one test's answer cannot decide what the next one starts from. */
async function loadWrapper() {
	vi.resetModules()
	const onboarding = await import("../GuideTourManager")
	const wrapper = await import("../index")
	return { onboarding, wrapper }
}

/**
 * Loads fresh modules, lets the caller arrange the backend's answer, and then mounts the wrapper the
 * way the home page does. The order is the point: the reward list is asked for on mount, so whatever
 * the suite wants the backend to say has to be decided before it is.
 */
async function mountWrapper(arrange: () => void) {
	const { onboarding, wrapper } = await loadWrapper()
	arrange()
	const rendered = render(<wrapper.default isMobile={false} />)
	// Let whatever the mount started settle — the reward list among it — before the caller asserts.
	await act(async () => {
		await Promise.resolve()
	})
	return { onboarding, wrapper, ...rendered }
}

beforeEach(() => {
	// The SaaS personal organization: the one environment the feature is for. Every test that wants
	// another one moves exactly the fact it is about.
	deployment.privateDeployment = false
	organization.organizationListReady = true
	organization.isPersonalOrganization = true

	getOnboardingTasks.mockReset()
	completeOnboardingTask.mockReset()
})

describe("whether the feature is mounted at all", () => {
	/** A list that would leave the run with something to walk, so "nothing happened" cannot be
	 *  explained away by there having been nothing to show. */
	const homeTasksPending = () => {
		getOnboardingTasks.mockResolvedValue({ tasks: [task("first_ai_work", "PENDING")] })
	}

	it("stays off a private deployment without asking for anything", async () => {
		deployment.privateDeployment = true

		await mountWrapper(homeTasksPending)

		expect(getOnboardingTasks).not.toHaveBeenCalled()
		expect(screen.queryByRole("dialog", { name: INTRO })).toBeNull()
	})

	it("stays off a team organization without asking for anything", async () => {
		organization.isPersonalOrganization = false

		await mountWrapper(homeTasksPending)

		expect(getOnboardingTasks).not.toHaveBeenCalled()
		expect(screen.queryByRole("dialog", { name: INTRO })).toBeNull()
	})

	it("holds off until the organization list says which kind it is", async () => {
		// Nobody is a personal organization before the list lands: the store has not been told yet,
		// and `isPersonalOrganization` reads `false` for everybody. Treating that as "a team" would
		// hide the feature from the users it is for, so the gate waits rather than guesses — and
		// waiting must not cost a request.
		organization.organizationListReady = false

		await mountWrapper(homeTasksPending)

		expect(getOnboardingTasks).not.toHaveBeenCalled()
		expect(screen.queryByRole("dialog", { name: INTRO })).toBeNull()
	})

	it("mounts on a SaaS personal organization", async () => {
		await mountWrapper(homeTasksPending)

		expect(await screen.findByRole("dialog", { name: INTRO }, { timeout: 15000 })).toBeTruthy()
	})

	it("opens on the same mount once the organization list says it is a personal one", async () => {
		// The answer arrives after the first paint, on a page that is not remounted, so the gate
		// has to be a decision the wrapper re-takes rather than one it took on mount.
		organization.organizationListReady = false

		const { rerender, wrapper } = await mountWrapper(homeTasksPending)
		expect(getOnboardingTasks).not.toHaveBeenCalled()

		organization.organizationListReady = true
		await act(async () => {
			rerender(<wrapper.default isMobile={false} />)
		})

		expect(await screen.findByRole("dialog", { name: INTRO }, { timeout: 15000 })).toBeTruthy()
	})
})

describe("the wrapper's gate on the automatic run", () => {
	it("stays off the screen on a deployment that does not offer the feature", async () => {
		const { onboarding } = await mountWrapper(() => {
			getOnboardingTasks.mockRejectedValue({ code: 9301, message: "功能未开启" })
		})

		// The absence below has to be the gate's doing, so the answer is waited for first: without
		// this the wrapper would also render nothing while the list is merely still on its way, and
		// the assertion would pass for the wrong reason.
		await vi.waitFor(
			() => {
				expect(onboarding.getHomeOnboardingRewardList(MAGIC_ID).status).toBe("unsupported")
			},
			{ timeout: 5000 },
		)

		expect(screen.queryByRole("dialog", { name: INTRO })).toBeNull()
	})

	it("still opens on a list that leaves both home tasks unfinished", async () => {
		const { onboarding } = await mountWrapper(() => {
			getOnboardingTasks.mockResolvedValue({ tasks: [task("first_ai_work", "PENDING")] })
		})

		// The other half of the rule: the gate is about the deployment's answer, not about whether
		// there is anything left to walk. Blocking here would take the tour away from every user who
		// has it coming.
		expect(await screen.findByRole("dialog", { name: INTRO }, { timeout: 15000 })).toBeTruthy()
		expect(onboarding.getHomeOnboardingRewardList(MAGIC_ID).status).toBe("ready")
	})

	it("stays off on a list that reports the home tasks as already done", async () => {
		const { onboarding } = await mountWrapper(() => {
			getOnboardingTasks.mockResolvedValue({
				tasks: [task("super_magic_intro", "COMPLETED"), task("first_ai_work", "COMPLETED")],
			})
		})

		// Unchanged by the gate, and worth pinning beside it: the backend's verdict on a task the
		// account has finished is what keeps the run away, and it is reached through the same state.
		await vi.waitFor(
			() => {
				expect(onboarding.getHomeOnboardingRewardList(MAGIC_ID).status).toBe("ready")
			},
			{ timeout: 5000 },
		)

		expect(screen.queryByRole("dialog", { name: INTRO })).toBeNull()
	})
})
