import { useTranslation } from "react-i18next"

import { MicroAppLoadingIllustration } from "@/pages/superMagic/components/MicroAppStateIllustration"

interface MicroAppPageLoadingStateProps {
	mobile?: boolean
	testId?: string
}

export default function MicroAppPageLoadingState({
	mobile = false,
	testId = "micro-app-page-loading",
}: MicroAppPageLoadingStateProps) {
	const { t } = useTranslation("super")

	return (
		<div
			className="flex h-full min-h-[280px] w-full flex-col items-center justify-center px-6 text-center"
			data-testid={testId}
			data-mobile={mobile}
			role="status"
			aria-live="polite"
		>
			<MicroAppLoadingIllustration
				size="md"
				className={mobile ? "w-[148px]" : "w-[180px]"}
				testId={`${testId}-illustration`}
			/>
			<p className="mt-4 text-sm font-medium text-foreground">
				{t("microAppPage.loading.title")}
			</p>
			<p className="mt-1 text-xs leading-5 text-muted-foreground">
				{t("microAppPage.loading.description")}
			</p>
		</div>
	)
}
