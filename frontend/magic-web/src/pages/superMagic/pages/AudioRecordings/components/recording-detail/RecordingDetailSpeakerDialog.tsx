import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/shadcn-ui/dialog"
import { Input } from "@/components/shadcn-ui/input"

interface RecordingDetailSpeakerDialogProps {
	open: boolean
	speakerIds: string[]
	value: Record<string, string>
	onValueChange: (next: Record<string, string>) => void
	onOpenChange: (open: boolean) => void
	onConfirm: () => void
}

/** Desktop dialog for editing speaker display names persisted to magic.project.js. */
export function RecordingDetailSpeakerDialog({
	open,
	speakerIds,
	value,
	onValueChange,
	onOpenChange,
	onConfirm,
}: RecordingDetailSpeakerDialogProps) {
	const { t } = useTranslation("audioRecordings")

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md" data-testid="recording-detail-speaker-dialog">
				<DialogHeader>
					<DialogTitle>{t("detail.speakerSettingsTitle")}</DialogTitle>
				</DialogHeader>
				<p className="text-sm text-muted-foreground">{t("detail.speakerSettingsHint")}</p>
				<div className="flex max-h-[50vh] flex-col gap-3 overflow-y-auto py-2">
					{speakerIds.map((speakerId, index) => (
						<div key={speakerId} className="space-y-1.5">
							<label className="text-sm text-muted-foreground">
								{t("detail.speakerLabel", { label: buildSpeakerAlphaLabel(index) })}
							</label>
							<Input
								value={value[speakerId] ?? speakerId}
								onChange={(event) =>
									onValueChange({ ...value, [speakerId]: event.target.value })
								}
								placeholder={speakerId}
							/>
						</div>
					))}
				</div>
				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						{t("detail.speakerSettingsCancel")}
					</Button>
					<Button onClick={onConfirm}>{t("detail.speakerSettingsSave")}</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

function buildSpeakerAlphaLabel(index: number) {
	return String.fromCharCode("A".charCodeAt(0) + index)
}
