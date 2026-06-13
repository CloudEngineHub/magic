import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"
import ModelSwitch from "@/pages/superMagic/components/MessageEditor/components/ModelSwitch"
import type { ModelItem, ModelSwitchProps } from "@/pages/superMagic/components/MessageEditor/types"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/shadcn-ui/dialog"
import { RadioGroup, RadioGroupItem } from "@/components/shadcn-ui/radio-group"
import { cn } from "@/lib/utils"
import {
	SELF_MEDIA_PRE_PUBLISH_ANALYSIS_GOALS,
	type SelfMediaPrePublishAnalysisGoal,
} from "../services/selfMediaPrePublishAnalysis"
import { selfMediaOverlayStyles } from "./selfMediaOverlayStyles"

interface PrePublishAnalysisDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	onConfirm: (
		goal: SelfMediaPrePublishAnalysisGoal,
		selectedModel: ModelItem | null,
	) => void | Promise<void>
	loading?: boolean
	modelList?: ModelSwitchProps["modelList"]
	selectedModel?: ModelItem | null
}

export function PrePublishAnalysisDialog({
	open,
	onOpenChange,
	onConfirm,
	loading = false,
	modelList = [],
	selectedModel: selectedModelProp = null,
}: PrePublishAnalysisDialogProps) {
	const { t } = useTranslation("super")
	const [goal, setGoal] = useState<SelfMediaPrePublishAnalysisGoal>("ip-growth")
	const [selectedModel, setSelectedModel] = useState<ModelItem | null>(selectedModelProp)

	useEffect(() => {
		if (!open) return
		setGoal("ip-growth")
		setSelectedModel(selectedModelProp)
	}, [open, selectedModelProp])

	return (
		<Dialog open={open} onOpenChange={loading ? undefined : onOpenChange}>
			<DialogContent
				className={`max-w-md ${selfMediaOverlayStyles.dialogSurface}`}
				data-testid="pre-publish-analysis-dialog"
			>
				<DialogHeader className={selfMediaOverlayStyles.dialogHeader}>
					<DialogTitle className={selfMediaOverlayStyles.dialogTitle}>
						{t("detail.selfMedia.analysis.title")}
					</DialogTitle>
					<DialogDescription className={selfMediaOverlayStyles.dialogDescription}>
						{t("detail.selfMedia.analysis.description")}
					</DialogDescription>
				</DialogHeader>
				<div className={`${selfMediaOverlayStyles.dialogBody} space-y-4`}>
					<RadioGroup
						value={goal}
						onValueChange={(value) => setGoal(value as SelfMediaPrePublishAnalysisGoal)}
						className="gap-2"
					>
						{SELF_MEDIA_PRE_PUBLISH_ANALYSIS_GOALS.map((item) => (
							<label
								key={item.value}
								className={cn(
									"flex cursor-pointer items-start gap-3 rounded-[18px] border-0 bg-white/90 p-3 text-left shadow-[inset_0_0_0_1px_rgba(24,24,27,0.06)] transition",
									goal === item.value
										? "text-[#18181b] shadow-[inset_0_0_0_2px_rgba(24,24,27,0.18)]"
										: "hover:bg-white",
								)}
							>
								<RadioGroupItem value={item.value} className="mt-0.5" />
								<span className="min-w-0 flex-1 space-y-1">
									<span className="block text-sm font-medium text-foreground">
										{t(item.labelKey)}
									</span>
									<span className="block text-xs leading-relaxed text-muted-foreground">
										{t(item.descriptionKey)}
									</span>
								</span>
							</label>
						))}
					</RadioGroup>
					<div className="space-y-2">
						<div className="text-sm font-medium text-[#18181b]">
							{t("detail.selfMedia.analysis.modelLabel")}
						</div>
						<ModelSwitch
							modelList={modelList}
							selectedModel={selectedModel}
							onModelChange={setSelectedModel}
							size="small"
							showBorder
							defaultTab="language"
							triggerTab="language"
							editable={false}
							className="w-full justify-between"
							triggerTestId="pre-publish-analysis-model-switch"
						/>
					</div>
				</div>
				<DialogFooter className={selfMediaOverlayStyles.dialogFooter}>
					<Button
						type="button"
						variant="outline"
						className={selfMediaOverlayStyles.secondaryButton}
						onClick={() => onOpenChange(false)}
						disabled={loading}
					>
						{t("detail.selfMedia.analysis.cancel")}
					</Button>
					<Button
						type="button"
						className={selfMediaOverlayStyles.primaryButton}
						onClick={() => {
							void onConfirm(goal, selectedModel)
						}}
						disabled={loading}
						data-testid="pre-publish-analysis-confirm"
					>
						{loading
							? t("detail.selfMedia.analysis.starting")
							: t("detail.selfMedia.analysis.confirm")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

export default PrePublishAnalysisDialog
