import { observer } from "mobx-react-lite"
import { reaction } from "mobx"
import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useTranslation } from "react-i18next"
import { useParams } from "react-router"
import { X } from "lucide-react"
import { useNavigateToSuperHome } from "@/layouts/BaseLayout/components/MagicSidebar/hooks/useNavigateToSuperHome"
import type { SuperMagicMessageItem } from "@/pages/superMagic/components/MessageList/type"
import { TaskStatus } from "@/pages/superMagic/pages/Workspace/types"
import { superMagicStore } from "@/pages/superMagic/stores"
import { topicStore } from "@/pages/superMagic/stores/core"
import { projectVisibleMessagesByRevokedTail } from "@/pages/superMagic/utils/project-visible-messages-by-revoked-tail"
import { analyticsService } from "@/services/analytics"
import {
	HOME_ONBOARDING_RUN_EVENT,
	HOME_ONBOARDING_STATE_EVENT,
	getHomeOnboardingRewardList,
	hasHomeOnboardingTasks,
	HOME_ONBOARDING_TASK_CODE,
	isHomeOnboardingFirstWorkCongratsSpent,
	isHomeOnboardingRunActive,
	refreshHomeOnboardingRewardList,
	spendHomeOnboardingFirstWorkCongrats,
} from "./GuideTourManager"

interface HomeOnboardingFirstWorkCongratsProps {
	/**
	 * Whose congratulations these are. Handed in rather than read here, because the account is
	 * already known one level up, in the gate that decides whether this feature exists at all for
	 * this deployment, this organization and this client.
	 */
	userMagicId: string
}

/**
 * What the topic's conversation has come to rest on.
 *
 * Read out of the store the way the rest of the workspace reads it — the canonical message list for
 * the topic, its revoked-tail projection, and the assistant's own last message — because that
 * message is the one whose `status` carries the *topic's* execution status rather than its own
 * (`stores/decision.md`, LF-03): the loading hook and the read-progress hook both read it there for
 * that reason. A tool message is skipped rather than accepted as the authority, since a tool that
 * finished says nothing about whether the work did.
 *
 * The node behind the message answers first because it is the live field — the store's merge writes
 * the item's `superStatus` from it, not the other way round — and the item is the fallback for a
 * conversation that arrived without one.
 */
function readConversationTailStatus(chatTopicId: string): string | undefined {
	const messages = projectVisibleMessagesByRevokedTail(
		(superMagicStore.messages?.get(chatTopicId) || []) as SuperMagicMessageItem[],
	)
	const lastAssistant = messages.findLast((message) => message?.role === "assistant")
	const nodeStatus = superMagicStore.getMessageNode(lastAssistant?.super_message_id)?.status
	const status = nodeStatus ?? lastAssistant?.superStatus
	return status == null ? undefined : String(status)
}

/**
 * The congratulations a new account gets the first time one of its topics finishes.
 *
 * **What opens it.** The conversation the page is on, read rather than listened to: its last
 * assistant message carries the topic's own execution status, so a tail that has come to rest on
 * `finished` is this app's word for "the work is done". Reading the state instead of waiting to be
 * told about it is the point, and the reason this was rebuilt. The store's end-of-execution event
 * is a *notification*: it is raised once, at the moment the status lands, and it reaches only
 * whoever was already asking — so a page opened a moment later never hears it, and a topic whose
 * ending arrives as part of the history it hydrates is deliberately silent about it
 * (`eventPolicy: "silent_hydration"`). Either way the dialog simply never opened, while the status
 * sat in the list the whole time.
 *
 * **The three answers it needs before it opens.** The account has to still be a new one, which is the
 * backend's task list rather than anything local (`hasHomeOnboardingTasks`: the list arrived, and it
 * carries something) — the same test the delivered-file tour makes, for the same reason. This
 * browser must not have congratulated this account already, which is the one-shot flag below. And no
 * guided run may be on screen: a run owns the whole window for its own reasons, and a dialog landing
 * on top of one would be two overlays fighting over the same moment.
 *
 * All three are asked again from scratch every time anything changes, rather than decided once when
 * the conversation ends. That is what lets a run be waited out instead of declined: the moment is
 * still owed, the conversation is still finished, and the run giving the screen back is simply
 * another moment to ask again — as is the backend's list landing after the work was already done.
 *
 * **What it is spent by.** Being shown, not being answered, and it is written before the first paint
 * of the dialog for the reason the introduction dialog writes its own flag the same way: coming back
 * to a reload with the dialog still up has shown it just as much as clicking it away has, and the
 * write must win the race against either exit. Being spent is also what makes asking repeatedly
 * harmless: the answers above can only open it once.
 *
 * **What it deliberately does not do.** It does not complete the AI-work task. That one the backend
 * finishes by itself — the client's own claim path skips it on purpose — so the only thing left for
 * this side to do is ask the list again, which keeps the benefits card honest about the row this
 * dialog has just congratulated.
 *
 * The dialog is drawn by hand rather than through the anchored tour: it has no anchor, it belongs to
 * the moment rather than to a part of the page, and the tour's own two centred dialogs are its
 * siblings in style rather than in machinery.
 *
 * It leaves the module *lazily*, the way the tour does, because of where it is mounted: the gate is
 * mounted by every page, and this file reaches the workspace services for its one navigation. An
 * eager import would put all of that — and the i18n instance behind it — into the graph of the
 * benefits card and of every other module that asks the gate for anything.
 */
