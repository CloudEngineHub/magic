import { memo, useEffect, useMemo, useState } from "react"
import { Button, Flex, InputNumber, Select, Switch, Table, message } from "antd"
import type { TableProps } from "antd"
import { useMemoizedFn, useRequest } from "ahooks"
import { useTranslation } from "react-i18next"
import { IconRefresh, IconSearch } from "@tabler/icons-react"
import {
	MagicButton,
	MagicInput,
	MagicModal,
	WarningModal,
	type MagicModalProps,
} from "@admin-components"
import { useApis } from "@admin/apis"
import { useOpenModal } from "@admin/hooks/useOpenModal"
import type { PlatformPackage } from "@admin/types/platformPackage"
import { AgentMarketCategoryStatusMap } from "@admin/types/platformPackage/market"
import { getAgentMarketCategoryStatusByChecked, resolveAgentMarketCategoryName } from "../utils"
import { AgentMarketCategoryFormModal } from "./AgentMarketCategoryFormModal"

type CategoryItem = PlatformPackage.AgentMarketCategoryItem
type CategoryParams = PlatformPackage.GetAgentMarketCategoryListParams

const CATEGORY_COLUMN_WIDTH = {
	name: 180,
	updatedAt: 180,
} as const

interface AgentMarketCategoryModalProps extends MagicModalProps {
	hasEditRight: boolean
	onSuccess?: () => void
}

