import type { Dispatch, SetStateAction } from "react"
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
import {
	createDefaultFilterDraft,
	selectAllValue,
	type FilterDraft,
} from "@magic-admin-v2/features/platform-official-staff/utils/page-utils"

export function StaffFilters({
	onChange,
	value,
}: {
	onChange: Dispatch<SetStateAction<FilterDraft>>
	value: FilterDraft
}) {
	const { t } = useTranslation()

	return (
		<ListFilterPanel
			applyLabel={t("officialStaff.action.applyFilters")}
			createDefaultValue={createDefaultFilterDraft}
			onChange={(patch) => onChange((previous) => ({ ...previous, ...patch }))}
			onReset={() => onChange(createDefaultFilterDraft())}
			renderFields={(props) => <StaffFilterFields {...props} />}
			resetLabel={t("officialStaff.action.reset")}
			title={t("officialStaff.filter.title")}
			value={value}
		/>
	)
}

function StaffFilterFields({ onChange, value }: ListFilterPanelFieldsProps<FilterDraft>) {
	const { t } = useTranslation()

	return (
		<>
			<FilterControlField label={t("officialStaff.filter.keyword")}>
				<FilterSearchInput
					aria-label={t("officialStaff.filter.keyword")}
					clearLabel={t("common.clear")}
					onValueChange={(keyword) => onChange({ keyword })}
					placeholder={t("officialStaff.placeholder.keyword")}
					value={value.keyword}
				/>
			</FilterControlField>
			<FilterControlField label={t("officialStaff.filter.identifier")}>
				<FilterSearchInput
					aria-label={t("officialStaff.filter.identifier")}
					clearLabel={t("common.clear")}
					onValueChange={(identifier) => onChange({ identifier })}
					placeholder={t("officialStaff.placeholder.identifier")}
					value={value.identifier}
				/>
			</FilterControlField>
			<FilterControlField label={t("officialStaff.filter.status")}>
				<Select onValueChange={(status) => onChange({ status })} value={value.status}>
					<SelectTrigger className="w-full">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value={selectAllValue}>
							{t("officialStaff.filter.allStatuses")}
						</SelectItem>
						<SelectItem value="1">{t("common.enabled")}</SelectItem>
						<SelectItem value="0">{t("common.disabled")}</SelectItem>
					</SelectContent>
				</Select>
			</FilterControlField>
		</>
	)
}