const HomeOnboardingFirstWorkCongrats = observer(function HomeOnboardingFirstWorkCongrats({
	userMagicId,
}: HomeOnboardingFirstWorkCongratsProps) {
	/*
	 * The tour's own namespace, which is the file the strings beside it live in. "super" is a
	 * different file — the workspace's general strings — and asking it for `homeOnboarding.*`
	 * silently hands back the key itself.
	 */
	const { t } = useTranslation("super/guideTour")
	const { projectId, topicId } = useParams()
	const selectedTopic = topicStore.selectedTopic
	const { navigateToSuperHome } = useNavigateToSuperHome()
	const [shown, setShown] = useState(false)
	const exposureReported = useRef(false)
	/**
	 * The figure the congratulations carry, taken at the moment they are earned.
	 *
	 * Held rather than read at render time because the refresh below throws the cached rows away
	 * before it asks for them again, and the dialog is on screen while that is in flight: reading it
	 * off the list in the render body would draw the badge from whatever the second answer had
	 * arrived with, which is nothing at all until it does.
	 */
	const [points, setPoints] = useState<number | undefined>(undefined)

	/*
	 * The project page is the route that carries both ids, and it is the only page this dialog
	 * belongs to. A topic without its chat id is a topic the store has not finished loading, and
	 * asking about one would mean asking about every topic in the workspace.
	 */
	const onProjectPage = Boolean(projectId && topicId)
	const chatTopicId = selectedTopic?.chat_topic_id

	useEffect(() => {
		if (!onProjectPage || !chatTopicId) return

		/**
		 * Whether the moment is owed, asked from scratch — the conversation, the backend's list and
		 * the run are all read here rather than remembered. Asking repeatedly is safe because being
		 * shown is what spends it.
		 */
		const openIfEarned = () => {
			/*
			 * `finished` is a topic that stopped well, which is the whole of what there is to
			 * congratulate. `error` and `suspended` are the same topic telling the user that
			 * something went wrong, and `waiting_for_user` is not an ending at all — the topic has
			 * handed control back and may be about to carry on.
			 */
			if (readConversationTailStatus(chatTopicId) !== TaskStatus.FINISHED) return
			if (isHomeOnboardingFirstWorkCongratsSpent(userMagicId)) return
			if (!hasHomeOnboardingTasks(userMagicId)) return
			if (isHomeOnboardingRunActive()) return

			/*
			 * The figure is the backend's for the task just finished, read off the reward row
			 * rather than written down here: the row is the same one the benefits card draws its
			 * own totals from, and a second copy of the number is a second thing to keep in step.
			 * A list that has not carried the row leaves the badge off rather than guessing at it.
			 *
			 * Read before the list is asked for again, and before the dialog is on screen — see
			 * `points` above for why the order matters.
			 */
			setPoints(
				getHomeOnboardingRewardList(userMagicId).rewards.find(
					(row) => row.code === HOME_ONBOARDING_TASK_CODE["first-ai-work"],
				)?.points,
			)
			spendHomeOnboardingFirstWorkCongrats(userMagicId)
			void refreshHomeOnboardingRewardList(userMagicId)
			setShown(true)
		}

		/*
		 * The conversation is watched rather than listened to: a reaction over the store's own list,
		 * which answers for a topic that finishes while the page is up — and, because it is asked
		 * immediately, for one that had already finished before the page got here.
		 *
		 * The two events are the other half of the same question, and they are not about the
		 * conversation at all: the state can already be the finished one while what changed is one of
		 * the reasons not to open yet. The backend's list landing is the first, and a guided run
		 * giving the screen back is the second — neither of them moves the conversation, so nothing
		 * would ask again without them.
		 */
		const stopWatchingConversation = reaction(
			() => readConversationTailStatus(chatTopicId),
			openIfEarned,
			{ fireImmediately: true },
		)
		window.addEventListener(HOME_ONBOARDING_STATE_EVENT, openIfEarned)
		window.addEventListener(HOME_ONBOARDING_RUN_EVENT, openIfEarned)
		return () => {
			stopWatchingConversation()
			window.removeEventListener(HOME_ONBOARDING_STATE_EVENT, openIfEarned)
			window.removeEventListener(HOME_ONBOARDING_RUN_EVENT, openIfEarned)
		}
	}, [chatTopicId, onProjectPage, userMagicId])

	useEffect(() => {
		if (!shown || exposureReported.current) return
		exposureReported.current = true
		/*
		 * `shown` is set only after the dialog's opening conditions pass. Reporting from this effect
		 * waits for React to commit that visible state, and the amount is the same backend value drawn
		 * in the reward card rather than a second client-side constant.
		 */
		analyticsService.report("onboarding_reward_popup_exposure", { pointsAmount: points })
	}, [points, shown])

	if (!shown) return null

	const close = (action: "later" | "close") => {
		analyticsService.report("onboarding_reward_popup_click", { action })
		setShown(false)
	}

	return createPortal(
		<div
			className="fixed inset-0 z-[1200] text-foreground"
			role="dialog"
			aria-modal="true"
			aria-label={t("homeOnboarding.firstWork.title")}
		>
			<div className="absolute inset-0 bg-[rgba(52,52,52,0.62)]" />
			<section className="fixed left-1/2 top-1/2 max-h-[calc(100vh-34px)] w-[min(560px,calc(100vw-40px))] -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-[16px] border border-border bg-background px-11 pb-9 pt-11 text-left shadow-[0_1px_2px_rgba(0,0,0,0.08),0_16px_42px_rgba(0,0,0,0.14)] max-[760px]:w-[calc(100vw-24px)] max-[760px]:px-6 max-[760px]:pb-6 max-[760px]:pt-7">
				<button
					className="absolute right-4 top-4 inline-flex size-11 items-center justify-center rounded-[10px] text-muted-foreground hover:border hover:border-border hover:bg-muted hover:text-foreground"
					type="button"
					onClick={() => close("close")}
					aria-label={t("homeOnboarding.firstWork.close")}
				>
					<X className="size-4" strokeWidth={1.8} />
				</button>
				<h2 className="pr-12 text-[30px] font-bold leading-tight tracking-[-0.03em] max-[760px]:text-2xl">
					{t("homeOnboarding.firstWork.title")}
				</h2>
				<div className="mt-6 flex items-center gap-4 rounded-[14px] bg-[#f5f5f5] px-5 py-6">
					<span className="min-w-0 flex-1">
						<strong className="block text-[16px] font-bold leading-tight">
							{t("homeOnboarding.firstWork.card.title")}
						</strong>
						<small className="mt-2 block text-[13px] leading-[1.5] text-muted-foreground">
							{t("homeOnboarding.firstWork.card.description")}
						</small>
					</span>
					{points === undefined ? null : (
						<strong className="shrink-0 text-[18px] font-bold text-[#21a66a]">
							{t("homeOnboarding.firstWork.points", { points })}
						</strong>
					)}
				</div>
				<div className="mt-7 flex w-full flex-col items-stretch gap-3.5">
					{/*
					 * The primary action leaves for the workspace rather than closing in place: the
					 * task is finished, and the dialog's whole offer is the next one.
					 *
					 * `text-[13px]` is what the design draws and what the welcome dialog uses for the
					 * same button; at 18px the label stood larger than the card title above it, where
					 * the design has it as the quietest of the three.
					 */}
					<button
						className="h-11 min-h-11 w-full rounded-[10px] border border-foreground bg-foreground px-4 text-[13px] font-semibold text-background hover:bg-[#2b2b2b]"
						type="button"
						onClick={() => {
							analyticsService.report("onboarding_reward_popup_click", {
								action: "start_new_task",
							})
							setShown(false)
							navigateToSuperHome()
						}}
					>
						{t("homeOnboarding.firstWork.actions.start")}
					</button>
					<button
						className="min-h-11 self-center px-3 py-1.5 text-[15px] text-muted-foreground hover:text-foreground"
						type="button"
						onClick={() => close("later")}
					>
						{t("homeOnboarding.firstWork.actions.later")}
					</button>
				</div>
			</section>
		</div>,
		document.body,
	)
})

export default HomeOnboardingFirstWorkCongrats
