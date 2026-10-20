import { FileQuestion } from "lucide-react"
import { Link } from "react-router-dom"
import { EmptyState } from "@magic-admin-v2/components/empty-state"
import { useTranslation } from "react-i18next"

export default function NotFoundPage() {
	const { t } = useTranslation()

	return (
		<div className="space-y-6" data-testid="not-found-page">
			<EmptyState
				icon={FileQuestion}
				testId="not-found-empty"
				title={t("notFound.title")}
				description={t("notFound.description")}
			/>
			<div className="flex justify-center">
				<Link
					data-testid="not-found-back-button"
					className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
					to="/overview"
				>
					{t("common.backToOverview")}
				</Link>
			</div>
		</div>
	)
}
