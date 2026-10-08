import { lazy, Suspense, useEffect, useState } from "react"
import { useParams } from "react-router"
import { useUserInfo } from "@/models/user/hooks"
import { WorkspacePage } from "@/pages/superMagic/layouts/MainLayout/types"
import {
	canOpenAutomaticHomeOnboarding,
	checkIfHomeOnboardingNeeded,
	ensureHomeOnboardingRewardList,
	getHomeOnboardingEntryTask,
	getHomeOnboardingFlow,
	getHomeOnboardingRewardList,
	HOME_ONBOARDING_REQUEST_EVENT,
	HOME_ONBOARDING_STATE_EVENT,
	isHomeOnboardingIntroSpent,
	isHomeOnboardingTaskOnPage,
	type HomeOnboardingRewardListStatus,
	type HomeOnboardingTaskPage,
} from "./GuideTourManager"
import { useCanHostHomeOnboarding } from "./onboardingAvailability"
import { useHomeOnboardingPreludeHeld } from "./onboardingPrelude"

const HomeOnboardingTour = lazy(() => import("./HomeOnboardingTour"))

interface GuideTourWrapperProps {
	/**
	 * Whether this wrapper is on a mobile client. It is passed rather than worked out here because
	 * the answer is the page's: `useIsMobile` is already how these layouts decide what to render,
	 * and asking a second time could only disagree with the page it is on.
	 */
	isMobile: boolean
	/**
	 * Which page is hosting this wrapper. Every task's steps are highlighted on one page, and only
	 * that page may serve a run for it — the home steps never open over the MagiClaw page and vice
	 * versa.
	 */
	page?: HomeOnboardingTaskPage
}

/**
 * The tour itself, mounted only where the feature can actually be shown: a SaaS personal
 * organization, on a desktop client.
 *
 * It is a component of its own rather than a guard inside the one below, because the guard has to
 * run *before* the work: the effects here ask the backend for a reward list and follow its answer,
 * and a component that mounts and then hides has already asked. Keeping the two apart means that on
 * a private deployment, in a team organization or on a mobile client none of this is ever mounted,
 * its effects never run, and the lazy chunk above is never fetched.
 */
function GuideTourGate({ isMobile, page = "home" }: GuideTourWrapperProps) {
	const { userInfo } = useUserInfo()
	const { projectId, topicId } = useParams()
	const [requestVersion, setRequestVersion] = useState(0)
	/**
	 * How far the backend's answer for this account's reward list has got. Held as the status rather
	 * than as a derived boolean because the gate below is read in the render body: a write that
	 * changed the answer without scheduling a render would leave that gate reading a stale one.
	 * Seeded from the cache so a second mount on an already-answered account does not flicker.
	 */
	const [rewardStatus, setRewardStatus] = useState<HomeOnboardingRewardListStatus>(
		() => getHomeOnboardingRewardList(userInfo?.magic_id).status,
	)
	/**
	 * Whether a dialog that comes *before* this feature is holding the screen — the profile one a
	 * brand-new account is asked to fill in, or the daily reward one. This run is the last of them,
	 * so it waits here rather than painting over whatever is up. See `onboardingPrelude`.
	 */
	const preludeHeld = useHomeOnboardingPreludeHeld()
	const workspacePage = topicId && projectId ? WorkspacePage.Chat : WorkspacePage.Home
	const isHome = workspacePage === WorkspacePage.Home

	useEffect(() => {
		const handleRequest = () => setRequestVersion((version) => version + 1)
		window.addEventListener(HOME_ONBOARDING_REQUEST_EVENT, handleRequest)
		return () => window.removeEventListener(HOME_ONBOARDING_REQUEST_EVENT, handleRequest)
	}, [])

	/**
	 * The list is what tells the run whether there is anything to offer, so the wrapper asks for it
	 * once on mount and follows the answer from then on — a claim, a refresh or the initial load all
	 * announce themselves the same way.
	 */
	useEffect(() => {
		const userMagicId = userInfo?.magic_id
		if (!userMagicId) return
		const sync = () => setRewardStatus(getHomeOnboardingRewardList(userMagicId).status)
		sync()
		void ensureHomeOnboardingRewardList(userMagicId)
		window.addEventListener(HOME_ONBOARDING_STATE_EVENT, sync)
		return () => window.removeEventListener(HOME_ONBOARDING_STATE_EVENT, sync)
	}, [userInfo?.magic_id])

	const activeFlow = getHomeOnboardingFlow()
	/**
	 * A request names the task it wants, so the page that owns that task's anchors is the one that
	 * answers it. This covers a "回看" too: the entry is what the tour reads on mount, and a request
	 * for a task this page does not own is simply not ours to serve.
	 */
	const entryTask = getHomeOnboardingEntryTask()
	const entryForThisPage = isHomeOnboardingTaskOnPage(entryTask, page)
	/**
	 * The automatic run stays a home-page affair — its steps are the home layout's — and it stands
	 * aside while a request is pending, so it can neither start the MagiClaw steps nor answer for
	 * them on the way to the page that owns them. It also waits for the reward list before it offers
	 * anything, which keeps both things the list can take away off the screen: a task the account has
	 * already finished, and the tour itself on a deployment that does not have the feature.
	 *
	 * And it waits behind the dialogs that come first. Only this run — not an entry a user asked for
	 * from the benefits card — is held back by them: the intro dialog is what opens unasked, and a
	 * run already on screen belongs to someone who asked for it, so a dialog arriving late (the daily
	 * reward is checked on a timer, not only at startup) must not tear it down.
	 *
	 * The introduction dialog is in fact all this run ever shows, and it is shown once per account
	 * rather than once per page load. Once spent there is nothing left for an unasked run to do, so
	 * the wrapper does not mount one at all — the tasks are entered from the benefits card from then
	 * on, and a reload cannot bring the dialog back.
	 */
	const automaticRun =
		page === "home" &&
		!entryTask &&
		!preludeHeld &&
		!isHomeOnboardingIntroSpent(userInfo?.magic_id) &&
		canOpenAutomaticHomeOnboarding(rewardStatus) &&
		checkIfHomeOnboardingNeeded(userInfo?.magic_id, isHome, isMobile)

	/*
	 * The second line behind the wrapper's own mobile answer. That gate is what keeps a phone from
	 * asking at all; this one is about rendering, and it is kept because the two are different
	 * claims — nothing in this component is for a mobile client, whatever got it mounted.
	 */
	if (!userInfo?.magic_id || isMobile) return null
	if (!entryForThisPage && !automaticRun && !activeFlow) return null

	return (
		<Suspense fallback={null}>
			{/*
			 * `key` forces a fresh tour on every replay request. A finished tour stays mounted while
			 * rendering null, so reusing the instance would keep its internal `dismissed` state and
			 * the replay would never become visible again.
			 */}
			<HomeOnboardingTour key={requestVersion} page={page} userMagicId={userInfo?.magic_id} />
		</Suspense>
	)
}

