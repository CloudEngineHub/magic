import { memo } from "react"
import { Flex, Switch, InputNumber, Select } from "antd"
import { useTranslation } from "react-i18next"
import { MobileCard, StatusTag } from "@admin-components"
import type { PlatformPackage } from "@admin/types/platformPackage"

interface EmployeeMarketCardProps {
	data?: PlatformPackage.AgentMarketItem
	onClick?: (data: PlatformPackage.AgentMarketItem) => void
	publishStatusMap: Record<string, { text: string; color: string }>
	publisherTypeMap: Record<string, string>
	categoryOptions: Array<{ label: string; value: string }>
	categorySavingIds: Set<string>
	featuredSavingIds: Set<string>
	hiddenSavingIds: Set<string>
	sortSavingIds: Set<string>
	sortOrderMap: Record<string, number>
	setSortOrderMap: React.Dispatch<React.SetStateAction<Record<string, number>>>
	debouncedAutoSaveSortOrder: (id: string, sortOrder: number, previousSortOrder?: number) => void
	handleChangeCategory: (
		record: PlatformPackage.AgentMarketItem,
		nextCategoryIds?: string[],
	) => void
	handleChangeFeatured: (record: PlatformPackage.AgentMarketItem, nextFeatured: boolean) => void
	handleChangeHidden: (record: PlatformPackage.AgentMarketItem, nextHidden: boolean) => void
	getLocalizedText: (value?: PlatformPackage.NameI18N | string) => string
	getCategoryName: (record: PlatformPackage.AgentMarketItem) => string
	hasEditRight: boolean
}

function getAgentMarketCategoryIds(data: PlatformPackage.AgentMarketItem) {
	if (Array.isArray(data.category_ids)) return data.category_ids.filter(Boolean)
	return data.category_id ? [data.category_id] : []
}

function EmployeeMarketCard({
	data,
	onClick,
	publishStatusMap,
	publisherTypeMap,
	categoryOptions,
	categorySavingIds,
	featuredSavingIds,
	hiddenSavingIds,
	sortSavingIds,
	sortOrderMap,
	setSortOrderMap,
	debouncedAutoSaveSortOrder,
	handleChangeCategory,
	handleChangeFeatured,
	handleChangeHidden,
	getLocalizedText,
	getCategoryName,
	hasEditRight,
}: EmployeeMarketCardProps) {
	const { t } = useTranslation("admin/platform/employeeMarket")
	const { t: tCommon } = useTranslation("admin/common")

	if (!data) return null

	const publishInfo = publishStatusMap[data.publish_status]
	const categoryIds = getAgentMarketCategoryIds(data)

	return (
		<MobileCard title={getLocalizedText(data.name_i18n)} onClick={() => onClick?.(data)}>
			<Flex vertical gap={6}>
				<span>
					{t("employeeCode")}: {data.agent_code || "-"}
				</span>
				<span>
					{t("publisherType")}:{" "}
					{publisherTypeMap[data.publisher_type || ""] || data.publisher_type || "-"}
				</span>
				<span>
					{t("installCount")}: {data.install_count ?? "-"}
				</span>
				<span>
					{t("publisher")}: {data.publisher?.nickname || "-"}
				</span>
				<span>
					{t("createdAt")}: {data.created_at || "-"}
				</span>
				{publishInfo && (
					<StatusTag color={publishInfo.color} bordered={false}>
						{publishInfo.text}
					</StatusTag>
				)}
				<Flex align="center" gap={6}>
					<span>{t("category.label")}:</span>
					{categoryOptions.length ? (
						<Select
							allowClear
							showSearch
							mode="multiple"
							maxTagCount="responsive"
							optionFilterProp="label"
							style={{ minWidth: 220 }}
							value={categoryIds.length ? categoryIds : undefined}
							placeholder={t("category.uncategorized")}
							options={categoryOptions}
							disabled={categorySavingIds.has(data.id) || !hasEditRight}
							dropdownStyle={{ maxHeight: 320, overflowY: "auto" }}
							onChange={(value) => handleChangeCategory(data, value)}
						/>
					) : (
						<span>{getCategoryName(data)}</span>
					)}
				</Flex>
				<Flex align="center" gap={16} wrap="wrap">
					<Flex align="center" gap={6}>
						<span>{t("isFeatured")}:</span>
						<Switch
							size="small"
							checked={Boolean(data.is_featured)}
							loading={featuredSavingIds.has(data.id)}
							disabled={featuredSavingIds.has(data.id) || !hasEditRight}
							onChange={(next) => {
								if (next === Boolean(data.is_featured)) return
								handleChangeFeatured(data, next)
							}}
						/>
					</Flex>
					<Flex align="center" gap={6}>
						<span>{t("isHidden")}:</span>
						<Switch
							size="small"
							checked={Boolean(data.is_hidden)}
							loading={hiddenSavingIds.has(data.id)}
							disabled={hiddenSavingIds.has(data.id) || !hasEditRight}
							onChange={(next) => {
								if (next === Boolean(data.is_hidden)) return
								handleChangeHidden(data, next)
							}}
						/>
					</Flex>
				</Flex>
				<Flex align="center" gap={6}>
					<span>{tCommon("sortOrder")}:</span>
					<InputNumber
						min={0}
						precision={0}
						style={{ width: 100 }}
						value={sortOrderMap[data.id]}
						disabled={sortSavingIds.has(data.id) || !hasEditRight}
						onChange={(value) => {
							const nextSortOrder = Number(value ?? 0)
							setSortOrderMap((prev) => ({ ...prev, [data.id]: nextSortOrder }))
							if (nextSortOrder === (data.sort_order ?? 0)) return
							debouncedAutoSaveSortOrder(data.id, nextSortOrder, data.sort_order)
						}}
					/>
				</Flex>
			</Flex>
		</MobileCard>
	)
}

export default memo(EmployeeMarketCard)
