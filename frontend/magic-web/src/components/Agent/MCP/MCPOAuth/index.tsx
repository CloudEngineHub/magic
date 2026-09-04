import { useStyles } from "./styles"
import { Flex, Button as AntButton, Form, Input } from "antd"
import { IconX } from "@tabler/icons-react"
import { Link, X } from "lucide-react"
import { IconMCP } from "@/enhance/tabler/icons-react"
import MagicScrollBar from "@/components/base/MagicScrollBar"
import MagicSpin from "@/components/base/MagicSpin"
import { Button } from "@/components/shadcn-ui/button"
import { useEffect, useRef, useState } from "react"
import type { AgentCommonModalChildrenProps } from "../../AgentCommonModal"
import { useMemoizedFn, useRequest, useThrottleEffect } from "ahooks"
import { FlowApi } from "@/apis"
import { MCPOAuthService } from "../service/MCPOAuthService"
import type { MCPOAuthStatus } from "../service/MCPOAuthService"
import { generateCallbackUrl } from "../helpers"
import { renderMarkdownLinks } from "../renderMarkdownLinks"
import { trim, isString } from "lodash-es"
import MagicImage from "@/components/base/MagicImage"
import { useTranslation } from "react-i18next"
import type { GetAvailableMCPListResponse } from "@/types/flow"

interface MCPEditor extends AgentCommonModalChildrenProps {
	id: string
	onEnable?: ((id: string) => Promise<void>) | ((id: string) => void)
	panelVariant?: "default" | "connector-market"
	panelMode?: "add" | "edit"
	initialUserSettings?: MCPOAuthStatus
	initialMcpDetails?: GetAvailableMCPListResponse
}

