import { Loader2, Plus, Trash2 } from "lucide-react"
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react"
import { Controller, useWatch, type Control, type UseFormReturn } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { DialogFormField } from "@magic-admin-v2/components/form/dialog-form-field"
import { FieldError } from "@magic-admin-v2/components/form/field-error"
import { Button } from "@magic-admin-v2/components/ui/button"
import { Input } from "@magic-admin-v2/components/ui/input"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@magic-admin-v2/components/ui/select"
import { Switch } from "@magic-admin-v2/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@magic-admin-v2/components/ui/tabs"
import { useProviderModelPricingTemplatesQuery } from "@magic-admin-v2/features/platform-model-list/queries"
import {
	type ProviderModelCategory,
	type ProviderModelPricingEntry,
	type ProviderModelPricingMode,
	type ProviderModelPricingTemplate,
} from "@magic-admin-v2/features/platform-model-list/types"
import {
	buildIndependentPricingSteps,
	buildPricingBillingTiers,
	createEmptyPricingEntry,
	createPricingEntries,
	createPricingEntriesFromBillingTiers,
	createPricingEntriesFromLegacyPricing,
	getFollowSourceBillingObject,
	hasLegacyPricing,
	isCostPricingObject,
	isTextTokenPricingTemplate,
	getPricingUnit,
	normalizeDependentPricingEntries,
	textTokenBillingObjects,
	type PricingUnit,
} from "@magic-admin-v2/features/platform-model-list/utils/pricing"
import {
	getDefaultBillingType,
	getErrorMessage,
} from "@magic-admin-v2/features/platform-model-list/utils/model-editor"
import type {
	ModelEditorValues,
	ProviderBindingErrors,
} from "@magic-admin-v2/features/platform-model-list/utils/model-editor-schema"
import type { ProviderListItem } from "@magic-admin-v2/features/platform-provider-list/types"
import { cn } from "@magic-admin-v2/utils/cn"

