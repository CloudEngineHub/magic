import { useState } from "react"
import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/shadcn-ui/alert-dialog"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/shadcn-ui/select"
import { cn } from "@/lib/utils"
import { usePublishPanelStore } from "../context"
import { getPublishToCopyKeys, getPublishToUiKey } from "../publishCopy"
import type { PublishTo } from "../types"
import PublishInternalTargetSection from "./PublishInternalTargetSection"

const publishToOrder: PublishTo[] = ["INTERNAL", "MARKET"]

interface PublishTargetFieldsProps {
	disabled?: boolean
}

export default observer(function PublishTargetFields({
	disabled = false,
}: PublishTargetFieldsProps) {
	const { t } = useTranslation("crew/market")
	const store = usePublishPanelStore()
	const [pendingPublishTo, setPendingPublishTo] = useState<PublishTo | null>(null)
	const availablePublishTo = publishToOrder.filter((item) =>
		store.availablePublishTo.includes(item),
	)
	const handleSelectPublishTo = (nextPublishTo: PublishTo) => {
		if (store.isPublishToSelected(nextPublishTo)) return
		if (store.currentPublishTo && nextPublishTo !== store.currentPublishTo) {
			setPendingPublishTo(nextPublishTo)
			return
		}

		store.selectPublishTo(nextPublishTo)
	}

	return (
		<>
			<div className="flex flex-col gap-4" data-testid="skill-publish-target-fields">
				<p className="flex items-center gap-1 text-base font-medium text-foreground">
					{t("skillEditPage.publishPanel.create.fields.target.label")}
					<span className="text-destructive" aria-hidden="true">
						*
					</span>
				</p>

				<div className="grid gap-5 md:grid-cols-2">
					{availablePublishTo.map((publishTo) => (
						<PublishToCard
							key={publishTo}
							publishTo={publishTo}
							selected={store.isPublishToSelected(publishTo)}
							onSelect={handleSelectPublishTo}
							disabled={disabled}
						/>
					))}
				</div>

				{store.draft.publishTo === "INTERNAL" ? (
					<PublishInternalTargetSection disabled={disabled} />
				) : (
					<>
						<MarketCategoryField disabled={disabled} />
						<PublishingProcess />
					</>
				)}
			</div>
			<AlertDialog
				open={Boolean(pendingPublishTo)}
				onOpenChange={(open) => {
					if (!open) setPendingPublishTo(null)
				}}
			>
				<AlertDialogContent size="sm">
					<AlertDialogHeader>
						<AlertDialogTitle>
							{t("skillEditPage.publishPanel.create.channelChangeConfirm.title")}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{t("skillEditPage.publishPanel.create.channelChangeConfirm.content")}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>
							{t("skillEditPage.publishPanel.actions.cancel")}
						</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => {
								if (pendingPublishTo) store.selectPublishTo(pendingPublishTo)
								setPendingPublishTo(null)
							}}
						>
							{t("skillEditPage.publishPanel.create.channelChangeConfirm.confirm")}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	)
})

const CATEGORY_PLACEHOLDER = "__placeholder__"

const MarketCategoryField = observer(function MarketCategoryField({
	disabled = false,
}: {
	disabled?: boolean
}) {
	const { t } = useTranslation("crew/market")
	const store = usePublishPanelStore()

	if (store.marketCategories.length === 0) return null

	return (
		<div className="flex flex-col gap-1.5" data-testid="skill-publish-category-field">
			<label className="flex items-center gap-1 text-base font-medium text-foreground">
				{t("skillEditPage.publishPanel.create.fields.category.label")}
				<span className="text-destructive" aria-hidden="true">
					*
				</span>
				<span className="sr-only">
					{t("skillEditPage.publishPanel.create.fields.category.required")}
				</span>
			</label>
			<Select
				value={store.draft.categoryId || CATEGORY_PLACEHOLDER}
				onValueChange={(value) => {
					if (value === CATEGORY_PLACEHOLDER) return
					store.setCategoryId(value)
				}}
				disabled={disabled}
			>
				<SelectTrigger
					className="h-9 w-full"
					aria-required="true"
					data-testid="skill-publish-category-select"
				>
					<SelectValue
						placeholder={t(
							"skillEditPage.publishPanel.create.fields.category.placeholder",
						)}
					/>
				</SelectTrigger>
				<SelectContent className="max-h-64">
					<SelectItem value={CATEGORY_PLACEHOLDER} disabled>
						{t("skillEditPage.publishPanel.create.fields.category.placeholder")}
					</SelectItem>
					{store.marketCategories.map((category) => (
						<SelectItem key={category.id} value={category.id}>
							{category.name}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	)
})

function PublishToCard({
	publishTo,
	selected,
	onSelect,
	disabled = false,
}: {
	publishTo: PublishTo
	selected: boolean
	onSelect: (publishTo: PublishTo) => void
	disabled?: boolean
}) {
	const { t } = useTranslation("crew/market")
	const store = usePublishPanelStore()
	const copy = getPublishToCopyKeys({
		publishTo,
		marketCopy: store.marketCopy,
	})
	const publishToUiKey = getPublishToUiKey(publishTo)

	return (
		<button
			type="button"
			className={cn(
				"flex w-full items-start gap-3 rounded-lg border bg-card p-3 text-left transition-colors",
				selected ? "border-foreground" : "border-border",
			)}
			onClick={() => onSelect(publishTo)}
			disabled={disabled}
			data-testid={`skill-publish-to-${publishToUiKey}`}
		>
			<div
				className={cn(
					"mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border",
					selected ? "border-primary bg-primary" : "border-input bg-background",
				)}
				aria-hidden="true"
			>
				<div
					className={cn(
						"size-2 rounded-full",
						selected ? "bg-primary-foreground" : "bg-transparent",
					)}
				/>
			</div>
			<div className="min-w-0 flex-1">
				<p className="text-sm font-medium leading-none text-foreground">
					{t(copy.labelKey)}
				</p>
				<p className="mt-1.5 text-sm leading-5 text-muted-foreground">
					{t(copy.descriptionKey)}
				</p>
			</div>
		</button>
	)
}

function PublishingProcess() {
	const { t } = useTranslation("crew/market")
	const steps = [
		t("skillEditPage.publishPanel.create.fields.target.skillsLibrary.steps.submit"),
		t("skillEditPage.publishPanel.create.fields.target.skillsLibrary.steps.review"),
		t("skillEditPage.publishPanel.create.fields.target.skillsLibrary.steps.published"),
	]

	return (
		<div className="flex flex-col gap-2" data-testid="skill-publish-process-section">
			<p className="text-base font-medium text-foreground">
				{t("skillEditPage.publishPanel.create.fields.publishingProcess.label")}
			</p>
			<div
				className="flex flex-wrap items-center justify-center gap-8 rounded-md border border-border bg-card px-3 py-6"
				data-testid="skill-publish-process-card"
			>
				{steps.map((step, index) => (
					<div key={step} className="flex items-center gap-3">
						<div
							className={cn(
								"flex size-8 items-center justify-center rounded-full border text-sm font-semibold leading-none",
								index === 0
									? "border-primary bg-primary text-primary-foreground"
									: "border-border bg-background text-muted-foreground",
							)}
						>
							{index + 1}
						</div>
						<p
							className={cn(
								"text-sm leading-none",
								index === 0 ? "text-foreground" : "text-muted-foreground",
							)}
						>
							{step}
						</p>
					</div>
				))}
			</div>
		</div>
	)
}
