import { lazy, useMemo, useState } from "react"
import { Button, Flex, Image, InputNumber, Switch, message } from "antd"
import type { TableProps } from "antd/lib"
import { createStyles } from "antd-style"
import { useDebounceFn, useMemoizedFn, useMount, useRequest } from "ahooks"
import { useTranslation } from "react-i18next"
import { IconCategory } from "@tabler/icons-react"
import type { TableButton } from "@admin-components"
import { MobileList, StatusTag, TableWithFilters, WarningModal } from "@admin-components"
import { useApis } from "@admin/apis"
import { PERMISSION_KEY_MAP } from "@admin/const/common"
import useRights from "@admin/hooks/useRights"
import { useOpenModal } from "@admin/hooks/useOpenModal"
import { usePagination } from "@admin/hooks/usePagination"
import { useIsMobile } from "@admin/hooks/useIsMobile"
import { SlidesTemplate } from "@admin/types/slidesTemplate"
import { SlidesTemplateCategoryModal } from "./components/SlidesTemplateCategoryModal"
import { SlidesTemplateModal } from "./components/SlidesTemplateModal"
import { OverflowTooltipText } from "./components/OverflowTooltipText"
import {
	SlidesTemplateToolbar,
	type SlidesTemplateFilterDraft,
} from "./components/SlidesTemplateToolbar"
import {
	getSlidesTemplateStatusByChecked,
	getSlidesTemplateStatusColor,
	isSystemSlidesTemplate,
	resolveSlidesTemplateCategoryName,
	resolveSlidesTemplateTitle,
} from "./utils"

const SlidesTemplateCard = lazy(() => import("./components/SlidesTemplateCard"))

type DataType = SlidesTemplate.Item
type ParamsType = SlidesTemplate.QueryParams

const COLUMN_WIDTH = {
	name: 180,
	code: 240,
	source: 120,
	category: 220,
	updatedAt: 180,
} as const

const useStyles = createStyles(({ token }) => ({
	container: {
		backgroundColor: token.magicColorUsages.bg[0],
	},
	toolbar: {
		padding: "12px 0",
	},
	cover: {
		width: 96,
		height: 54,
		objectFit: "cover",
		borderRadius: 6,
		backgroundColor: token.magicColorUsages.fill[0],
	},
	linkButton: {
		padding: 0,
	},
}))

