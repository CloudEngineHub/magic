import { useState, useMemo, lazy } from "react"
import { Flex, Switch, Button, message } from "antd"
import { createStyles } from "antd-style"
import {
	TableWithFilters,
	WarningModal,
	MobileList,
	SearchItemType,
	type SearchItem,
	type TableButton,
} from "@admin-components"
import { useTranslation } from "react-i18next"
import { useDebounceFn, useMemoizedFn, useMount, useRequest } from "ahooks"
import { usePagination } from "@admin/hooks/usePagination"
import type { TableProps } from "antd/lib"
import { useOpenModal } from "@admin/hooks/useOpenModal"
import { useApis } from "@admin/apis"
import { AppMenu } from "@admin/types/appMenu"
import useRights from "@admin/hooks/useRights"
import { PERMISSION_KEY_MAP } from "@admin/const/common"
import { AppMenuModal } from "./components/AppMenuModal"
import { useIsMobile } from "@admin/hooks/useIsMobile"
const AppMenuCard = lazy(() => import("./components/AppMenuCard"))

type DataType = AppMenu.MenuItem
type ParamsType = AppMenu.GetListParams

const useStyles = createStyles(({ token }) => ({
	container: {
		backgroundColor: token.magicColorUsages.bg[0],
	},
	editBtn: {
		padding: 0,
	},
	deleteBtn: {
		padding: 0,
	},
}))

