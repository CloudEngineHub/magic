import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"
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

interface PrePublishAnalysisDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	onConfirm: (goal: SelfMediaPrePublishAnalysisGoal) => void | Promise<void>
	loading?: boolean
}

export function PrePublishAnalysisDialog({
	open,
	onOpenChange,
	onConfirm,
	loading = false,
}: PrePublishAnalysisDialogProps) {
	const { t } = useTranslation("super")
	const [goal, setGoal] = useState<SelfMediaPrePublishAnalysisGoal>("ip-growth")

	useEffect(() => {
		if (open) setGoal("ip-growth")
	}, [open])

	return (
		<Dialog open={open} onOpenChange={loading ? undefined : onOpenChange}>
			<DialogContent className="max-w-md" data-testid="pre-publish-analysis-dialog">
				<DialogHeader>
					<DialogTitle>{t("detail.selfMedia.analysis.title")}</DialogTitle>
					<DialogDescription>
						{t("detail.selfMedia.analysis.description")}
					</DialogDescription>
				</DialogHeader>
				<RadioGroup
					value={goal}
					onValueChange={(value) => setGoal(value as SelfMediaPrePublishAnalysisGoal)}
					className="gap-2"
				>
					{SELF_MEDIA_PRE_PUBLISH_ANALYSIS_GOALS.map((item) => (
						<label
							key={item.value}
							className={cn(
								"flex cursor-pointer items-start gap-3 rounded-md border p-3 text-left transition",
								goal === item.value
									? "border-primary bg-primary/5"
									: "hover:bg-accent/50",
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
				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={loading}
					>
						{t("detail.selfMedia.analysis.cancel")}
					</Button>
					<Button
						type="button"
						onClick={() => {
							void onConfirm(goal)
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
