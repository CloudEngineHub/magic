import { useCallback, useEffect, useState } from "react"
import { Loader2, Sparkles } from "lucide-react"
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
import superMagicModeService from "@/services/superMagic/SuperMagicModeService"
import { superMagicTopicModelCacheService } from "@/services/superMagic/topicModel"
import type { ModelItem } from "@/pages/superMagic/components/MessageEditor/components/ModelSwitch/types"
import AICardFormFields from "../../AICardRootRender/components/AICardFormFields"
import type { AICardFormFieldsValues } from "../../AICardRootRender/components/AICardFormFields"
import { createAICardViaTopic } from "../services/aiCardCreate"

const AI_CARD_TOPIC_PATTERN = "ip-manager"

interface AICardCreateDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	projectId: string
	folderPath?: string
}

function AICardCreateDialog({
	open,
	onOpenChange,
	projectId,
	folderPath,
}: AICardCreateDialogProps) {
	const { t } = useTranslation("super")
	const [formValues, setFormValues] = useState<AICardFormFieldsValues>({
		taskName: "",
		prompt: "",
		template: "hotspot-tracker",
		enabled: true,
	})
	const [submitting, setSubmitting] = useState(false)
	const [modelList, setModelList] = useState<ModelItem[]>([])
	const [imageModelList, setImageModelList] = useState<ModelItem[]>([])
	const [videoModelList, setVideoModelList] = useState<ModelItem[]>([])

	useEffect(() => {
		if (open) {
			const langModels = superMagicModeService.getModelListByMode(AI_CARD_TOPIC_PATTERN)
			const imgModels = superMagicModeService.getImageModelListByMode(AI_CARD_TOPIC_PATTERN)
			const vidModels = superMagicModeService.getVideoModelListByMode(AI_CARD_TOPIC_PATTERN)
			setModelList(langModels)
			setImageModelList(imgModels)
			setVideoModelList(vidModels)

			// Load project-level persisted model selections as defaults
			superMagicTopicModelCacheService.getProjectModel(projectId).then((cached) => {
				if (!cached) return
				const defaultModel = cached.languageModelId
					? langModels.find((m) => m.model_id === cached.languageModelId) || null
					: null
				const defaultImageModel = cached.imageModelId
					? imgModels.find((m) => m.model_id === cached.imageModelId) || null
					: null
				const defaultVideoModel = cached.videoModelId
					? vidModels.find((m) => m.model_id === cached.videoModelId) || null
					: null
				setFormValues((prev) => ({
					...prev,
					model: prev.model || defaultModel,
					imageModel: prev.imageModel || defaultImageModel,
					videoModel: prev.videoModel || defaultVideoModel,
				}))
			})
		}
	}, [open, projectId])

	const isValid = formValues.taskName.trim() && formValues.prompt.trim()

	const handleChange = useCallback((updates: Partial<AICardFormFieldsValues>) => {
		setFormValues((prev) => ({ ...prev, ...updates }))
	}, [])

	const handleSubmit = useCallback(async () => {
		if (!isValid || submitting) return
		setSubmitting(true)

		try {
			await createAICardViaTopic({
				prompt: formValues.prompt.trim(),
				cardName: formValues.taskName.trim(),
				template: formValues.template,
				customTemplatePrompt: formValues.customTemplatePrompt?.trim(),
				projectId,
				folderPath,
				timeConfig: formValues.timeConfig,
				enabled: formValues.enabled,
				model: formValues.model,
				imageModel: formValues.imageModel,
				videoModel: formValues.videoModel,
			})
			// Close dialog after successful submission
			onOpenChange(false)
			// Reset form
			setFormValues({ taskName: "", prompt: "", template: "hotspot-tracker", enabled: true })
		} finally {
			setSubmitting(false)
		}
	}, [isValid, submitting, formValues, projectId, folderPath, onOpenChange])

	const handleOpenChange = useCallback(
		(nextOpen: boolean) => {
			if (submitting) return
			onOpenChange(nextOpen)
		},
		[submitting, onOpenChange],
	)

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="!max-w-[750px]">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Sparkles size={18} className="text-primary" />
						{t("detail.aiCard.createDialog.title")}
					</DialogTitle>
					<DialogDescription>
						{t("detail.aiCard.createDialog.description")}
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 py-4">
					<AICardFormFields
						values={formValues}
						onChange={handleChange}
						disabled={submitting}
						modelList={modelList}
						imageModelList={imageModelList}
						videoModelList={videoModelList}
					/>
				</div>

				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={submitting}
					>
						{t("detail.aiCard.createDialog.cancel")}
					</Button>
					<Button onClick={handleSubmit} disabled={!isValid || submitting}>
						{submitting && <Loader2 size={14} className="mr-1.5 animate-spin" />}
						{submitting
							? t("detail.aiCard.createDialog.creating")
							: t("detail.aiCard.createDialog.confirm")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

export default AICardCreateDialog