export const AgentMarketCategoryModal = memo(
	({ hasEditRight, onCancel, onSuccess, ...rest }: AgentMarketCategoryModalProps) => {
		const { t } = useTranslation("admin/platform/employeeMarket")
		const { t: tCommon } = useTranslation("admin/common")
		const { PlatformPackageApi } = useApis()
		const openModal = useOpenModal()
		const [data, setData] = useState<CategoryItem[]>([])
		const [params, setParams] = useState<CategoryParams>({})
		const [filterDraft, setFilterDraft] = useState({
			keyword: "",
			status: undefined as PlatformPackage.AgentMarketCategoryStatus | undefined,
		})
		const [formOpen, setFormOpen] = useState(false)
		const [selectedRow, setSelectedRow] = useState<CategoryItem | null>(null)
		const [statusLoadingIds, setStatusLoadingIds] = useState<Set<string>>(new Set())
		const [sortLoadingIds, setSortLoadingIds] = useState<Set<string>>(new Set())

		const { run, loading } = useRequest(
			(nextParams: CategoryParams) =>
				PlatformPackageApi.getAgentMarketCategoryList(nextParams),
			{
				manual: true,
				onSuccess: (res) => {
					setData(res.list)
				},
			},
		)

		const fetchList = useMemoizedFn((nextParams: CategoryParams = params) => {
			run(nextParams)
		})

		useEffect(() => {
			if (!rest.open) return
			fetchList()
		}, [fetchList, rest.open])

		const refresh = useMemoizedFn((nextParams = params) => {
			fetchList(nextParams)
			onSuccess?.()
		})

		const submitFilters = useMemoizedFn(() => {
			const nextParams: CategoryParams = {
				keyword: filterDraft.keyword.trim() || undefined,
				status: filterDraft.status ?? null,
			}
			setParams(nextParams)
			run(nextParams)
		})

		const resetFilters = useMemoizedFn(() => {
			const nextParams: CategoryParams = {}
			setFilterDraft({ keyword: "", status: undefined })
			setParams(nextParams)
			run(nextParams)
		})

		const statusLabel = useMemoizedFn((status: PlatformPackage.AgentMarketCategoryStatus) => {
			return status === AgentMarketCategoryStatusMap.visible
				? t("category.status.visible")
				: t("category.status.hidden")
		})

		const handleStatusChange = useMemoizedFn((record: CategoryItem, checked: boolean) => {
			const status = getAgentMarketCategoryStatusByChecked(checked)
			setStatusLoadingIds((prev) => new Set([...prev, record.id]))
			PlatformPackageApi.updateAgentMarketCategory(record.id, { status })
				.then(() => {
					message.success(tCommon("message.updateSuccess"))
					refresh()
				})
				.finally(() => {
					setStatusLoadingIds((prev) => {
						const next = new Set(prev)
						next.delete(record.id)
						return next
					})
				})
		})

		const handleSortChange = useMemoizedFn((record: CategoryItem, sortOrder: number | null) => {
			const nextSortOrder = sortOrder ?? 0
			if (nextSortOrder === (record.sort_order ?? 0)) return
			setSortLoadingIds((prev) => new Set([...prev, record.id]))
			PlatformPackageApi.updateAgentMarketCategory(record.id, { sort_order: nextSortOrder })
				.then(() => {
					message.success(tCommon("message.updateSuccess"))
					refresh()
				})
				.finally(() => {
					setSortLoadingIds((prev) => {
						const next = new Set(prev)
						next.delete(record.id)
						return next
					})
				})
		})

		const handleDelete = useMemoizedFn((record: CategoryItem) => {
			openModal(WarningModal, {
				open: true,
				content: resolveAgentMarketCategoryName(record),
				onOk: () => {
					PlatformPackageApi.deleteAgentMarketCategory(record.id).then(() => {
						message.success(tCommon("message.deleteSuccess"))
						refresh()
					})
				},
			})
		})

		const columns: TableProps<CategoryItem>["columns"] = useMemo(
			() => [
				{
					title: t("category.columns.name"),
					dataIndex: "name_i18n",
					key: "name_i18n",
					width: CATEGORY_COLUMN_WIDTH.name,
					ellipsis: true,
					render: (_, record) => resolveAgentMarketCategoryName(record),
				},
				{
					title: t("category.columns.status"),
					dataIndex: "status",
					key: "status",
					width: 120,
					render: (
						value: PlatformPackage.AgentMarketCategoryStatus | undefined,
						record,
					) => {
						const status = value ?? AgentMarketCategoryStatusMap.visible
						return (
							<Switch
								checked={status === AgentMarketCategoryStatusMap.visible}
								checkedChildren={statusLabel(AgentMarketCategoryStatusMap.visible)}
								unCheckedChildren={statusLabel(AgentMarketCategoryStatusMap.hidden)}
								loading={statusLoadingIds.has(record.id)}
								disabled={!hasEditRight || statusLoadingIds.has(record.id)}
								onChange={(checked) => handleStatusChange(record, checked)}
							/>
						)
					},
				},
				{
					title: t("sortOrder"),
					dataIndex: "sort_order",
					key: "sort_order",
					width: 120,
					render: (value: number | undefined, record) => (
						<InputNumber
							key={`${record.id}-${value ?? 0}`}
							min={0}
							precision={0}
							defaultValue={value ?? 0}
							disabled={!hasEditRight || sortLoadingIds.has(record.id)}
							onBlur={(event) =>
								handleSortChange(record, Number(event.target.value || 0))
							}
							onPressEnter={(event) =>
								handleSortChange(record, Number(event.currentTarget.value || 0))
							}
						/>
					),
				},
				{
					title: t("updatedAt"),
					dataIndex: "updated_at",
					key: "updated_at",
					width: CATEGORY_COLUMN_WIDTH.updatedAt,
					ellipsis: true,
					render: (value: string) => value || "-",
				},
				{
					title: tCommon("operate"),
					key: "action",
					width: 120,
					fixed: "right",
					render: (_, record) => (
						<Flex align="center" gap={8}>
							<Button
								type="link"
								style={{ padding: 0 }}
								disabled={!hasEditRight}
								onClick={() => {
									setSelectedRow(record)
									setFormOpen(true)
								}}
							>
								{tCommon("button.edit")}
							</Button>
							<Button
								type="link"
								danger
								style={{ padding: 0 }}
								disabled={!hasEditRight}
								onClick={() => handleDelete(record)}
							>
								{tCommon("button.delete")}
							</Button>
						</Flex>
					),
				},
			],
			[
				t,
				tCommon,
				hasEditRight,
				statusLabel,
				statusLoadingIds,
				handleStatusChange,
				sortLoadingIds,
				handleSortChange,
				handleDelete,
			],
		)

		return (
			<MagicModal
				width={860}
				title={t("category.manageTitle")}
				footer={null}
				onCancel={onCancel}
				centered
				destroyOnHidden
				{...rest}
			>
				<Flex vertical gap={12}>
					<Flex gap={8} wrap="wrap">
						<MagicInput
							value={filterDraft.keyword}
							placeholder={t("category.filters.keyword")}
							style={{ width: 220 }}
							onChange={(event) =>
								setFilterDraft((prev) => ({
									...prev,
									keyword: event.target.value,
								}))
							}
							onPressEnter={submitFilters}
						/>
						<Select
							allowClear
							value={filterDraft.status}
							placeholder={t("category.filters.status")}
							style={{ width: 140 }}
							options={[
								{
									label: statusLabel(AgentMarketCategoryStatusMap.visible),
									value: AgentMarketCategoryStatusMap.visible,
								},
								{
									label: statusLabel(AgentMarketCategoryStatusMap.hidden),
									value: AgentMarketCategoryStatusMap.hidden,
								},
							]}
							onChange={(value) =>
								setFilterDraft((prev) => ({ ...prev, status: value }))
							}
						/>
						<MagicButton
							type="primary"
							icon={<IconSearch size={16} />}
							onClick={submitFilters}
						>
							{t("category.actions.search")}
						</MagicButton>
						<MagicButton onClick={resetFilters}>{tCommon("button.reset")}</MagicButton>
						<MagicButton icon={<IconRefresh size={16} />} onClick={() => refresh()}>
							{tCommon("button.reload")}
						</MagicButton>
						<MagicButton
							type="primary"
							disabled={!hasEditRight}
							onClick={() => {
								setSelectedRow(null)
								setFormOpen(true)
							}}
						>
							{t("category.addButton")}
						</MagicButton>
					</Flex>
					<Table<CategoryItem>
						columns={columns}
						dataSource={data}
						rowKey="id"
						loading={loading}
						scroll={{ x: "max-content", y: 420 }}
						pagination={false}
					/>
				</Flex>
				{formOpen && (
					<AgentMarketCategoryFormModal
						open={formOpen}
						info={selectedRow}
						onCancel={() => setFormOpen(false)}
						onOk={() => setFormOpen(false)}
						onSuccess={() => refresh()}
					/>
				)}
			</MagicModal>
		)
	},
)