export function ModelPricingFields({
	category,
	control,
	disabled,
	focusBillingObject,
	form,
	index,
	providers,
}: {
	category: ProviderModelCategory
	control: Control<ModelEditorValues>
	disabled: boolean
	focusBillingObject?: string
	form: UseFormReturn<ModelEditorValues>
	index: number
	providers: ProviderListItem[]
}) {
	const { t } = useTranslation()
	const providerId = useWatch({ control, name: `providers.${index}.service_provider_config_id` })
	const billingType = useWatch({ control, name: `providers.${index}.billing_type` })
	const billingCurrency = useWatch({ control, name: `providers.${index}.billing_currency` })
	const pricingEntries = useWatch({ control, name: `providers.${index}.pricing_entries` })
	const selectedProvider = providers.find((provider) => provider.id === providerId)
	const pricingTemplatesQuery = useProviderModelPricingTemplatesQuery({
		category,
		providerCode: selectedProvider?.provider_code,
	})
	const templates = useMemo(() => pricingTemplatesQuery.data ?? [], [pricingTemplatesQuery.data])
	const selectedTemplate = useMemo(
		() =>
			templates.find(
				(template) =>
					template.billing_type === billingType || template.code === billingType,
			),
		[billingType, templates],
	)
	const hasSelectedTemplate = Boolean(selectedTemplate)
	const resolvedTemplate = selectedTemplate ?? templates[0]
	const previousProviderIdRef = useRef(providerId)
	const billingTypeField = `providers.${index}.billing_type` as const
	const pricingTemplateField = `providers.${index}.pricing_template` as const
	const pricingEntriesField = `providers.${index}.pricing_entries` as const
	const billingTiersField = `providers.${index}.billing_tiers` as const
	const hydratingPricingRef = useRef(false)

	useEffect(() => {
		if (previousProviderIdRef.current === providerId) {
			return
		}

		previousProviderIdRef.current = providerId
		form.setValue(billingTypeField, getDefaultBillingType(category), { shouldDirty: true })
		form.setValue(pricingTemplateField, null, { shouldDirty: true })
		form.setValue(pricingEntriesField, {}, { shouldDirty: true })
		form.setValue(billingTiersField, [], { shouldDirty: true })
		form.setValue(`providers.${index}.legacy_pricing`, {}, { shouldDirty: true })
		hydratingPricingRef.current = false
	}, [
		billingTiersField,
		billingTypeField,
		category,
		form,
		index,
		pricingEntriesField,
		pricingTemplateField,
		providerId,
	])

	useEffect(() => {
		if (!resolvedTemplate) {
			return
		}

		const providerPrefix = `providers.${index}` as const
		const currentPricingTemplate = form.getValues(`${providerPrefix}.pricing_template`)
		const currentPricingEntries = form.getValues(`${providerPrefix}.pricing_entries`)
		if (
			currentPricingTemplate?.code === resolvedTemplate.code &&
			Object.keys(currentPricingEntries ?? {}).length
		) {
			return
		}

		if (!hasSelectedTemplate) {
			form.setValue(`${providerPrefix}.billing_type`, resolvedTemplate.billing_type, {
				shouldDirty: false,
			})
		}

		const currentBillingTiers = form.getValues(`${providerPrefix}.billing_tiers`)
		const currentLegacyPricing = form.getValues(`${providerPrefix}.legacy_pricing`)
		const currentBillingType = hasSelectedTemplate
			? form.getValues(`${providerPrefix}.billing_type`)
			: resolvedTemplate.billing_type
		const hasSavedBillingTiers =
			Boolean(currentBillingTiers?.length) && !Object.keys(currentPricingEntries ?? {}).length
		const hasSavedLegacyPricing =
			!hasSavedBillingTiers && hasLegacyPricing(currentLegacyPricing)
		const nextPricingEntries = hasSavedBillingTiers
			? createPricingEntriesFromBillingTiers(resolvedTemplate, currentBillingTiers)
			: hasSavedLegacyPricing
				? createPricingEntriesFromLegacyPricing(
						resolvedTemplate,
						currentLegacyPricing,
						currentBillingType,
						category,
					)
				: createPricingEntries(resolvedTemplate)

		form.setValue(`${providerPrefix}.pricing_template`, resolvedTemplate, {
			shouldDirty: false,
		})
		hydratingPricingRef.current = true
		form.setValue(`${providerPrefix}.pricing_entries`, nextPricingEntries, {
			shouldDirty: false,
		})
		if (!hasSavedBillingTiers) {
			form.setValue(
				`${providerPrefix}.billing_tiers`,
				hasSavedLegacyPricing
					? buildPricingBillingTiers(resolvedTemplate, nextPricingEntries)
					: [],
				{ shouldDirty: false },
			)
		}
	}, [category, form, index, providerId, resolvedTemplate, hasSelectedTemplate])

	useEffect(() => {
		if (!selectedTemplate || !Object.keys(pricingEntries ?? {}).length) {
			return
		}

		form.setValue(
			billingTiersField,
			buildPricingBillingTiers(selectedTemplate, pricingEntries ?? {}),
			{ shouldDirty: !hydratingPricingRef.current },
		)
		hydratingPricingRef.current = false
	}, [billingTiersField, form, pricingEntries, selectedTemplate])

	function handleTemplateChange(nextBillingType: string) {
		const nextTemplate = templates.find((template) => template.billing_type === nextBillingType)
		form.setValue(billingTypeField, nextBillingType, {
			shouldDirty: true,
			shouldValidate: true,
		})
		form.setValue(pricingTemplateField, nextTemplate ?? null, { shouldDirty: true })
		form.setValue(pricingEntriesField, createPricingEntries(nextTemplate), {
			shouldDirty: true,
		})
		form.setValue(billingTiersField, [], { shouldDirty: true })
	}

	function updatePricingEntry(billingObject: string, patch: Partial<ProviderModelPricingEntry>) {
		const nextEntries = {
			...(pricingEntries ?? {}),
			[billingObject]: {
				...(pricingEntries?.[billingObject] ?? createEmptyPricingEntry()),
				...patch,
			},
		}
		const normalizedEntries = selectedTemplate
			? normalizeDependentPricingEntries(selectedTemplate, nextEntries)
			: nextEntries
		const dependencyChanged = Object.entries(normalizedEntries).some(([entryKey, entry]) => {
			const previous = nextEntries[entryKey]
			return previous?.mode !== entry.mode
		})

		form.setValue(pricingEntriesField, normalizedEntries, { shouldDirty: true })
		if (dependencyChanged) {
			toast.warning(t("modelList.editor.pricingFollowReset"))
		}
	}

	return (
		<>
			<div className="grid gap-4 sm:grid-cols-2">
				<DialogFormField
					description={t("modelList.editor.fieldDesc.currency")}
					descriptionMode="text"
					fieldId={`provider-${index}-billing-currency`}
					label={t("modelList.editor.field.currency")}
				>
					<Controller
						control={control}
						name={`providers.${index}.billing_currency`}
						render={({ field }) => (
							<Select
								disabled={disabled}
								onValueChange={field.onChange}
								value={field.value}
							>
								<SelectTrigger
									className="w-full"
									id={`provider-${index}-billing-currency`}
								>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="CNY">
										{t("modelList.editor.currency.cny")}
									</SelectItem>
									<SelectItem value="USD">
										{t("modelList.editor.currency.usd")}
									</SelectItem>
								</SelectContent>
							</Select>
						)}
					/>
				</DialogFormField>

				<DialogFormField
					description={t("modelList.editor.fieldDesc.pricingTemplate")}
					descriptionMode="text"
					fieldId={`provider-${index}-pricing-template`}
					label={t("modelList.editor.field.pricingTemplate")}
				>
					<Select
						disabled={
							disabled ||
							!selectedProvider ||
							pricingTemplatesQuery.isLoading ||
							!templates.length
						}
						onValueChange={handleTemplateChange}
						value={selectedTemplate?.billing_type ?? ""}
					>
						<SelectTrigger className="w-full" id={`provider-${index}-pricing-template`}>
							<SelectValue
								placeholder={t("modelList.editor.placeholder.pricingTemplate")}
							/>
						</SelectTrigger>
						<SelectContent>
							{templates.map((template) => (
								<SelectItem key={template.code} value={template.billing_type}>
									{template.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</DialogFormField>
			</div>

			{!selectedProvider ? (
				<p className="text-xs text-muted-foreground">
					{t("modelList.editor.pricingProviderRequired")}
				</p>
			) : null}
			{pricingTemplatesQuery.isLoading ? (
				<p className="flex items-center gap-2 text-xs text-muted-foreground">
					<Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
					{t("modelList.editor.pricingTemplateLoading")}
				</p>
			) : null}
			{selectedProvider && pricingTemplatesQuery.isError ? (
				<p className="text-xs text-destructive">
					{t("modelList.editor.pricingTemplateLoadFailed")}
				</p>
			) : null}
			{selectedProvider &&
			!pricingTemplatesQuery.isLoading &&
			!pricingTemplatesQuery.isError &&
			!templates.length ? (
				<p className="text-xs text-muted-foreground">
					{t("modelList.editor.pricingTemplateEmpty")}
				</p>
			) : null}

			{selectedTemplate ? (
				<div className="grid gap-4">
					<p className="text-xs text-muted-foreground">
						{t("modelList.editor.pricingHint")}
					</p>
					{isTextTokenPricingTemplate(selectedTemplate) ? (
						<PricingDimensionTabs
							currency={billingCurrency}
							disabled={disabled}
							entries={pricingEntries ?? {}}
							focusBillingObject={focusBillingObject}
							onChangeEntry={updatePricingEntry}
							providerIndex={index}
							template={selectedTemplate}
						/>
					) : (
						<GenericPricingSections
							billingType={billingType}
							category={category}
							currency={billingCurrency}
							disabled={disabled}
							entries={pricingEntries ?? {}}
							focusBillingObject={focusBillingObject}
							template={selectedTemplate}
							onChangeEntry={updatePricingEntry}
							providerIndex={index}
						/>
					)}
					<FieldError
						className="text-sm"
						message={getErrorMessage(
							(
								form.formState.errors.providers?.[index] as
									| ProviderBindingErrors
									| undefined
							)?.pricing_entries?.message,
						)}
					/>
				</div>
			) : null}
		</>
	)
}

type PricingDimension = "price" | "cost"

function PricingDimensionSection({
	currency,
	disabled,
	dimension,
	entries,
	onChangeEntry,
	providerIndex,
	template,
}: {
	currency: "CNY" | "USD"
	disabled: boolean
	dimension: PricingDimension
	entries: Record<string, ProviderModelPricingEntry>
	onChangeEntry: (billingObject: string, patch: Partial<ProviderModelPricingEntry>) => void
	providerIndex: number
	template: ProviderModelPricingTemplate
}) {
	const { t } = useTranslation()
	const items = template.items.filter((item) =>
		dimension === "cost"
			? isCostPricingObject(item.billing_object)
			: !isCostPricingObject(item.billing_object),
	)

	return (
		<section
			className="grid gap-4"
			aria-label={
				dimension === "price"
					? t("modelList.editor.pricing.priceTitle")
					: t("modelList.editor.pricing.costTitle")
			}
		>
			{items.map((item) => (
				<TokenPricingEntry
					currency={currency}
					disabled={disabled}
					entry={entries[item.billing_object] ?? createEmptyPricingEntry()}
					entries={entries}
					fieldId={`providers.${providerIndex}.pricing_entries.${item.billing_object}`}
					item={item}
					key={item.billing_object}
					onChange={(patch) => onChangeEntry(item.billing_object, patch)}
					template={template}
				/>
			))}
		</section>
	)
}

function PricingDimensionTabs({
	currency,
	disabled,
	entries,
	focusBillingObject,
	onChangeEntry,
	providerIndex,
	template,
}: {
	currency: "CNY" | "USD"
	disabled: boolean
	entries: Record<string, ProviderModelPricingEntry>
	focusBillingObject?: string
	onChangeEntry: (billingObject: string, patch: Partial<ProviderModelPricingEntry>) => void
	providerIndex: number
	template: ProviderModelPricingTemplate
}) {
	const { t } = useTranslation()
	const [activeDimension, setActiveDimension] = useState<PricingDimension>(() =>
		focusBillingObject && isCostPricingObject(focusBillingObject) ? "cost" : "price",
	)

	useEffect(() => {
		if (focusBillingObject) {
			setActiveDimension(isCostPricingObject(focusBillingObject) ? "cost" : "price")
		}
	}, [focusBillingObject])

	return (
		<Tabs
			className="grid gap-4"
			onValueChange={(value) => setActiveDimension(value as PricingDimension)}
			value={activeDimension}
		>
			<TabsList className="h-9 w-fit gap-5">
				<TabsTrigger className="h-9 text-sm" value="price">
					{t("modelList.editor.pricing.priceTitle")}
				</TabsTrigger>
				<TabsTrigger className="h-9 text-sm" value="cost">
					{t("modelList.editor.pricing.costTitle")}
				</TabsTrigger>
			</TabsList>
			<TabsContent className="m-0 data-[state=inactive]:hidden" value="price">
				<PricingDimensionSection
					currency={currency}
					dimension="price"
					disabled={disabled}
					entries={entries}
					onChangeEntry={onChangeEntry}
					providerIndex={providerIndex}
					template={template}
				/>
			</TabsContent>
			<TabsContent className="m-0 data-[state=inactive]:hidden" value="cost">
				<PricingDimensionSection
					currency={currency}
					dimension="cost"
					disabled={disabled}
					entries={entries}
					onChangeEntry={onChangeEntry}
					providerIndex={providerIndex}
					template={template}
				/>
			</TabsContent>
		</Tabs>
	)
}

function TokenPricingEntry({
	currency,
	disabled,
	entries,
	entry,
	fieldId,
	item,
	onChange,
	template,
}: {
	currency: "CNY" | "USD"
	disabled: boolean
	entries: Record<string, ProviderModelPricingEntry>
	entry: ProviderModelPricingEntry
	fieldId: string
	item: ProviderModelPricingTemplate["items"][number]
	onChange: (patch: Partial<ProviderModelPricingEntry>) => void
	template: ProviderModelPricingTemplate
}) {
	const { t } = useTranslation()
	const currentBase = textTokenBillingObjects.find(
		(base) =>
			getFollowSourceBillingObject(template, item.billing_object, base) ===
			item.billing_object,
	)
	const isFollowMode = entry.mode !== "fixed" && entry.mode !== "ladder"
	const directSource = isFollowMode
		? getFollowSourceBillingObject(template, item.billing_object, entry.mode)
		: undefined
	const sourceEntry = directSource ? entries[directSource] : undefined
	const sourceLabel = directSource
		? template.items.find((templateItem) => templateItem.billing_object === directSource)?.label
		: undefined

	function handleModeChange(nextMode: ProviderModelPricingMode) {
		if (nextMode === "fixed") {
			onChange({ mode: nextMode })
			return
		}

		if (nextMode === "ladder") {
			onChange({
				mode: nextMode,
				steps: buildIndependentPricingSteps(entry.steps, sourceEntry?.steps),
			})
			return
		}

		const nextSource = getFollowSourceBillingObject(template, item.billing_object, nextMode)
		const nextSourceSteps = nextSource ? (entries[nextSource]?.steps ?? []) : []
		onChange({
			mode: nextMode,
			steps: nextSourceSteps.map((_, stepIndex) => ({
				max: "",
				price: entry.steps[stepIndex]?.price ?? "",
			})),
		})
	}

	function updateStep(
		stepIndex: number,
		patch: Partial<ProviderModelPricingEntry["steps"][number]>,
	) {
		onChange({
			steps: entry.steps.map((step, currentIndex) =>
				currentIndex === stepIndex ? { ...step, ...patch } : step,
			),
		})
	}

	return (
		<div className="grid gap-3 rounded-md bg-muted/40 p-4">
			<div className="flex items-center justify-between gap-3">
				<div className="flex min-w-0 items-center gap-2">
					<span className="shrink-0 text-sm font-medium">{item.label}</span>
					<span className="shrink-0 text-xs text-muted-foreground">
						{t("modelList.editor.field.pricingMode")}
					</span>
					<Select
						disabled={disabled || !entry.enabled}
						onValueChange={(value) =>
							handleModeChange(value as ProviderModelPricingMode)
						}
						value={entry.mode}
					>
						<SelectTrigger
							aria-label={t("modelList.editor.field.pricingMode")}
							className="h-7 w-44 min-w-0 border-border bg-background px-2 text-xs shadow-none hover:bg-muted/50 focus:ring-1"
						>
							<SelectValue />
						</SelectTrigger>
						<SelectContent className="!w-max max-w-[calc(100vw-3rem)]">
							<SelectItem className="whitespace-nowrap text-xs" value="fixed">
								{t("modelList.editor.pricingMode.fixed")}
							</SelectItem>
							<SelectItem className="whitespace-nowrap text-xs" value="ladder">
								{t("modelList.editor.pricingMode.ladder")}
							</SelectItem>
							{textTokenBillingObjects
								.filter((base) => base !== currentBase)
								.map((sourceBase) => {
									const sourceBillingObject = getFollowSourceBillingObject(
										template,
										item.billing_object,
										sourceBase,
									)!
									const followSource = entries[sourceBillingObject]
									const label =
										template.items.find(
											(templateItem) =>
												templateItem.billing_object === sourceBillingObject,
										)?.label ?? sourceBase
									return (
										<SelectItem
											className="whitespace-nowrap text-xs"
											disabled={
												!followSource?.enabled ||
												followSource.mode !== "ladder"
											}
											key={sourceBase}
											value={sourceBase}
										>
											{t("modelList.editor.pricingMode.follow", { label })}
										</SelectItem>
									)
								})}
						</SelectContent>
					</Select>
				</div>
				<div className="flex items-center gap-2">
					<span className="text-xs text-muted-foreground">
						{entry.enabled
							? t("modelList.editor.pricing.enabled")
							: t("modelList.editor.pricing.disabled")}
					</span>
					<Switch
						checked={entry.enabled}
						disabled={disabled}
						onCheckedChange={(enabled) => onChange({ enabled })}
					/>
				</div>
			</div>

			{isFollowMode ? (
				<p className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
					{t("modelList.editor.pricingFollowHint", { label: sourceLabel ?? "" })}
				</p>
			) : null}

			{entry.mode === "fixed" ? (
				<DialogFormField
					fieldId={`${fieldId}-value`}
					label={t("modelList.editor.field.priceValue")}
				>
					<PricingAmountInput
						currency={currency}
						unit="millionTokens"
						disabled={disabled || !entry.enabled}
						fieldId={fieldId}
						inputId={`${fieldId}-value`}
						onChange={(event) => onChange({ value: event.target.value })}
						placeholder={t("modelList.editor.placeholder.price")}
						value={entry.value}
					/>
				</DialogFormField>
			) : (
				<div className="grid gap-2">
					{entry.steps.map((step, stepIndex) => {
						const isLast = stepIndex === entry.steps.length - 1
						const startValue =
							stepIndex === 0
								? "0"
								: (isFollowMode
										? sourceEntry?.steps[stepIndex - 1]?.max
										: entry.steps[stepIndex - 1]?.max) || "0"
						const endValue = isFollowMode
							? (sourceEntry?.steps[stepIndex]?.max ?? "")
							: step.max
						return (
							<div
								className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_minmax(0,1.4fr)_auto] sm:items-end"
								key={`${item.billing_object}-${stepIndex}`}
							>
								{stepIndex === 0 ? (
									<DialogFormField
										fieldId={`${fieldId}-range-start`}
										label={t("modelList.editor.field.rangeStart")}
									>
										<TokenBoundaryInput
											disabled
											id={`${fieldId}-range-start`}
											value={startValue}
										/>
									</DialogFormField>
								) : (
									<TokenBoundaryInput disabled value={startValue} />
								)}
								<span className="hidden pb-2 text-xs text-muted-foreground sm:inline">
									≤ Tokens &lt;
								</span>
								{stepIndex === 0 ? (
									<DialogFormField
										fieldId={`${fieldId}-range-end`}
										label={t("modelList.editor.field.rangeEnd")}
									>
										<TokenBoundaryInput
											id={`${fieldId}-range-end`}
											disabled={
												disabled || !entry.enabled || isFollowMode || isLast
											}
											onChange={(event) =>
												updateStep(stepIndex, { max: event.target.value })
											}
											placeholder={
												isLast
													? t("modelList.editor.noLimit")
													: t(
															"modelList.editor.placeholder.tokenRangeEnd",
														)
											}
											value={isLast ? "" : endValue}
										/>
									</DialogFormField>
								) : (
									<TokenBoundaryInput
										disabled={
											disabled || !entry.enabled || isFollowMode || isLast
										}
										onChange={(event) =>
											updateStep(stepIndex, { max: event.target.value })
										}
										placeholder={
											isLast
												? t("modelList.editor.noLimit")
												: t("modelList.editor.placeholder.tokenRangeEnd")
										}
										value={isLast ? "" : endValue}
									/>
								)}
								{stepIndex === 0 ? (
									<DialogFormField
										fieldId={`${fieldId}-step-price`}
										label={t("modelList.editor.field.priceValue")}
									>
										<PricingAmountInput
											currency={currency}
											unit="millionTokens"
											disabled={disabled || !entry.enabled}
											fieldId={fieldId}
											inputId={`${fieldId}-step-price`}
											onChange={(event) =>
												updateStep(stepIndex, { price: event.target.value })
											}
											placeholder={t("modelList.editor.placeholder.price")}
											value={step.price}
										/>
									</DialogFormField>
								) : (
									<PricingAmountInput
										currency={currency}
										unit="millionTokens"
										disabled={disabled || !entry.enabled}
										fieldId={fieldId}
										onChange={(event) =>
											updateStep(stepIndex, { price: event.target.value })
										}
										placeholder={t("modelList.editor.placeholder.price")}
										value={step.price}
									/>
								)}
								{entry.mode === "ladder" ? (
									<div className="flex h-9 items-center gap-1">
										<Button
											aria-label={t("modelList.editor.action.addPricingTier")}
											disabled={disabled || !entry.enabled}
											onClick={() =>
												onChange({
													steps: [
														...entry.steps.slice(0, stepIndex + 1),
														{ max: "", price: "" },
														...entry.steps.slice(stepIndex + 1),
													],
												})
											}
											size="icon"
											type="button"
											variant="outline"
										>
											<Plus className="size-4" aria-hidden="true" />
										</Button>
										<Button
											aria-label={t(
												"modelList.editor.action.removePricingTier",
											)}
											disabled={
												disabled ||
												!entry.enabled ||
												entry.steps.length <= 1
											}
											onClick={() =>
												onChange({
													steps: entry.steps
														.filter(
															(_, currentIndex) =>
																currentIndex !== stepIndex,
														)
														.map(
															(
																currentStep,
																currentIndex,
																nextSteps,
															) =>
																currentIndex ===
																nextSteps.length - 1
																	? { ...currentStep, max: "" }
																	: currentStep,
														),
												})
											}
											size="icon"
											type="button"
											variant="ghost"
										>
											<Trash2 className="size-4" aria-hidden="true" />
										</Button>
									</div>
								) : null}
							</div>
						)
					})}
				</div>
			)}
		</div>
	)
}

function TokenBoundaryInput({
	disabled,
	id,
	onChange,
	placeholder,
	value,
}: {
	disabled: boolean
	id?: string
	onChange?: (event: ChangeEvent<HTMLInputElement>) => void
	placeholder?: string
	value: string
}) {
	return (
		<div
			className={cn(
				"flex h-9 overflow-hidden rounded-md border border-input bg-card shadow-sm",
				disabled && "cursor-not-allowed opacity-50",
			)}
		>
			<Input
				className="h-full min-w-0 flex-1 rounded-none border-0 bg-transparent px-3 shadow-none focus-visible:ring-0 disabled:opacity-100"
				disabled={disabled}
				id={id}
				inputMode="numeric"
				min="0"
				onChange={onChange}
				onWheel={(event) => event.currentTarget.blur()}
				placeholder={placeholder}
				type="number"
				value={value}
			/>
			<span className="flex shrink-0 items-center border-l bg-muted/40 px-2 text-xs text-muted-foreground">
				K
			</span>
		</div>
	)
}

function GenericPricingSections({
	billingType,
	category,
	currency,
	disabled,
	entries,
	focusBillingObject,
	onChangeEntry,
	providerIndex,
	template,
}: {
	billingType: string
	category: ProviderModelCategory
	currency: "CNY" | "USD"
	disabled: boolean
	entries: Record<string, ProviderModelPricingEntry>
	focusBillingObject?: string
	onChangeEntry: (billingObject: string, patch: Partial<ProviderModelPricingEntry>) => void
	providerIndex: number
	template: ProviderModelPricingTemplate
}) {
	const { t } = useTranslation()
	const [activeDimension, setActiveDimension] = useState<PricingDimension>(() =>
		focusBillingObject && isCostPricingObject(focusBillingObject) ? "cost" : "price",
	)

	useEffect(() => {
		if (focusBillingObject) {
			setActiveDimension(isCostPricingObject(focusBillingObject) ? "cost" : "price")
		}
	}, [focusBillingObject])

	return (
		<Tabs
			className="grid gap-4"
			onValueChange={(value) => setActiveDimension(value as PricingDimension)}
			value={activeDimension}
		>
			<TabsList className="h-9 w-fit gap-5">
				<TabsTrigger className="h-9 text-sm" value="price">
					{t("modelList.editor.pricing.priceTitle")}
				</TabsTrigger>
				<TabsTrigger className="h-9 text-sm" value="cost">
					{t("modelList.editor.pricing.costTitle")}
				</TabsTrigger>
			</TabsList>
			{(["price", "cost"] as const).map((dimension) => (
				<TabsContent
					className="m-0 data-[state=inactive]:hidden"
					key={dimension}
					value={dimension}
				>
					<section
						aria-label={
							dimension === "price"
								? t("modelList.editor.pricing.priceTitle")
								: t("modelList.editor.pricing.costTitle")
						}
						className="grid gap-4"
					>
						{template.items
							.filter((item) =>
								dimension === "cost"
									? isCostPricingObject(item.billing_object)
									: !isCostPricingObject(item.billing_object),
							)
							.map((item) => (
								<GenericPricingEntry
									billingObject={item.billing_object}
									billingType={billingType}
									category={category}
									currency={currency}
									disabled={disabled}
									entry={
										entries[item.billing_object] ?? createEmptyPricingEntry()
									}
									fieldId={`providers.${providerIndex}.pricing_entries.${item.billing_object}`}
									item={item}
									key={item.billing_object}
									onChange={(patch) => onChangeEntry(item.billing_object, patch)}
								/>
							))}
					</section>
				</TabsContent>
			))}
		</Tabs>
	)
}

function GenericPricingEntry({
	billingObject,
	billingType,
	category,
	currency,
	disabled,
	entry,
	fieldId,
	item,
	onChange,
}: {
	billingObject: string
	billingType: string
	category: ProviderModelCategory
	currency: "CNY" | "USD"
	disabled: boolean
	entry: ProviderModelPricingEntry
	fieldId: string
	item: ProviderModelPricingTemplate["items"][number]
	onChange: (patch: Partial<ProviderModelPricingEntry>) => void
}) {
	const { t } = useTranslation()

	return (
		<div className="grid gap-3 rounded-md bg-muted/40 p-4">
			<div className="flex items-center justify-between gap-4">
				<span className="min-w-0 text-sm font-medium">{item.label}</span>
				<div className="flex shrink-0 items-center gap-2">
					<span className="text-xs text-muted-foreground">
						{entry.enabled
							? t("modelList.editor.pricing.enabled")
							: t("modelList.editor.pricing.disabled")}
					</span>
					<Switch
						checked={entry.enabled}
						disabled={disabled}
						onCheckedChange={(enabled) => onChange({ enabled })}
					/>
				</div>
			</div>
			<PricingAmountInput
				currency={currency}
				unit={getPricingUnit(billingType, category, billingObject)}
				disabled={disabled || !entry.enabled}
				fieldId={fieldId}
				onChange={(event) => onChange({ value: event.target.value })}
				placeholder={t("modelList.editor.placeholder.price")}
				value={entry.value}
			/>
		</div>
	)
}

function PricingAmountInput({
	currency,
	disabled,
	fieldId,
	inputId,
	onChange,
	placeholder,
	value,
	unit,
}: {
	currency: "CNY" | "USD"
	disabled: boolean
	fieldId?: string
	inputId?: string
	onChange: (event: ChangeEvent<HTMLInputElement>) => void
	placeholder: string
	value: string
	unit: PricingUnit
}) {
	const { t } = useTranslation()

	return (
		<div
			className={cn(
				"flex h-9 overflow-hidden rounded-md border border-input bg-card shadow-sm transition-colors focus-within:ring-2 focus-within:ring-ring",
				disabled && "cursor-not-allowed opacity-50",
			)}
			data-model-editor-field={fieldId}
		>
			<span className="flex shrink-0 items-center border-r bg-muted/40 px-3 text-sm text-muted-foreground">
				{currency === "CNY" ? "¥" : "$"}
			</span>
			<Input
				className="h-full min-w-0 flex-1 rounded-none border-0 bg-transparent px-3 shadow-none focus-visible:ring-0 disabled:opacity-100"
				disabled={disabled}
				id={inputId ?? fieldId}
				inputMode="decimal"
				min="0"
				onChange={onChange}
				placeholder={placeholder}
				step="any"
				type="number"
				value={value}
			/>
			<span className="flex shrink-0 items-center border-l bg-muted/40 px-3 text-xs text-muted-foreground">
				{t(`modelList.editor.pricingUnit.${unit}`)}
			</span>
		</div>
	)
}
