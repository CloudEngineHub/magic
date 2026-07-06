import { lazy, useMemo, useState } from "react"
import { Button, Flex, Image, InputNumber, Select, Switch, message } from "antd"
import type { TableProps } from "antd/lib"
import { createStyles } from "antd-style"
import { useDebounceFn, useMemoizedFn, useMount, useRequest } from "ahooks"
import { useTranslation } from "react-i18next"
import { IconSearch, IconRefresh } from "@tabler/icons-react"
import type { TableButton } from "@admin-components"
import {
	MagicButton,
	MagicInput,
	MobileList,
	TableWithFilters,
	WarningModal,
} from "@admin-components"
import { useApis } from "@admin/apis"
import { PERMISSION_KEY_MAP } from "@admin/const/common"
import useRights from "@admin/hooks/useRights"
import { useOpenModal } from "@admin/hooks/useOpenModal"
import { usePagination } from "@admin/hooks/usePagination"
import { useIsMobile } from "@admin/hooks/useIsMobile"
import { SlidesTemplate } from "@admin/types/slidesTemplate"
import { SlidesTemplateModal } from "./components/SlidesTemplateModal"
import {
	getSlidesTemplateStatusByChecked,
	isSystemSlidesTemplate,
	resolveSlidesTemplateTitle,
} from "./utils"

const SlidesTemplateCard = lazy(() => import("./components/SlidesTemplateCard"))

type DataType = SlidesTemplate.Item
type ParamsType = SlidesTemplate.QueryParams

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
	const [selectedRow, setSelectedRow] = useState<DataType | null>(null)
	const [data, setData] = useState<DataType[]>([])
	const [total, setTotal] = useState(0)
	const [params, setParams] = useState<ParamsType>({ page: 1, page_size: 20 })
	const [filterDraft, setFilterDraft] = useState({
		keyword: "",
		code: "",
		status: undefined as SlidesTemplate.Status | undefined,
	})
	const [statusLoadingIds, setStatusLoadingIds] = useState<Set<string>>(new Set())
	const [sortLoadingIds, setSortLoadingIds] = useState<Set<string>>(new Set())

	const hasEditRight = useRights(PERMISSION_KEY_MAP.SLIDES_TEMPLATE)

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

	useMount(() => {
		run(params)
	})

	const refresh = useMemoizedFn((nextParams = params) => {
		run(nextParams)
	})

	const submitFilters = useMemoizedFn(() => {
		const nextParams: ParamsType = {
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
		const nextParams: ParamsType = { page: 1, page_size: params.page_size }
		setFilterDraft({ keyword: "", code: "", status: undefined })
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
				width: 180,
				ellipsis: true,
				render: (_, record) => resolveSlidesTemplateTitle(record),
			},
			{
				title: t("slidesTemplate.columns.code"),
				dataIndex: "code",
				key: "code",
				width: 240,
				ellipsis: true,
			},
			{
				title: t("slidesTemplate.columns.source"),
				dataIndex: "source_type",
				key: "source_type",
				width: 120,
				render: (value: SlidesTemplate.SourceType | undefined) => sourceTypeLabel(value),
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
				width: 180,
				ellipsis: true,
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
			statusLoadingIds,
			sortLoadingIds,
			hasEditRight,
			handleStatusChange,
			handleSortChange,
			handleDelete,
		],
	)

	const buttons: TableButton[] = useMemo(
		() => [
			{
				text: t("slidesTemplate.addButton"),
				type: "primary",
				disabled: !hasEditRight,
				onClick: () => {
					setSelectedRow(null)
					setOpen(true)
				},
			},
		],
		[hasEditRight, t],
	)

	const toolbar = (
		<Flex gap={8} wrap="wrap" className={styles.toolbar}>
			<MagicInput
				value={filterDraft.keyword}
				placeholder={t("slidesTemplate.filters.keyword")}
				style={{ width: 220 }}
				onChange={(event) =>
					setFilterDraft((prev) => ({ ...prev, keyword: event.target.value }))
				}
				onPressEnter={submitFilters}
			/>
			<MagicInput
				value={filterDraft.code}
				placeholder={t("slidesTemplate.filters.code")}
				style={{ width: 260 }}
				onChange={(event) =>
					setFilterDraft((prev) => ({ ...prev, code: event.target.value }))
				}
				onPressEnter={submitFilters}
			/>
			<Select
				allowClear
				value={filterDraft.status}
				placeholder={t("slidesTemplate.filters.status")}
				style={{ width: 160 }}
				options={[
					{ label: statusLabel(SlidesTemplate.StatusMap.enabled), value: 1 },
					{ label: statusLabel(SlidesTemplate.StatusMap.disabled), value: 0 },
				]}
				onChange={(value) => setFilterDraft((prev) => ({ ...prev, status: value }))}
			/>
			<MagicButton type="primary" icon={<IconSearch size={16} />} onClick={submitFilters}>
				{t("button.search")}
			</MagicButton>
			<MagicButton onClick={resetFilters}>{t("button.reset")}</MagicButton>
			<MagicButton icon={<IconRefresh size={16} />} onClick={() => refresh()}>
				{t("button.reload")}
			</MagicButton>
		</Flex>
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
					onCancel={() => setOpen(false)}
					onOk={() => setOpen(false)}
					onSuccess={() => refresh()}
				/>
			)}
		</>
	)
}
