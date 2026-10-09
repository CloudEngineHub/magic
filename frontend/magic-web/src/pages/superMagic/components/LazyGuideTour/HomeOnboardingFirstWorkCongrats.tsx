import { observer } from "mobx-react-lite"
import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useTranslation } from "react-i18next"
import { useParams } from "react-router"
import { X } from "lucide-react"
import { useNavigateToSuperHome } from "@/layouts/BaseLayout/components/MagicSidebar/hooks/useNavigateToSuperHome"
import { superMagicStore } from "@/pages/superMagic/stores"
import { topicStore } from "@/pages/superMagic/stores/core"
import { analyticsService } from "@/services/analytics"
import {
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
 * The congratulations a new account gets the first time one of its topics finishes.
 *
 * **What opens it.** The store announces a topic's execution ending once per execution, with the
 * authority of the assistant's own final message — a signal that is deliberately silent about
 * replays, history and quiet recoveries, so opening an old topic cannot congratulate anybody. That
 * is the event this listens to, and it only listens to the topic it is on: the route names the
 * project and the topic, and the subscription is scoped to the latter's chat id, so a task finishing
 * somewhere else in the workspace is not this page's news.
 *
 * **The three answers it needs before it opens.** The account has to still be a new one, which is the
 * backend's task list rather than anything local (`hasHomeOnboardingTasks`: the list arrived, and it
 * carries something) — the same test the delivered-file tour makes, for the same reason. This
 * browser must not have congratulated this account already, which is the one-shot flag below. And no
 * guided run may be on screen: a run owns the whole window for its own reasons, and a dialog landing
 * on top of one would be two overlays fighting over the same moment. That last one is read at the
 * moment the event arrives rather than watched, and a run it finds is a moment this dialog declines
 * rather than defers — it is spent by being shown, so postponing it would mean remembering when.
 *
 * **What it is spent by.** Being shown, not being answered, and it is written before the first paint
 * of the dialog for the reason the introduction dialog writes its own flag the same way: coming back
 * to a reload with the dialog still up has shown it just as much as clicking it away has, and the
 * write must win the race against either exit.
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
	 * subscribing without the scope would answer for every topic in the workspace.
	 */
	const onProjectPage = Boolean(projectId && topicId)
	const chatTopicId = selectedTopic?.chat_topic_id

	useEffect(() => {
		if (!onProjectPage || !chatTopicId) return

		return superMagicStore.subscribe(
			"topic.execution.ended",
			({ payload }) => {
				// Only a run that ended well is a piece of work to congratulate anybody on; the other
				// two terminal states are the topic telling the user something went wrong.
				if (payload.status !== "finished") return
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
			},
			{ scope: { topicId: chatTopicId } },
		)
	}, [chatTopicId, onProjectPage, userMagicId])

	useEffect(() => {
		if (!shown || exposureReported.current) return
		exposureReported.current = true
		/*
		 * Report after React has committed the dialog, not when the execution event merely asks for it.
		 * The points are the same backend value rendered in the card, so analytics cannot drift from
		 * what the user actually saw. The enterprise adapter supplies the operational field names.
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
