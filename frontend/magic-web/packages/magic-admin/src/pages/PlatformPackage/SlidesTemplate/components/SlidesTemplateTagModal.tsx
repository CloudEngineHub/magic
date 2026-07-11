import { memo, useEffect, useMemo, useState } from "react"
import { Button, Flex, InputNumber, Select, Switch, Table, message } from "antd"
import type { TablePaginationConfig, TableProps } from "antd"
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
import { SlidesTemplate } from "@admin/types/slidesTemplate"
import { getSlidesTemplateStatusByChecked, resolveSlidesTemplateTagName } from "../utils"
import { OverflowTooltipText } from "./OverflowTooltipText"
import { SlidesTemplateTagFormModal } from "./SlidesTemplateTagFormModal"

type TagItem = SlidesTemplate.TagItem
type TagParams = SlidesTemplate.TagQueryParams

const TAG_COLUMN_WIDTH = {
	name: 160,
	code: 220,
	updatedAt: 170,
} as const

interface SlidesTemplateTagModalProps extends MagicModalProps {
	hasEditRight: boolean
	onSuccess?: () => void
}

export const SlidesTemplateTagModal = memo(
	({ hasEditRight, onCancel, onSuccess, ...rest }: SlidesTemplateTagModalProps) => {
		const { t } = useTranslation("admin/common")
		const { SlidesTemplateApi } = useApis()
		const openModal = useOpenModal()
		const [data, setData] = useState<TagItem[]>([])
		const [total, setTotal] = useState(0)
		const [params, setParams] = useState<TagParams>({ page: 1, page_size: 20 })
		const [filterDraft, setFilterDraft] = useState({
			keyword: "",
			code: "",
			status: undefined as SlidesTemplate.Status | undefined,
		})
		const [formOpen, setFormOpen] = useState(false)
		const [selectedRow, setSelectedRow] = useState<TagItem | null>(null)
		const [statusLoadingIds, setStatusLoadingIds] = useState<Set<string>>(new Set())
		const [sortLoadingIds, setSortLoadingIds] = useState<Set<string>>(new Set())

		const { run, loading } = useRequest(
			(nextParams: TagParams) => SlidesTemplateApi.tag.query(nextParams),
			{
				manual: true,
				onSuccess: (res) => {
					setData(res.list)
					setTotal(res.total)
				},
			},
		)

		useEffect(() => {
			if (!rest.open) return
			run(params)
		}, [rest.open, run])

		const refresh = useMemoizedFn((nextParams = params) => {
			run(nextParams)
			onSuccess?.()
		})

		const submitFilters = useMemoizedFn(() => {
			const nextParams: TagParams = {
				page: 1,
				page_size: params.page_size,
				keyword: filterDraft.keyword.trim() || undefined,
				code: filterDraft.code.trim() || undefined,
				status: filterDraft.status ?? null,
			}
			setParams(nextParams)
			run(nextParams)
		})

		const resetFilters = useMemoizedFn(() => {
			const nextParams: TagParams = { page: 1, page_size: params.page_size }
			setFilterDraft({ keyword: "", code: "", status: undefined })
			setParams(nextParams)
			run(nextParams)
		})

		const statusLabel = useMemoizedFn((status: SlidesTemplate.Status) => {
			return status === SlidesTemplate.StatusMap.enabled
				? t("slidesTemplate.status.enabled")
				: t("slidesTemplate.status.disabled")
		})

		const handleStatusChange = useMemoizedFn((record: TagItem, checked: boolean) => {
			const status = getSlidesTemplateStatusByChecked(checked)
			setStatusLoadingIds((prev) => new Set([...prev, record.id]))
			SlidesTemplateApi.tag
				.updateStatus(record.id, status)
				.then(() => {
					message.success(t("message.updateSuccess"))
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

		const handleSortChange = useMemoizedFn((record: TagItem, sort: number | null) => {
			const nextSort = sort ?? 0
			if (nextSort === record.sort) return
			setSortLoadingIds((prev) => new Set([...prev, record.id]))
			SlidesTemplateApi.tag
				.updateSort(record.id, nextSort)
				.then(() => {
					message.success(t("message.updateSuccess"))
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

		const handleDelete = useMemoizedFn((record: TagItem) => {
			openModal(WarningModal, {
				open: true,
				content: resolveSlidesTemplateTagName(record),
				onOk: () => {
					SlidesTemplateApi.tag.delete(record.id).then(() => {
						message.success(t("message.deleteSuccess"))
						refresh()
					})
				},
			})
		})

		const handleTableChange = useMemoizedFn((pagination: TablePaginationConfig) => {
			const nextParams = {
				...params,
				page: pagination.current,
				page_size: pagination.pageSize,
			}
			setParams(nextParams)
			run(nextParams)
		})

		const columns: TableProps<TagItem>["columns"] = useMemo(
			() => [
				{
					title: t("slidesTemplate.tag.columns.name"),
					dataIndex: "name_i18n",
					key: "name_i18n",
					width: TAG_COLUMN_WIDTH.name,
					ellipsis: { showTitle: false },
					render: (_, record) => (
						<OverflowTooltipText
							text={resolveSlidesTemplateTagName(record)}
							style={{ maxWidth: TAG_COLUMN_WIDTH.name }}
						/>
					),
				},
				{
					title: t("slidesTemplate.tag.columns.code"),
					dataIndex: "code",
					key: "code",
					width: TAG_COLUMN_WIDTH.code,
					ellipsis: { showTitle: false },
					render: (value: string) => (
						<OverflowTooltipText
							text={value}
							style={{ maxWidth: TAG_COLUMN_WIDTH.code }}
						/>
					),
				},
				{
					title: t("slidesTemplate.tag.columns.templateCount"),
					dataIndex: "template_count",
					key: "template_count",
					width: 100,
				},
				{
					title: t("slidesTemplate.tag.columns.status"),
					dataIndex: "status",
					key: "status",
					width: 120,
					render: (value: SlidesTemplate.Status, record) => (
						<Switch
							checked={value === SlidesTemplate.StatusMap.enabled}
							checkedChildren={statusLabel(SlidesTemplate.StatusMap.enabled)}
							unCheckedChildren={statusLabel(SlidesTemplate.StatusMap.disabled)}
							loading={statusLoadingIds.has(record.id)}
							disabled={!hasEditRight || statusLoadingIds.has(record.id)}
							onChange={(checked) => handleStatusChange(record, checked)}
						/>
					),
				},
				{
					title: t("sortOrder"),
					dataIndex: "sort",
					key: "sort",
					width: 120,
					render: (value: number, record) => (
						<InputNumber
							key={`${record.id}-${value}`}
							defaultValue={value}
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
					title: t("slidesTemplate.tag.columns.updatedAt"),
					dataIndex: "updated_at",
					key: "updated_at",
					width: TAG_COLUMN_WIDTH.updatedAt,
					ellipsis: { showTitle: false },
					render: (value: string) => (
						<OverflowTooltipText
							text={value}
							style={{ maxWidth: TAG_COLUMN_WIDTH.updatedAt }}
						/>
					),
				},
				{
					title: t("operate"),
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
								{t("button.edit")}
							</Button>
							<Button
								type="link"
								danger
								style={{ padding: 0 }}
								disabled={!hasEditRight}
								onClick={() => handleDelete(record)}
							>
								{t("button.delete")}
							</Button>
						</Flex>
					),
				},
			],
			[
				t,
				statusLabel,
				statusLoadingIds,
				hasEditRight,
				handleStatusChange,
				sortLoadingIds,
				handleSortChange,
				handleDelete,
			],
		)

		return (
			<MagicModal
				width={980}
				title={t("slidesTemplate.tag.manageTitle")}
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
							placeholder={t("slidesTemplate.tag.filters.keyword")}
							style={{ width: 180 }}
							onChange={(event) =>
								setFilterDraft((prev) => ({
									...prev,
									keyword: event.target.value,
								}))
							}
							onPressEnter={submitFilters}
						/>
						<MagicInput
							value={filterDraft.code}
							placeholder={t("slidesTemplate.tag.filters.code")}
							style={{ width: 220 }}
							onChange={(event) =>
								setFilterDraft((prev) => ({ ...prev, code: event.target.value }))
							}
							onPressEnter={submitFilters}
						/>
						<Select
							allowClear
							value={filterDraft.status}
							placeholder={t("slidesTemplate.tag.filters.status")}
							style={{ width: 140 }}
							options={[
								{ label: statusLabel(SlidesTemplate.StatusMap.enabled), value: 1 },
								{ label: statusLabel(SlidesTemplate.StatusMap.disabled), value: 0 },
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
							{t("button.search")}
						</MagicButton>
						<MagicButton onClick={resetFilters}>{t("button.reset")}</MagicButton>
						<MagicButton icon={<IconRefresh size={16} />} onClick={() => refresh()}>
							{t("button.reload")}
						</MagicButton>
						<MagicButton
							type="primary"
							disabled={!hasEditRight}
							onClick={() => {
								setSelectedRow(null)
								setFormOpen(true)
							}}
						>
							{t("slidesTemplate.tag.addButton")}
						</MagicButton>
					</Flex>
					<Table<TagItem>
						columns={columns}
						dataSource={data}
						rowKey="id"
						loading={loading}
						scroll={{ x: "max-content", y: 420 }}
						pagination={{
							current: params.page,
							pageSize: params.page_size,
							total,
							showSizeChanger: true,
							showTotal: (value) => t("totalItems", { total: value }),
						}}
						onChange={handleTableChange}
					/>
				</Flex>
				{formOpen && (
					<SlidesTemplateTagFormModal
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
