import { motion, useReducedMotion } from "framer-motion"
import { useTranslation } from "react-i18next"

import { MicroAppBuildingIllustration } from "@/pages/superMagic/components/MicroAppStateIllustration"

interface MicroAppBuildingPreviewProps {
	testId?: string
}

const EASE = [0.22, 1, 0.36, 1] as const

export default function MicroAppBuildingPreview({
	testId = "micro-app-preview-building",
}: MicroAppBuildingPreviewProps) {
	const { t } = useTranslation("super")
	const reduceMotion = Boolean(useReducedMotion())

	return (
		<div
			className="relative flex h-full min-h-[320px] flex-col items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_50%_42%,rgba(91,127,234,0.04),transparent_34%)] px-6 text-center"
			data-testid={testId}
			role="status"
			aria-live="polite"
		>
			<div className="pointer-events-none absolute inset-0 opacity-[0.18] [background-image:linear-gradient(rgba(23,32,55,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(23,32,55,0.04)_1px,transparent_1px)] [background-size:32px_32px] [mask-image:radial-gradient(circle_at_center,black,transparent_68%)] dark:opacity-[0.08]" />

			<MicroAppBuildingIllustration
				size="lg"
				animated
				testId="micro-app-building-illustration"
			/>

			<motion.div
				className="relative z-10 mt-6 max-w-sm"
				initial={reduceMotion ? false : { opacity: 0, y: 10 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.55, ease: EASE }}
			>
				<p className="text-base font-semibold text-[#172037] dark:text-white">
					{t("microAppPage.preview.buildingTitle")}
				</p>
				<p className="mt-2 text-sm leading-6 text-muted-foreground">
					{t("microAppPage.preview.buildingDescription")}
				</p>
			</motion.div>
		</div>
	)
}