export default function AppMenuPage() {
	const { t } = useTranslation("admin/common")
	const { styles } = useStyles()
	const { AppMenuApi } = useApis()
	const openModal = useOpenModal()

	const [open, setOpen] = useState(false)
	const [selectedRow, setSelectedRow] = useState<DataType | null>(null)
	const [data, setData] = useState<DataType[]>([])
	const [total, setTotal] = useState(0)
	const [params, setParams] = useState<ParamsType>({
		page: 1,
		page_size: 1000,
	})

	const appMenuApi = useMemo(
		() => ({
			getList: AppMenuApi.getOrganizationAppMenuList,
			getDetail: AppMenuApi.getOrganizationAppMenuDetail,
			save: AppMenuApi.saveOrganizationAppMenu,
			delete: AppMenuApi.deleteOrganizationAppMenu,
			updateStatus: AppMenuApi.updateOrganizationAppMenuStatus,
		}),
		[AppMenuApi],
	)

	const { run, loading } = useRequest((arg: ParamsType) => appMenuApi.getList(arg), {
		manual: true,
		onSuccess: (res) => {
			setData(res.list)
			setTotal(res.total)
		},
	})

	useMount(() => {
		run(params)
	})

	const hasEditRight = useRights(PERMISSION_KEY_MAP.AI_APP_MENU_EDIT)

	const [statusLoadingIds, setStatusLoadingIds] = useState<Set<string>>(new Set())

	const updateParams = useMemoizedFn((newParams: Partial<ParamsType>) => {
		const nextParams = {
			...params,
			...newParams,
			page: 1,
		}
		setParams(nextParams)
		run(nextParams)
	})

	const { run: debouncedSearch } = useDebounceFn(updateParams, { wait: 300 })

	const handleOpenModal = useMemoizedFn(async (record: DataType | null) => {
		if (!record) {
			setSelectedRow(null)
			setOpen(true)
			return
		}

		const detail = await appMenuApi.getDetail(record.id)
		setSelectedRow(detail)
		setOpen(true)
	})

	const handleDelete = useMemoizedFn((record: DataType) => {
		openModal(WarningModal, {
			open: true,
			content: record.name_i18n?.zh_CN || record.name_i18n?.en_US,
			onOk: () => {
				appMenuApi.delete(record.id).then(() => {
					message.success(t("message.deleteSuccess"))
					run(params)
				})
			},
		})
	})

	const { run: runUpdateStatus } = useDebounceFn(
		(record: DataType, newStatus: AppMenu.Status) => {
			setStatusLoadingIds((prev) => new Set([...prev, record.id]))
			appMenuApi
				.updateStatus(record.id, newStatus)
				.then(() => {
					message.success(t("message.updateSuccess"))
					run(params)
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
		const newStatus = checked ? AppMenu.StatusMap.enabled : AppMenu.StatusMap.disabled
		runUpdateStatus(record, newStatus)
	})

	const openMethodLabel = useMemoizedFn((value: AppMenu.OpenMethod) => {
		const map: Record<AppMenu.OpenMethod, string> = {
			[AppMenu.OpenMethodMap.self]: t("appMenu.openMethod.self"),
			[AppMenu.OpenMethodMap.blank]: t("appMenu.openMethod.blank"),
		}
		return map[value] ?? value
	})

	const sourceTypeLabel = useMemoizedFn((value?: AppMenu.SourceType) => {
		const map: Record<AppMenu.SourceType, string> = {
			[AppMenu.SourceTypeMap.official]: t("appMenu.sourceType.official"),
			[AppMenu.SourceTypeMap.organization]: t("appMenu.sourceType.organization"),
		}
		return value ? map[value] : "-"
	})

	const columns: TableProps<DataType>["columns"] = useMemo(() => {
		const baseColumns: TableProps<DataType>["columns"] = [
			{
				title: t("appMenu.columns.name"),
				dataIndex: "name",
				key: "name",
				ellipsis: true,
				render: (_: string, record) => record.name_i18n?.zh_CN || record.name_i18n?.en_US,
			},
			{
				title: t("appMenu.columns.sourceType"),
				dataIndex: "source_type",
				key: "source_type",
				width: 120,
				render: (value: AppMenu.SourceType) => sourceTypeLabel(value),
			},
			{
				title: t("appMenu.columns.path"),
				dataIndex: "path",
				key: "path",
				ellipsis: true,
			},
			{
				title: t("appMenu.columns.openMethod"),
				dataIndex: "open_method",
				key: "open_method",
				width: 200,
				render: (value: AppMenu.OpenMethod) => openMethodLabel(value),
			},
			{
				title: t("appMenu.columns.sortOrder"),
				dataIndex: "sort_order",
				key: "sort_order",
				width: 100,
			},
			{
				title: t("appMenu.columns.status"),
				dataIndex: "status",
				key: "status",
				width: 120,
				render: (value: AppMenu.Status, record) => (
					<Switch
						checked={value === AppMenu.StatusMap.enabled}
						loading={statusLoadingIds.has(record.id)}
						disabled={!hasEditRight || statusLoadingIds.has(record.id)}
						onChange={(checked) => handleStatusChange(record, checked)}
					/>
				),
			},
			{
				title: t("operate"),
				key: "action",
				dataIndex: "action",
				width: 180,
				render: (_, record) => {
					const isOfficial = record.source_type === AppMenu.SourceTypeMap.official
					const canEdit = isOfficial || record.editable !== false
					const canDelete = record.can_delete !== false
					return (
						<Flex align="center" gap={8}>
							<Button
								type="link"
								className={styles.editBtn}
								disabled={!hasEditRight || !canEdit}
								onClick={() => handleOpenModal(record)}
							>
								{isOfficial ? t("appMenu.displaySetting") : t("button.edit")}
							</Button>
							{canDelete && (
								<Button
									type="link"
									danger
									className={styles.deleteBtn}
									disabled={!hasEditRight || !canDelete}
									onClick={() => handleDelete(record)}
								>
									{t("button.delete")}
								</Button>
							)}
						</Flex>
					)
				},
			},
		]
		return baseColumns
	}, [
		t,
		hasEditRight,
		handleDelete,
		handleOpenModal,
		handleStatusChange,
		openMethodLabel,
		sourceTypeLabel,
		statusLoadingIds,
		styles,
	])

	const searchItems: SearchItem[] = useMemo(
		() => [
			{
				type: SearchItemType.TEXT,
				field: "name",
				addonBefore: t("appMenu.searchName"),
				allowClear: true,
				onChange: (e) => debouncedSearch({ name: e.target.value.trim() || undefined }),
			},
			{
				type: SearchItemType.SELECT,
				field: "source_type",
				prefix: t("appMenu.columns.sourceType"),
				placeholder: t("all"),
				options: [
					{ label: t("all"), value: "all" },
					{
						label: t("appMenu.sourceType.official"),
						value: AppMenu.SourceTypeMap.official,
					},
					{
						label: t("appMenu.sourceType.organization"),
						value: AppMenu.SourceTypeMap.organization,
					},
				],
				defaultValue: "all",
				onChange: (value) => {
					updateParams({
						source_type: value === "all" ? undefined : value,
					})
				},
			},
			{
				type: SearchItemType.SELECT,
				field: "status",
				prefix: t("appMenu.columns.status"),
				placeholder: t("all"),
				options: [
					{ label: t("all"), value: "all" },
					{
						label: t("appMenu.statusOptions.enabled"),
						value: AppMenu.StatusMap.enabled,
					},
					{
						label: t("appMenu.statusOptions.disabled"),
						value: AppMenu.StatusMap.disabled,
					},
				],
				defaultValue: "all",
				onChange: (value) => {
					updateParams({ status: value === "all" ? undefined : value })
				},
			},
		],
		[debouncedSearch, t, updateParams],
	)

	const buttons: TableButton[] = useMemo(
		() => [
			{
				text: t("appMenu.addMenu"),
				type: "primary",
				disabled: !hasEditRight,
				onClick: () => {
					handleOpenModal(null)
				},
			},
		],
		[handleOpenModal, hasEditRight, t],
	)

	const isMobile = useIsMobile()

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
					search={searchItems}
					buttons={buttons}
					CardComponent={
						<AppMenuCard
							statusLoadingIds={statusLoadingIds}
							hasEditRight={hasEditRight}
							openMethodLabel={openMethodLabel}
							sourceTypeLabel={sourceTypeLabel}
							handleStatusChange={handleStatusChange}
							handleEdit={handleOpenModal}
							handleDelete={handleDelete}
						/>
					}
					paginationConfig={paginationConfig}
					showDetail={false}
				/>
			) : (
				<div className={styles.container}>
					<TableWithFilters<DataType>
						search={searchItems}
						columns={columns}
						buttons={buttons}
						dataSource={data}
						rowKey="id"
						extraHeight={116}
						loading={loading}
						pagination={paginationConfig}
					/>
				</div>
			)}
			{open && (
				<AppMenuModal
					open={open}
					info={selectedRow}
					saveAppMenu={appMenuApi.save}
					onCancel={() => setOpen(false)}
					onOk={() => setOpen(false)}
					onSuccess={() => run(params)}
				/>
			)}
		</>
	)
}