/**
 * The entry point every page mounts, and the one place the feature's own availability is read.
 *
 * Pages do not ask whether to mount this: they mount it and it decides, which keeps the rule in one
 * file and out of the eight call sites. `null` here means "this client has no new-user onboarding",
 * and it is answered without mounting anything.
 *
 * **Mobile is one of those answers, and it has to be read here rather than below.** The home layout
 * mounts this wrapper on both clients — it is the layout that renders it, and that layout is the
 * same either way — while `GuideTourGate` only reads `isMobile` in its render body. A gate that
 * mounted on a phone would therefore register its effects first and return `null` afterwards, which
 * is exactly the shape this file exists to avoid: the reward list is asked for on mount, and a
 * client that cannot show the feature must not ask for it. (On a phone, `/super` is reached and then
 * redirected to the mobile home, so the gate really does get that one render.)
 */
export default function GuideTourWrapper({ isMobile, page }: GuideTourWrapperProps) {
	const canHostFeature = useCanHostHomeOnboarding()

	if (isMobile || !canHostFeature) return null

	return <GuideTourGate isMobile={isMobile} page={page} />
}
export {
	HOME_ONBOARDING_RUN_EVENT,
	HOME_ONBOARDING_STATE_EVENT,
	canManuallyCompleteHomeOnboardingTask,
	canOpenAutomaticHomeOnboarding,
	claimHomeOnboardingReward,
	ensureHomeOnboardingRewardList,
	getHomeOnboardingRewardList,
	getHomeOnboardingTaskEntryPage,
	getHomeOnboardingTaskIdByCode,
	homeOnboardingClaimFailureKey,
	HOME_ONBOARDING_TASK_CODE,
	HomeOnboardingAnchor,
	isHomeOnboardingCompleted,
	isHomeOnboardingRunActive,
	isHomeOnboardingTaskOnPage,
	isReplayableHomeOnboardingTask,
	refreshHomeOnboardingRewardList,
	startHomeOnboarding,
} from "./GuideTourManager"
export type {
	HomeOnboardingClaimResult,
	HomeOnboardingReward,
	HomeOnboardingRewardList,
	HomeOnboardingRewardListStatus,
	HomeOnboardingTaskId,
	HomeOnboardingTaskPage,
} from "./GuideTourManager"
