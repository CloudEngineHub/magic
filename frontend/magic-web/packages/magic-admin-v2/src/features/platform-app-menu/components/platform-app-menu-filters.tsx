import { Filter } from "lucide-react"
import { useState, type Dispatch, type SetStateAction } from "react"
import { useTranslation } from "react-i18next"
import { FilterControlField } from "@magic-admin-v2/components/filter-control-field"
import { FilterSearchInput } from "@magic-admin-v2/components/filter-search-input"
import { FilterSheet } from "@magic-admin-v2/components/filter-sheet"
import { Button } from "@magic-admin-v2/components/ui/button"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@magic-admin-v2/components/ui/select"
import {
	APP_MENU_ALL_VALUE,
	createDefaultAppMenuFilterDraft,
	type AppMenuFilterDraft,
} from "@magic-admin-v2/features/platform-app-menu/utils"
import { appMenuStatus } from "@magic-admin-v2/features/platform-app-menu/types"

interface PlatformAppMenuFiltersProps {
	onChange: Dispatch<SetStateAction<AppMenuFilterDraft>>
	onSearchValueChange: (value: string) => void
	value: AppMenuFilterDraft
}

export function PlatformAppMenuFilters({
	onChange,
	onSearchValueChange,
	value,
}: PlatformAppMenuFiltersProps) {
	const { t } = useTranslation()
	const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false)
	const [mobileDraft, setMobileDraft] = useState<AppMenuFilterDraft>(() =>
		createDefaultAppMenuFilterDraft(),
	)

	function handleFilterSheetOpenChange(open: boolean) {
		setIsFilterSheetOpen(open)
		if (open) setMobileDraft(value)
	}

	function resetMobileFilters() {
		setMobileDraft(createDefaultAppMenuFilterDraft())
	}

	function applyMobileFilters() {
		onChange((previous) => ({
			...previous,
			name: mobileDraft.name,
			status: mobileDraft.status,
		}))
		setIsFilterSheetOpen(false)
	}

	return (
		<>
			<div className="space-y-3" data-testid="app-menu-filters">
				<div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
					<div className="flex min-w-0 flex-1 gap-2 md:flex-wrap md:items-center">
						<FilterControlField
							className="min-w-0 flex-1 md:flex-none md:w-[340px] xl:w-[420px]"
							label={t("appMenu.filter.name")}
						>
							<FilterSearchInput
								aria-label={t("appMenu.filter.name")}
								clearLabel={t("common.clear")}
								containerClassName="min-w-0"
								clearButtonTestId="app-menu-name-clear-button"
								inputTestId="app-menu-name-input"
								onValueChange={onSearchValueChange}
								placeholder={t("appMenu.placeholder.searchName")}
								value={value.name}
							/>
						</FilterControlField>

						<div className="hidden flex-wrap items-center gap-2 md:flex">
							<AppMenuFilterSelects
								filterDraft={value}
								setFilterDraft={onChange}
								testId="app-menu-status-trigger"
							/>
						</div>

						<div className="shrink-0 self-end md:hidden">
							<Button
								aria-label={t("appMenu.filter.title")}
								data-testid="app-menu-advanced-trigger"
								onClick={() => handleFilterSheetOpenChange(true)}
								size="icon"
								type="button"
								variant="outline"
							>
								<Filter className="size-4" aria-hidden="true" />
							</Button>
						</div>
					</div>
				</div>
			</div>

			<FilterSheet
				applyLabel={t("appMenu.filter.apply")}
				applyButtonTestId="app-menu-advanced-apply-button"
				bodyTestId="app-menu-advanced-body"
				closeButtonTestId="app-menu-advanced-close-button"
				contentTestId="app-menu-advanced-content"
				description={t("appMenu.filter.description")}
				onApply={applyMobileFilters}
				onOpenChange={handleFilterSheetOpenChange}
				onReset={resetMobileFilters}
				open={isFilterSheetOpen}
				presentation="mobile-only"
				resetButtonTestId="app-menu-advanced-reset-button"
				resetLabel={t("appMenu.action.reset")}
				title={t("appMenu.filter.title")}
			>
				<FilterControlField className="w-full" label={t("appMenu.filter.name")}>
					<FilterSearchInput
						aria-label={t("appMenu.filter.name")}
						clearLabel={t("common.clear")}
						containerClassName="min-w-0"
						clearButtonTestId="app-menu-advanced-name-clear-button"
						inputTestId="app-menu-advanced-name-input"
						onValueChange={(name) =>
							setMobileDraft((previous) => ({ ...previous, name }))
						}
						placeholder={t("appMenu.placeholder.searchName")}
						value={mobileDraft.name}
					/>
				</FilterControlField>
				<AppMenuFilterSelects
					filterDraft={mobileDraft}
					setFilterDraft={setMobileDraft}
					testId="app-menu-advanced-status-trigger"
					variant="sheet"
				/>
			</FilterSheet>
		</>
	)
}

function AppMenuFilterSelects({
	filterDraft,
	setFilterDraft,
	testId,
	variant = "inline",
}: {
	filterDraft: AppMenuFilterDraft
	setFilterDraft: Dispatch<SetStateAction<AppMenuFilterDraft>>
	testId?: string
	variant?: "inline" | "sheet"
}) {
	const { t } = useTranslation()
	const triggerClassName = variant === "sheet" ? "w-full" : "w-fit max-w-full"

	return (
		<FilterControlField
			className={variant === "sheet" ? "w-full" : "w-fit"}
			label={t("appMenu.filter.status")}
		>
			<Select
				value={filterDraft.status}
				onValueChange={(status) =>
					setFilterDraft((previous) => ({ ...previous, status }))
				}
			>
				<SelectTrigger
					aria-label={t("appMenu.filter.status")}
					className={triggerClassName}
					data-testid={testId}
				>
					<SelectValue />
				</SelectTrigger>
				<SelectContent data-testid="platform-app-menu-filter-content">
					<SelectItem value={APP_MENU_ALL_VALUE} data-testid="platform-app-menu-option">{t("appMenu.filter.statusAll")}</SelectItem>
					<SelectItem value={String(appMenuStatus.enabled)} data-testid="platform-app-menu-option">{t("appMenu.status.enabled")}</SelectItem>
					<SelectItem value={String(appMenuStatus.disabled)} data-testid="platform-app-menu-option">{t("appMenu.status.disabled")}</SelectItem>
				</SelectContent>
			</Select>
		</FilterControlField>
	)
}