export default function MCPOAuth(props: MCPEditor) {
	const {
		id,
		onClose,
		onEnable,
		panelVariant = "default",
		panelMode = "add",
		initialUserSettings,
		initialMcpDetails,
	} = props
	const { styles, cx } = useStyles()

	const [form] = Form.useForm()
	const { t } = useTranslation("agent")
	const { t: tMarket } = useTranslation("crew/market")
	const service = useRef<MCPOAuthService>(new MCPOAuthService(FlowApi))

	/** 是否填写完表单，触发轮询 */
	const [isAuth, setAuth] = useState(false)
	const [authVisible, setAuthVisible] = useState(false)
	const [isFinishFillForm, setFinishFillForm] = useState(false)
	const [isAutoAdded, setIsAutoAdded] = useState(false)
	const isAutoAddingRef = useRef(false)

	const {
		data: fetchedUserSettings,
		loading: getMCPUserSettingsLoading,
		refresh,
	} = useRequest(
		() => FlowApi.getMCPUserSettings({ code: id, redirectUrl: generateCallbackUrl() }),
		{
			manual: Boolean(initialUserSettings),
			onSuccess(data) {
				setAuth(data?.auth_config?.is_authenticated)
				setAuthVisible(data?.auth_type === 1)
			},
		},
	)
	const data = fetchedUserSettings ?? initialUserSettings

	useEffect(() => {
		if (!initialUserSettings) return
		setAuth(initialUserSettings.auth_config?.is_authenticated)
		setAuthVisible(initialUserSettings.auth_type === 1)
	}, [initialUserSettings])

	const { data: fetchedMcpDetails, loading: getAvailableMCPLoading } = useRequest(
		() => FlowApi.getAvailableMCP([id]),
		{
			manual: Boolean(initialMcpDetails),
		},
	)
	const mcpDetails = initialMcpDetails ?? fetchedMcpDetails

	useThrottleEffect(
		() => {
			const details = mcpDetails?.list?.[0]
			if (details && data) {
				// 当且仅当存在表单项需要填写时才触发流程
				if (details.require_fields.length === 0) {
					setFinishFillForm(true)
				} else {
					const fieldNames = details.require_fields.map((i) => i.field_name)

					const formData = data.require_fields.reduce<Record<string, unknown>>(
						(res, item) => {
							res[item.field_name] = item.field_value
							return res
						},
						{},
					)
					form.setFieldsValue(formData)
					setFinishFillForm(
						fieldNames.every(
							(i) => isString(formData?.[i]) && trim(formData?.[i]) !== "",
						),
					)
				}
			}
		},
		[mcpDetails, data],
		{ wait: 500, leading: false },
	)

	const saveRequiredFields = useMemoizedFn(async () => {
		const values = form.getFieldsValue()
		const formData = Object.keys(values).map((key) => ({
			field_name: key,
			field_value: values?.[key],
		}))
		if (formData.length > 0) {
			await FlowApi.saveMCPRequireFields(id, {
				require_fields: formData,
			})
		}
	})

	const onSubmit = useMemoizedFn(async () => {
		await saveRequiredFields()
		await onEnable?.(id)
		onClose?.()
	})

	const autoAddAuthorizedConnector = useMemoizedFn(async () => {
		if (isAutoAdded || isAutoAddingRef.current) return
		isAutoAddingRef.current = true
		try {
			await saveRequiredFields()
			await onEnable?.(id)
			setIsAutoAdded(true)
		} catch (error) {
			isAutoAddingRef.current = false
			console.error(error)
		}
	})

	const triggerStartPolling = useMemoizedFn(() => {
		if (data?.auth_config?.oauth_url) {
			window.open(data?.auth_config?.oauth_url)
			// 这里需要通过新窗口打开授权页面，指定授权成功回调页面
			service.current?.restart(id, data)
		}
	})

	const triggerUnbind = useMemoizedFn(async () => {
		await FlowApi.unBindMCPOAuth(id)
		setAuth(false)
		setIsAutoAdded(false)
		isAutoAddingRef.current = false
		refresh()
	})

	/** 表单填写 */
	const onValuesChange = useMemoizedFn((_changedValues, values) => {
		// 检查表单是否都填写完成
		if (mcpDetails?.list?.[0]?.require_fields) {
			const result = mcpDetails?.list?.[0]?.require_fields.every((fieldItem) => {
				const fieldValue = values?.[fieldItem?.field_name]
				return isString(fieldValue) && trim(fieldValue) !== ""
			})
			setFinishFillForm(result)
		}
	})

	useThrottleEffect(
		() => {
			service.current?.setCallbacks({
				// 授权成功回调
				onSuccess() {
					setAuth(true)
				},
			})

			const currentService = service.current
			return () => {
				currentService?.destroy?.()
			}
		},
		[],
		{ wait: 500, leading: false },
	)

	useEffect(() => {
		if (
			panelVariant !== "connector-market" ||
			!authVisible ||
			!isAuth ||
			!isFinishFillForm ||
			isAutoAdded
		)
			return

		void autoAddAuthorizedConnector()
	}, [
		authVisible,
		autoAddAuthorizedConnector,
		isAuth,
		isAutoAdded,
		isFinishFillForm,
		panelVariant,
	])

	const mcpInfo = mcpDetails?.list?.[0]
	const requiredFields = mcpInfo?.require_fields ?? []
	const hasSetupFields = Boolean(requiredFields.length || authVisible)
	const authForm = (
		<Form form={form} layout="vertical" onValuesChange={onValuesChange}>
			{requiredFields.length > 0 ? (
				<>
					{requiredFields.map((item) => (
						<Form.Item
							key={item.field_name}
							label={item.field_name}
							name={item.field_name}
							className={styles.item}
							required
							rules={[
								{
									required: true,
									message: t("mcp.form.required", {
										name: item.field_name,
									}),
								},
							]}
						>
							<Input />
						</Form.Item>
					))}
				</>
			) : null}
			{authVisible ? (
				<Form.Item label={t("mcp.form.auth")} className={styles.item}>
					{isAuth ? (
						<div
							onClick={
								panelVariant === "connector-market" ? undefined : triggerUnbind
							}
							className={cx(
								styles.section,
								panelVariant === "connector-market" && styles.connectorAuthSection,
								panelVariant === "connector-market" &&
									styles.connectorAuthSuccessSection,
							)}
						>
							{panelVariant === "connector-market" ? (
								<div className="flex size-[38px] shrink-0 items-center justify-center rounded-lg bg-white shadow-[0_2px_8px_rgba(24,25,29,0.12)]">
									<Link className="size-6 shrink-0" aria-hidden />
								</div>
							) : null}
							{panelVariant === "connector-market" ? (
								<>
									<span>{t("mcp.form.authToSuccessTitle")}</span>
									<Button
										type="button"
										variant="outline"
										size="sm"
										className="h-8 px-4 font-normal"
										onClick={triggerUnbind}
									>
										{t("mcp.form.authToSuccessAction")}
									</Button>
								</>
							) : (
								t("mcp.form.authToSuccess")
							)}
						</div>
					) : (
						<div
							onClick={
								panelVariant === "connector-market"
									? undefined
									: triggerStartPolling
							}
							className={cx(
								styles.section,
								{ [styles.active]: !isAuth },
								panelVariant === "connector-market" && styles.connectorAuthSection,
							)}
						>
							{panelVariant === "connector-market" ? (
								<div className="flex size-[38px] shrink-0 items-center justify-center rounded-lg bg-white shadow-[0_2px_8px_rgba(24,25,29,0.12)]">
									<Link className="size-6 shrink-0" aria-hidden />
								</div>
							) : null}
							{panelVariant === "connector-market" ? (
								<>
									<span>{t("mcp.form.authToFailTitle")}</span>
									<Button
										type="button"
										variant="outline"
										size="sm"
										className="h-8 px-4 font-normal"
										onClick={triggerStartPolling}
									>
										{t("mcp.form.authToFailAction")}
									</Button>
								</>
							) : (
								t("mcp.form.authToFail")
							)}
						</div>
					)}
				</Form.Item>
			) : null}
		</Form>
	)

	if (panelVariant === "connector-market") {
		const description = mcpInfo?.description || t("mcp.card.desc")

		return (
			<div className="flex min-h-0 min-w-0 flex-col px-3 pb-3 pt-1">
				<div className="relative flex items-center justify-end pb-1">
					<Button
						type="button"
						variant="ghost"
						size="icon"
						className="size-7 rounded-md text-muted-foreground"
						onClick={onClose}
						data-testid="connector-auth-close-button"
					>
						<X className="size-4" aria-hidden />
					</Button>
				</div>

				<MagicSpin spinning={getMCPUserSettingsLoading || getAvailableMCPLoading}>
					<div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 px-1 pb-1">
						<div className="flex min-w-0 items-center gap-3 px-3 pt-0">
							<MagicImage
								className="size-10 shrink-0 rounded-xl"
								src={mcpInfo?.icon}
								alt={mcpInfo?.name}
								fallback={
									<div className="size-10 shrink-0 overflow-hidden rounded-xl">
										<IconMCP size="100%" />
									</div>
								}
							/>
							<div className="min-w-0 flex-1">
								<h2 className="truncate text-[16px] font-semibold leading-[22px] text-foreground">
									{mcpInfo?.name}
								</h2>
								<p className="line-clamp-2 break-words text-[12px] leading-4 text-muted-foreground">
									{renderMarkdownLinks(description, {
										linkClassName:
											"text-primary underline underline-offset-2 hover:opacity-90",
										linkTestId: "connector-auth-description-link",
									})}
								</p>
							</div>
						</div>
						<div
							className="my-2 h-px w-full bg-border"
							data-testid="connector-auth-divider"
						/>

						<div className="flex min-h-0 flex-1 flex-col gap-3">
							{hasSetupFields ? (
								<MagicScrollBar
									className="max-h-[min(36vh,18rem)] w-full px-1"
									autoHide={false}
								>
									{authForm}
								</MagicScrollBar>
							) : null}

							<div className="flex items-center justify-end gap-2">
								<Button
									type="button"
									variant="outline"
									className="h-10"
									onClick={onClose}
									data-testid="connector-auth-cancel-button"
								>
									{t("mcp.form.cancel")}
								</Button>
								{!authVisible ? (
									<Button
										type="button"
										className="h-10 shadow-xs"
										onClick={() => void onSubmit()}
										disabled={!isFinishFillForm}
										data-testid="connector-auth-submit-button"
									>
										{panelMode === "edit"
											? tMarket("connectors.saveConfig")
											: tMarket("connectors.saveAndAdd")}
									</Button>
								) : null}
							</div>
						</div>
					</div>
				</MagicSpin>
			</div>
		)
	}

	return (
		<div className={styles.layout}>
			<div className={styles.header}>
				<Flex gap={10} align="center">
					<div className={styles.icon}>
						<MagicImage
							className={styles.icon}
							src={mcpInfo?.icon}
							alt={mcpInfo?.name}
							fallback={
								<div className={styles.icon}>
									<IconMCP size="100%" />
								</div>
							}
						/>
					</div>
					<Flex vertical>
						<span className={styles.title}>{mcpInfo?.name}</span>
						<span className={styles.desc}>
							{renderMarkdownLinks(mcpInfo?.description || t("mcp.card.desc"), {
								linkClassName: styles.descLink,
								linkTestId: "agent-mcp-oauth-description-link",
							})}
						</span>
					</Flex>
				</Flex>
				<div className={styles.close} onClick={onClose}>
					<IconX size={24} />
				</div>
			</div>
			<MagicSpin spinning={getMCPUserSettingsLoading || getAvailableMCPLoading}>
				<Flex className={styles.body} vertical gap={20}>
					<div className={styles.loading}>
						<MagicScrollBar className={styles.wrapper} autoHide={false}>
							{authForm}
						</MagicScrollBar>
					</div>
					<Flex className={styles.menu} justify="flex-end" align="center" gap={10}>
						<AntButton onClick={onClose}>{t("mcp.form.cancel")}</AntButton>
						<AntButton
							type="primary"
							onClick={onSubmit}
							disabled={!(isFinishFillForm && (authVisible ? isAuth : true))}
						>
							{t("mcp.form.confirm")}
						</AntButton>
					</Flex>
				</Flex>
			</MagicSpin>
		</div>
	)
}
