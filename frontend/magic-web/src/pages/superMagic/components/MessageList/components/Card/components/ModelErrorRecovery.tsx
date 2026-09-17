import { type ReactNode } from "react"
import { observer } from "mobx-react-lite"
import { CircleAlert, RotateCw } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"
import { useIsMobile } from "@/hooks/useIsMobile"
import { useMessageListContext } from "../../../context"
import ModelSwitch from "@/pages/superMagic/components/MessageEditor/components/ModelSwitch"
import { AddModelStoreProvider } from "@/pages/superMagic/components/MessageEditor/components/ModelSwitch/components/AddModel/context"
import { ModelHelp } from "@/pages/superMagic/components/ModelHelp"
import type { ModelRecoveryMessage } from "@/pages/superMagic/utils/model-error-recovery"
import type { ErrorRecoveryAction } from "@/types/chat/conversation_message"

export const ModelErrorRecovery = observer(function ModelErrorRecovery({
	message,
	children,
}: {
	message: ModelRecoveryMessage
	children: ReactNode
}) {
	const { t } = useTranslation("super")
	const isMobile = useIsMobile()
	const { modelErrorRecovery: recovery } = useMessageListContext()
	const available = recovery?.canRecover(message) ?? false
	const failedModel = recovery?.getModel(message.error.subject.model_id)
	const showRetryModel =
		failedModel &&
		recovery?.topicModelStore.selectedLanguageModel?.model_id !== failedModel.model_id
	const actionViews: Record<ErrorRecoveryAction["type"], ReactNode> = {
		switch_model_and_retry: recovery && (
			<AddModelStoreProvider value={recovery.addModelStore}>
				<ModelSwitch
					size={isMobile ? "mobile" : "default"}
					modelList={recovery.modelList}
					selectedModel={failedModel}
					isLoading={recovery.topicModelStore.isLoading}
					editable={false}
					allowedTabs={["language"]}
					trigger={
						<Button variant="outline" size="sm" disabled={recovery.submitting}>
							{t("modelRecovery.switch")}
						</Button>
					}
					selection={{
						mode: "confirm",
						confirmText: t("modelRecovery.confirm"),
						canConfirm: (model) =>
							!recovery.submitting &&
							recovery.canRecover(message) &&
							recovery.canUseModel(message, "switch_model_and_retry", model.model_id),
						onConfirm: (model) =>
							recovery.submit(message, "switch_model_and_retry", model.model_id),
						description: (
							<>
								{failedModel && (
									<p>
										{t("modelRecovery.failedModel", {
											model: failedModel.model_name,
										})}
									</p>
								)}
								<p>{t("modelRecovery.preference")}</p>
								{recovery.addModelStore.hasLoadedMyModels &&
									!recovery.hasAlternative(message) && (
										<p>{t("modelRecovery.noAlternative")}</p>
									)}
							</>
						),
					}}
				/>
			</AddModelStoreProvider>
		),
		retry: failedModel && recovery && (
			<div className="flex flex-wrap items-center gap-2">
				<Button
					variant="ghost"
					size="sm"
					className="gap-1.5 text-foreground"
					disabled={recovery.submitting}
					onClick={() => void recovery.submit(message, "retry", failedModel.model_id)}
				>
					<RotateCw size={16} aria-hidden />
					{t("modelRecovery.retry")}
				</Button>
				{showRetryModel && (
					<span className="text-xs text-muted-foreground">
						{t("modelRecovery.usingModel", { model: failedModel.model_name })}
					</span>
				)}
			</div>
		),
	}
	const visibleActions = message.error.actions.filter((action) =>
		Boolean(actionViews[action.type]),
	)
	return (
		<div>
			<div className="flex flex-wrap items-start gap-x-4 gap-y-2">
				<div className="flex min-w-0 flex-1 items-start gap-2">
					<CircleAlert
						size={16}
						className="mt-1 shrink-0 text-amber-600 dark:text-amber-400"
						aria-hidden
					/>
					<div className="min-w-0 flex-1 text-sm [&_p+p]:text-muted-foreground">
						{children}
					</div>
				</div>
				<ModelHelp code={message.error.code} />
			</div>
			{available && visibleActions.length > 0 && (
				<div className="mt-4 flex flex-wrap items-center gap-2">
					{visibleActions.map((action) => (
						<div key={action.type}>{actionViews[action.type]}</div>
					))}
					{recovery?.submitting && (
						<span role="status" className="text-xs text-muted-foreground">
							{t("modelRecovery.submitting")}
						</span>
					)}
				</div>
			)}
		</div>
	)
})