export default function SlidesTemplatePage() {
	const { t } = useTranslation("admin/common")
	const { styles } = useStyles()
	const { SlidesTemplateApi } = useApis()
	const openModal = useOpenModal()
	const isMobile = useIsMobile()

	const [open, setOpen] = useState(false)
	const [categoryOpen, setCategoryOpen] = useState(false)
	const [selectedRow, setSelectedRow] = useState<DataType | null>(null)
	const [data, setData] = useState<DataType[]>([])
	const [categories, setCategories] = useState<SlidesTemplate.CategoryItem[]>([])
	const [total, setTotal] = useState(0)
	const [params, setParams] = useState<ParamsType>({ page: 1, page_size: 20 })
	const [filterDraft, setFilterDraft] = useState<SlidesTemplateFilterDraft>({
		keyword: "",
		code: "",
		category_code: undefined,
		status: undefined,
	})
	const [statusLoadingIds, setStatusLoadingIds] = useState<Set<string>>(new Set())
	const [sortLoadingIds, setSortLoadingIds] = useState<Set<string>>(new Set())

	const hasQueryRight = useRights([
		PERMISSION_KEY_MAP.SLIDES_TEMPLATE_QUERY,
		PERMISSION_KEY_MAP.SLIDES_TEMPLATE_EDIT,
	])
	const hasEditRight = useRights(PERMISSION_KEY_MAP.SLIDES_TEMPLATE_EDIT)

	const { run, loading } = useRequest(
		(arg: ParamsType) => {
			if (!SlidesTemplateApi) {
				return Promise.reject(new Error("SlidesTemplateApi is not available"))
			}
			return SlidesTemplateApi.query(arg)
		},
		{
			manual: true,
			onSuccess: (res) => {
				setData(res.list)
				setTotal(res.total)
			},
		},
	)

	const { run: runCategories } = useRequest(
		() =>
			SlidesTemplateApi.category.query({
				page: 1,
				page_size: 200,
				status: SlidesTemplate.StatusMap.enabled,
			}),
		{
			manual: true,
			onSuccess: (res) => {
				setCategories(res.list)
			},
		},
	)

	useMount(() => {
		run(params)
	})

	const refresh = useMemoizedFn((nextParams = params) => {
		run(nextParams)
	})

	const refreshCategories = useMemoizedFn(() => {
		runCategories()
	})

	const ensureCategories = useMemoizedFn(() => {
		if (categories.length) return
		runCategories()
	})

	const submitFilters = useMemoizedFn(() => {
		const nextParams: ParamsType = {
			page: 1,
			page_size: params.page_size,
			keyword: filterDraft.keyword.trim() || undefined,
			code: filterDraft.code.trim() || undefined,
			category_code: filterDraft.category_code || undefined,
			status: filterDraft.status ?? null,
		}
		setParams(nextParams)
		run(nextParams)
	})

	const resetFilters = useMemoizedFn(() => {
		const nextParams: ParamsType = { page: 1, page_size: params.page_size }
		setFilterDraft({ keyword: "", code: "", category_code: undefined, status: undefined })
		setParams(nextParams)
		run(nextParams)
	})

	const handleDelete = useMemoizedFn((record: DataType) => {
		if (isSystemSlidesTemplate(record)) return

		openModal(WarningModal, {
			open: true,
			content: resolveSlidesTemplateTitle(record),
			onOk: () => {
				SlidesTemplateApi.delete(record.id).then(() => {
					message.success(t("message.deleteSuccess"))
					refresh()
				})
			},
		})
	})

	const { run: runUpdateStatus } = useDebounceFn(
		(record: DataType, status: SlidesTemplate.Status) => {
			setStatusLoadingIds((prev) => new Set([...prev, record.id]))
			SlidesTemplateApi.updateStatus(record.id, status)
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
		},
		{ wait: 300 },
	)

	const handleStatusChange = useMemoizedFn((record: DataType, checked: boolean) => {
		runUpdateStatus(record, getSlidesTemplateStatusByChecked(checked))
	})

	const handleSortChange = useMemoizedFn((record: DataType, sort: number | null) => {
		const nextSort = sort ?? 0
		if (nextSort === record.sort) return
		setSortLoadingIds((prev) => new Set([...prev, record.id]))
		SlidesTemplateApi.updateSort(record.id, nextSort)
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

	const statusLabel = useMemoizedFn((status: SlidesTemplate.Status) => {
		return status === SlidesTemplate.StatusMap.enabled
			? t("slidesTemplate.status.enabled")
			: t("slidesTemplate.status.disabled")
	})

	const sourceTypeLabel = useMemoizedFn((sourceType?: SlidesTemplate.SourceType) => {
		return sourceType === SlidesTemplate.SourceTypeMap.system
			? t("slidesTemplate.source.system")
			: t("slidesTemplate.source.official")
	})

	const renderCategory = useMemoizedFn((record: DataType) => {
		const category = record.category
		const text = category
			? resolveSlidesTemplateCategoryName(category)
			: (record.category_code ?? "-")

		if (!category) {
			return <OverflowTooltipText text={text} style={{ maxWidth: COLUMN_WIDTH.category }} />
		}

		return (
			<Flex align="center" gap={6} style={{ maxWidth: COLUMN_WIDTH.category }}>
				<OverflowTooltipText text={text} style={{ maxWidth: COLUMN_WIDTH.category - 76 }} />
				<StatusTag color={getSlidesTemplateStatusColor(category.status)} bordered={false}>
					{statusLabel(category.status)}
				</StatusTag>
			</Flex>
		)
	})

	const categoryOptions = useMemo(
		() =>
			categories.map((category) => ({
				label: resolveSlidesTemplateCategoryName(category),
				value: category.code,
			})),
		[categories],
	)

	const columns: TableProps<DataType>["columns"] = useMemo(
		() => [
			{
				title: t("slidesTemplate.columns.thumbnail"),
				dataIndex: "thumbnail_url",
				key: "thumbnail_url",
				width: 128,
				render: (url: string | null | undefined, record) =>
					url ? (
						<Image
							src={url}
							alt={resolveSlidesTemplateTitle(record)}
							className={styles.cover}
							preview={false}
						/>
					) : (
						<div className={styles.cover} />
					),
			},
			{
				title: t("slidesTemplate.columns.name"),
				dataIndex: "label",
				key: "label",
				width: COLUMN_WIDTH.name,
				ellipsis: { showTitle: false },
				render: (_, record) => (
					<OverflowTooltipText
						text={resolveSlidesTemplateTitle(record)}
						style={{ maxWidth: COLUMN_WIDTH.name }}
					/>
				),
			},
			{
				title: t("slidesTemplate.columns.code"),
				dataIndex: "code",
				key: "code",
				width: COLUMN_WIDTH.code,
				ellipsis: { showTitle: false },
				render: (value: string) => (
					<OverflowTooltipText text={value} style={{ maxWidth: COLUMN_WIDTH.code }} />
				),
			},
			{
				title: t("slidesTemplate.columns.source"),
				dataIndex: "source_type",
				key: "source_type",
				width: COLUMN_WIDTH.source,
				ellipsis: { showTitle: false },
				render: (value: SlidesTemplate.SourceType | undefined) => (
					<OverflowTooltipText
						text={sourceTypeLabel(value)}
						style={{ maxWidth: COLUMN_WIDTH.source }}
					/>
				),
			},
			{
				title: t("slidesTemplate.columns.category"),
				dataIndex: "category",
				key: "category",
				width: COLUMN_WIDTH.category,
				ellipsis: { showTitle: false },
				render: (_, record) => renderCategory(record),
			},
			{
				title: t("slidesTemplate.columns.status"),
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
				title: t("slidesTemplate.columns.updatedAt"),
				dataIndex: "updated_at",
				key: "updated_at",
				width: COLUMN_WIDTH.updatedAt,
				ellipsis: { showTitle: false },
				render: (value: string) => (
					<OverflowTooltipText
						text={value}
						style={{ maxWidth: COLUMN_WIDTH.updatedAt }}
					/>
				),
			},
			{
				title: t("operate"),
				key: "action",
				width: 140,
				fixed: "right",
				render: (_, record) => {
					const disabled = !hasEditRight || isSystemSlidesTemplate(record)
					return (
						<Flex align="center" gap={8}>
							<Button
								type="link"
								className={styles.linkButton}
								disabled={disabled}
								onClick={() => {
									if (disabled) return
									ensureCategories()
									setSelectedRow(record)
									setOpen(true)
								}}
							>
								{t("button.edit")}
							</Button>
							<Button
								type="link"
								danger
								className={styles.linkButton}
								disabled={disabled}
								onClick={() => handleDelete(record)}
							>
								{t("button.delete")}
							</Button>
						</Flex>
					)
				},
			},
		],
		[
			t,
			styles,
			statusLabel,
			sourceTypeLabel,
			renderCategory,
			statusLoadingIds,
			sortLoadingIds,
			hasEditRight,
			handleStatusChange,
			handleSortChange,
			handleDelete,
			ensureCategories,
		],
	)

	const buttons: TableButton[] = useMemo(
		() => [
			{
				text: t("slidesTemplate.category.manageButton"),
				icon: <IconCategory size={16} />,
				disabled: !hasQueryRight,
				onClick: () => setCategoryOpen(true),
			},
			{
				text: t("slidesTemplate.addButton"),
				type: "primary",
				disabled: !hasEditRight,
				onClick: () => {
					ensureCategories()
					setSelectedRow(null)
					setOpen(true)
				},
			},
		],
		[ensureCategories, hasEditRight, hasQueryRight, t],
	)

	const toolbar = (
		<SlidesTemplateToolbar
			className={styles.toolbar}
			filterDraft={filterDraft}
			categoryOptions={categoryOptions}
			statusLabel={statusLabel}
			onFilterDraftChange={setFilterDraft}
			onSubmit={submitFilters}
			onReset={resetFilters}
			onRefresh={() => refresh()}
			onCategoryDropdownOpen={ensureCategories}
			t={t}
		/>
	)

	const { paginationConfig } = usePagination({
		params,
		setParams,
		fetchData: run,
		data,
		total,
	})

	return (
		<>
			{isMobile ? (
				<MobileList
					data={data}
					loading={loading}
					total={total}
					currentFilters={params}
					buttons={buttons}
					CardComponent={
						<SlidesTemplateCard
							statusLoadingIds={statusLoadingIds}
							hasEditRight={hasEditRight}
							handleStatusChange={handleStatusChange}
							handleEdit={(record) => {
								if (isSystemSlidesTemplate(record)) return
								ensureCategories()
								setSelectedRow(record)
								setOpen(true)
							}}
							sourceTypeLabel={sourceTypeLabel}
							handleDelete={handleDelete}
						/>
					}
					paginationConfig={paginationConfig}
					showDetail={false}
				/>
			) : (
				<div className={styles.container}>
					<TableWithFilters<DataType>
						extra={toolbar}
						columns={columns}
						buttons={buttons}
						justify="end"
						tableLayout="fixed"
						dataSource={data}
						rowKey="id"
						extraHeight={142}
						loading={loading}
						pagination={paginationConfig}
					/>
				</div>
			)}
			{open && (
				<SlidesTemplateModal
					open={open}
					info={selectedRow}
					categoryOptions={categoryOptions}
					onCancel={() => setOpen(false)}
					onOk={() => setOpen(false)}
					onSuccess={() => refresh()}
				/>
			)}
			{categoryOpen && (
				<SlidesTemplateCategoryModal
					open={categoryOpen}
					hasEditRight={hasEditRight}
					onCancel={() => setCategoryOpen(false)}
					onSuccess={() => {
						refreshCategories()
						refresh()
					}}
				/>
			)}
		</>
	)
}
