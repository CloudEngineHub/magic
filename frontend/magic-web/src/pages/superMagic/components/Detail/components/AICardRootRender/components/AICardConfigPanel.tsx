import { memo, useEffect } from "react"
import { motion } from "framer-motion"
import { useMemoizedFn } from "ahooks"
import { useTranslation } from "react-i18next"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/shadcn-ui/button"
import MagicSpin from "@/components/base/MagicSpin"
import { useAICardConfig } from "../hooks/useAICardConfig"
import type { AICardStore } from "../stores/AICardStore"
import AICardFormFields from "./AICardFormFields"

interface AICardConfigPanelProps {
	store: AICardStore
	onBack?: () => void
}

function AICardConfigPanel({ store, onBack }: AICardConfigPanelProps) {
	const { t } = useTranslation("super")
	const {
		formValues,
		updateFormValues,
		loadConfig,
		saveConfig,
		saving,
		loadingDetail,
		modelList,
		imageModelList,
		videoModelList,
	} = useAICardConfig(store)

	useEffect(() => {
		loadConfig()
	}, [loadConfig])

	const handleSave = useMemoizedFn(() => {
		saveConfig(formValues)
	})

	const handleBack = useMemoizedFn(() => {
		if (onBack) {
			onBack()
		} else {
			store.setViewMode("dashboard")
		}
	})

	const isValid = formValues.taskName.trim() && formValues.prompt.trim() && formValues.timeConfig

	if (loadingDetail) {
		return (
			<div className="flex h-full items-center justify-center">
				<MagicSpin spinning />
			</div>
		)
	}

	return (
		<motion.div
			initial={{ opacity: 0, y: 10 }}
			animate={{ opacity: 1, y: 0 }}
			exit={{ opacity: 0, y: -10 }}
			transition={{ duration: 0.25 }}
			className="flex h-full flex-col overflow-hidden"
		>
			{/* Header */}
			<div className="flex items-center gap-3 border-b border-border px-6 py-4">
				{store.hasConfig && (
					<button
						type="button"
						onClick={handleBack}
						className="flex items-center justify-center rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
					>
						<ArrowLeft size={18} />
					</button>
				)}
				<h2 className="text-lg font-semibold text-foreground">
					{store.hasConfig
						? t("detail.aiCard.config.editTitle")
						: t("detail.aiCard.config.createTitle")}
				</h2>
			</div>

			{/* Form body */}
			<div className="flex-1 overflow-y-auto px-6 py-6">
				<div className="mx-auto max-w-lg space-y-6">
					<AICardFormFields
						values={formValues}
						onChange={updateFormValues}
						modelList={modelList}
						imageModelList={imageModelList}
						videoModelList={videoModelList}
						advancedExpanded
					/>
				</div>
			</div>

			{/* Footer actions */}
			<div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4">
				{store.hasConfig && (
					<Button variant="outline" onClick={handleBack} disabled={saving}>
						{t("detail.aiCard.config.cancel")}
					</Button>
				)}
				<Button onClick={handleSave} disabled={!isValid || saving}>
					{saving ? t("detail.aiCard.config.saving") : t("detail.aiCard.config.save")}
				</Button>
			</div>
		</motion.div>
	)
}

export default memo(AICardConfigPanel)
