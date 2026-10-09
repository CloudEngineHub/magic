import { useTranslation } from "react-i18next"
import { FilterControlField } from "@magic-admin-v2/components/filter-control-field"
import { FilterSearchInput } from "@magic-admin-v2/components/filter-search-input"
import {
	ListFilterPanel,
	type ListFilterPanelFieldsProps,
} from "@magic-admin-v2/components/list-filter-panel"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@magic-admin-v2/components/ui/select"
import { ALL_VALUE } from "@magic-admin-v2/features/platform-system-capabilities/consts"

export type CapabilityFilterDraft = {
	keyword: string
	status: string
}

export function createDefaultCapabilityFilterDraft(): CapabilityFilterDraft {
	return { keyword: "", status: ALL_VALUE }
}

export function CapabilityFilters({
	onChange,
	value,
}: {
	onChange: (value: CapabilityFilterDraft) => void
	value: CapabilityFilterDraft
}) {
	const { t } = useTranslation()

	return (
		<ListFilterPanel
			applyLabel={t("systemCapabilities.filter.apply")}
			createDefaultValue={createDefaultCapabilityFilterDraft}
			onChange={(patch) => onChange({ ...value, ...patch })}
			onReset={() => onChange(createDefaultCapabilityFilterDraft())}
			renderFields={(props) => <CapabilityFilterFields {...props} />}
			resetLabel={t("systemCapabilities.action.reset")}
			title={t("systemCapabilities.filter.title")}
			value={value}
		/>
	)
}

function CapabilityFilterFields({
	onChange,
	value,
}: ListFilterPanelFieldsProps<CapabilityFilterDraft>) {
	const { t } = useTranslation()

	return (
		<>
			<FilterControlField label={t("systemCapabilities.filter.keyword")}>
				<FilterSearchInput
					aria-label={t("systemCapabilities.filter.keyword")}
					clearLabel={t("common.clear")}
					onValueChange={(keyword) => onChange({ keyword })}
					placeholder={t("systemCapabilities.placeholder.keyword")}
					value={value.keyword}
				/>
			</FilterControlField>
			<FilterControlField label={t("systemCapabilities.filter.status")}>
				<Select onValueChange={(status) => onChange({ status })} value={value.status}>
					<SelectTrigger className="w-full">
						<SelectValue placeholder={t("systemCapabilities.filter.status")} />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value={ALL_VALUE}>
							{t("systemCapabilities.filter.allStatuses")}
						</SelectItem>
						<SelectItem value="enabled">{t("common.enabled")}</SelectItem>
						<SelectItem value="disabled">{t("common.disabled")}</SelectItem>
					</SelectContent>
				</Select>
			</FilterControlField>
		</>
	)
}
