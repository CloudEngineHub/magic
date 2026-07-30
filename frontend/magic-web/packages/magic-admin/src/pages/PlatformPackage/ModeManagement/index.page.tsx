import { Flex, message } from "antd"
import { lazy, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import {
	DangerLevel,
	MagicButton,
	MagicCard,
	MagicInput,
	MagicSelect,
	MagicSpin,
	MagicSwitch,
	WarningModal,
} from "@admin-components"
import { useDebounceFn, useMemoizedFn, useMount, useRequest } from "ahooks"
import { useApis } from "@admin/apis"
import { PlatformPackage } from "@admin/types/platformPackage"
import type { AiManage } from "@admin/types/aiManage"
import { useOpenModal } from "@admin/hooks/useOpenModal"
import useRights from "@admin/hooks/useRights"
import { PERMISSION_KEY_MAP } from "@admin/const/common"
import dynamicModelIcon from "@admin/assets/logos/dynamic-model-logo.svg"
import { useStyles } from "./styles"
import { AddModeModal } from "./components/AddModeModal"
import { AssignModal } from "./components/AssignModal"
import ModeIcon from "./components/ModeIcon.tsx"
import { useIsMobile } from "@admin/hooks/useIsMobile"
import { buildDefaultAgentOptions, getModeDisplayName } from "./defaultAgent"

const AddModuleBox = lazy(() => import("../components/AddModuleBox"))

const ModeManagementPage = () => {
	const { t } = useTranslation("admin/platform/mode")
	const { t: tCommon } = useTranslation("admin/common")
	const { styles } = useStyles()
	const isMobile = useIsMobile()

	const { PlatformPackageApi } = useApis()
	const openModal = useOpenModal()

	const [allModelList, setAllModelList] = useState<AiManage.ModelInfo[]>([])
	const [list, setList] = useState<PlatformPackage.Mode[]>([])
	const [total, setTotal] = useState(0)
	const [defaultAgentCode, setDefaultAgentCode] = useState<string>()
	const [enabledModeList, setEnabledModeList] = useState<PlatformPackage.Mode[]>([])
	const [params, setParams] = useState<PlatformPackage.ModeListParams>({
		page: 1,
		page_size: 100,
	})

	const { runAsync: updateStatus } = useRequest(
		(arg: { id: string; status: boolean }) => PlatformPackageApi.updateModeStatus(arg),
		{ manual: true },
	)

	const { run: getDefaultAgentSetting, loading: defaultAgentSettingLoading } = useRequest(
		PlatformPackageApi.getDefaultAgentSetting,
		{
			manual: true,
			onSuccess: (res) => {
				setDefaultAgentCode(res.default_agent_code)
			},
		},
	)

	const { run: getEnabledModeList, loading: enabledModeListLoading } = useRequest(
		async () => {
			const pageSize = 100
			const firstPage = await PlatformPackageApi.getModeList({
				page: 1,
				page_size: pageSize,
				status: 1,
			})
			const pageCount = Math.ceil(firstPage.total / pageSize)
			if (pageCount <= 1) return firstPage.list

			const remainingPages = await Promise.all(
				Array.from({ length: pageCount - 1 }, (_, index) =>
					PlatformPackageApi.getModeList({
						page: index + 2,
						page_size: pageSize,
						status: 1,
					}),
				),
			)

			return [firstPage, ...remainingPages].flatMap((page) => page.list)
		},
		{
			manual: true,
			onSuccess: (modeList) => {
				setEnabledModeList(modeList)
			},
		},
	)

	const { runAsync: updateDefaultAgentSetting, loading: defaultAgentUpdating } = useRequest(
		PlatformPackageApi.updateDefaultAgentSetting,
		{ manual: true },
	)

	const { run, loading } = useRequest(PlatformPackageApi.getModeList, {
		manual: true,
		onSuccess: (res, [requestParams]) => {
			const newList = requestParams.page === 1 ? res.list : [...list, ...res.list]
			setList(newList)
			setTotal(res.total)
		},
	})

	const { run: getAllModelList } = useRequest(
		() =>
			PlatformPackageApi.getAllModelList({
				is_model_id_filter: true,
				status: 1,
			}),
		{
			manual: true,
			onSuccess: (res) => {
				setAllModelList([
					{
						id: PlatformPackage.ModelType.Dynamic,
						model_id: "",
						name: t("dynamicModel"),
						icon: dynamicModelIcon,
						description: t("dynamicModelDesc"),
					} as AiManage.ModelInfo,
					...res,
				])
			},
		},
	)

	const updateParams = useMemoizedFn((partial: Partial<PlatformPackage.ModeListParams>) => {
		const next: PlatformPackage.ModeListParams = {
			...params,
			...partial,
			page: 1,
		}
		setParams(next)
		run(next)
	})

	const { run: debouncedSearch } = useDebounceFn(
		(value: Partial<PlatformPackage.ModeListParams>) => {
			updateParams(value)
		},
		{ wait: 500 },
	)

	useMount(() => {
		run(params)
		getAllModelList()
		getDefaultAgentSetting()
		getEnabledModeList()
	})

	const statusOptions = useMemo(
		() => [
			{ label: tCommon("all"), value: "all" },
			{ label: t("enable"), value: "1" },
			{ label: t("disable"), value: "0" },
		],
		[t, tCommon],
	)

	const hasEditRight = useRights(PERMISSION_KEY_MAP.MODE_MANAGEMENT_EDIT)
	const defaultAgentOptions = useMemo(
		() => buildDefaultAgentOptions(enabledModeList, defaultAgentCode),
		[defaultAgentCode, enabledModeList],
	)
	const defaultAgentModeMap = useMemo(
		() => new Map(enabledModeList.map((mode) => [mode.identifier, mode])),
		[enabledModeList],
	)
	const defaultAgentSelectValue = defaultAgentOptions.some(
		(option) => option.value === defaultAgentCode,
	)
		? defaultAgentCode
		: undefined
	const renderDefaultAgentOption = useMemoizedFn(
		(value: string | number | null | undefined, label: React.ReactNode) => {
			const mode = typeof value === "string" ? defaultAgentModeMap.get(value) : undefined

			return (
				<Flex gap={8} align="center">
					{mode && <ModeIcon item={mode} size={16} className={styles.defaultAgentIcon} />}
					<span>{label}</span>
				</Flex>
			)
		},
	)

	const handleDefaultAgentChange = useMemoizedFn(async (nextAgentCode: string) => {
		if (!nextAgentCode || nextAgentCode === defaultAgentCode) return

		const previousAgentCode = defaultAgentCode
		setDefaultAgentCode(nextAgentCode)
		try {
			const res = await updateDefaultAgentSetting({
				default_agent_code: nextAgentCode,
			})
			setDefaultAgentCode(res.default_agent_code)
			message.success(t("defaultAgentUpdateSuccess"))
		} catch {
			setDefaultAgentCode(previousAgentCode)
			message.error(t("defaultAgentUpdateFailed"))
		}
	})

	const onChange = async (status: boolean, item: PlatformPackage.Mode) => {
		const { id } = item
		openModal(WarningModal, {
			open: true,
			title: status ? t("enableTip") : t("disableTip"),
			content: status ? t("enableTipDesc") : t("disableTipDesc"),
			dangerLevel: DangerLevel.Warning,
			showDeleteText: false,
			okText: tCommon("button.confirm"),
			okButtonProps: {
				danger: false,
			},
			onOk: () => {
				updateStatus({
					id,
					status,
				}).then(() => {
					message.success(tCommon("message.updateSuccess"))
					setList((prevList) =>
						prevList.map((it) => (it.id === id ? { ...it, status } : it)),
					)
					getEnabledModeList()
				})
			},
		})
	}

	const leftAction = useMemoizedFn((item: PlatformPackage.Mode) => {
		const { status } = item
		return (
			<Flex gap={8} align="center">
				<div className={styles.status}>{tCommon("status")}</div>
				<MagicSwitch
					disabled={item.is_default === 1}
					checked={status}
					onChange={(checked) => onChange(checked, item)}
				/>
			</Flex>
		)
	})

	// 分配模型
	const goToAssignMode = useMemoizedFn(
		(item?: PlatformPackage.Mode | null, onRefresh?: () => void) => {
			openModal(AssignModal, {
				info: item,
				allModelList,
				goToEdit: goToAssignMode,
				onOk: () => {
					onRefresh?.()
				},
			})
		},
	)

	const openAddModeModal = useMemoizedFn((info?: PlatformPackage.Mode | null) => {
		if (!hasEditRight) return
		openModal(AddModeModal, {
			info,
			onOk: (mode) => {
				getEnabledModeList()
				setList((prevList) => {
					const index = prevList.findIndex((it) => it.id === mode.id)
					if (index !== -1) {
						const newList = [...prevList]
						newList[index] = mode
						return newList
					}
					return [...prevList, mode]
				})
			},
		})
	})

	const rightAction = useMemoizedFn((item: PlatformPackage.Mode) => {
		return (
			<Flex gap={10} align="center">
				<MagicButton
					type="link"
					className={styles.button}
					onClick={() => {
						goToAssignMode(item)
					}}
				>
					{t("assignModel")}
				</MagicButton>
				{!item.is_default && (
					<MagicButton
						type="link"
						className={styles.button}
						onClick={() => openAddModeModal(item)}
					>
						{t("edit")}
					</MagicButton>
				)}
			</Flex>
		)
	})

	const onScroll = useMemoizedFn((e: React.UIEvent<HTMLDivElement>) => {
		if (total === list.length || loading) return
		const { scrollTop, scrollHeight, clientHeight } = e.currentTarget
		if (scrollTop + clientHeight >= scrollHeight) {
			const newParams = { ...params, page: params.page + 1 }
			setParams(newParams)
			run(newParams)
		}
	})

	return (
		<Flex gap={10} vertical className={styles.container}>
			<div className={styles.defaultAgentSetting}>
				<div className={styles.defaultAgentInfo}>
					<div className={styles.defaultAgentLabel}>{t("defaultAgent")}</div>
					<div className={styles.defaultAgentDescription}>{t("defaultAgentDesc")}</div>
				</div>
				<MagicSelect
					value={defaultAgentSelectValue}
					options={defaultAgentOptions}
					placeholder={t("defaultAgentPlaceholder")}
					loading={defaultAgentSettingLoading || enabledModeListLoading}
					disabled={
						!hasEditRight ||
						defaultAgentSettingLoading ||
						enabledModeListLoading ||
						defaultAgentUpdating
					}
					showSearch
					optionFilterProp="label"
					className={styles.defaultAgentSelect}
					optionRender={(option) => renderDefaultAgentOption(option.value, option.label)}
					labelRender={(option) => renderDefaultAgentOption(option.value, option.label)}
					onChange={handleDefaultAgentChange}
				/>
			</div>
			<div className={styles.title}>{t("superMagic")}</div>
			<Flex align={isMobile ? "stretch" : "center"} gap={10} vertical={isMobile}>
				<MagicSelect
					prefix={tCommon("status")}
					style={{ width: isMobile ? "100%" : 120 }}
					defaultValue="all"
					onChange={(value) =>
						updateParams({ status: value !== "all" ? value : undefined })
					}
					options={statusOptions}
				/>
				<MagicInput
					style={{ width: isMobile ? "100%" : 200 }}
					placeholder={tCommon("pleaseInputPlaceholder", { name: t("modeName") })}
					allowClear
					onChange={(e) => {
						debouncedSearch({ keyword: e.target.value })
					}}
				/>
				<MagicInput
					style={{ width: isMobile ? "100%" : 200 }}
					placeholder={tCommon("pleaseInputPlaceholder", { name: t("modeId") })}
					allowClear
					onChange={(e) => {
						debouncedSearch({ identifier: e.target.value })
					}}
				/>
			</Flex>
			<MagicSpin spinning={loading && params.page === 1} className={styles.spin}>
				<div onScroll={onScroll} className={styles.listContainer}>
					{list?.map((item) => (
						<MagicCard
							key={item.id}
							title={getModeDisplayName(item)}
							avatar={
								<ModeIcon item={item} size={28} className={styles.iconWrapper} />
							}
							className={styles.card}
							description={
								item.is_default ? (
									item.description
								) : (
									<Flex gap={4} align="center">
										<div className={styles.label}>{t("identifier")}</div>
										<div className={styles.identifier}>{item.identifier}</div>
									</Flex>
								)
							}
							is2LineClamp={false}
							rightAction={rightAction(item)}
							leftAction={leftAction(item)}
						/>
					))}
					{hasEditRight && (
						<AddModuleBox
							onAddClick={() => openAddModeModal()}
							hasEditRight={hasEditRight}
							text={t("addMode")}
							className={styles.addService}
						/>
					)}
				</div>
			</MagicSpin>
		</Flex>
	)
}

export default ModeManagementPage
