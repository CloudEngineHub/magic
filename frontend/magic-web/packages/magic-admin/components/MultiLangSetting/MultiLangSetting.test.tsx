import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { ModalFuncProps } from "antd"
import { beforeEach, describe, expect, it, vi } from "vitest"
import MultiLangSetting from "./MultiLangSetting"

const modalMock = vi.hoisted(() => ({
	confirm: vi.fn(),
	destroy: vi.fn(),
	update: vi.fn(),
}))

vi.mock("antd", async () => {
	const React = await import("react")

	function createForm() {
		const values: Record<string, string> = {}

		return {
			values,
			resetFields: vi.fn(() => {
				Object.keys(values).forEach((key) => {
					delete values[key]
				})
			}),
			setFieldsValue: vi.fn((nextValues: Record<string, string>) => {
				Object.assign(values, nextValues)
			}),
			getFieldsValue: vi.fn((names?: string[]) => {
				if (!names) return { ...values }
				return names.reduce<Record<string, string>>((result, name) => {
					result[name] = values[name] ?? ""
					return result
				}, {})
			}),
			validateFields: vi.fn(() => Promise.resolve({ ...values })),
		}
	}

	const FormContext = React.createContext<ReturnType<typeof createForm> | null>(null)

	const Form = ({
		form,
		children,
	}: {
		form: ReturnType<typeof createForm>
		children: React.ReactNode
	}) => React.createElement(FormContext.Provider, { value: form }, children)
	Form.useForm = () => React.useMemo(() => [createForm()] as const, [])
	const FormItem = ({ name, children }: { name: string; children: React.ReactElement }) => {
		const form = React.useContext(FormContext)
		if (!form) return children

		return React.cloneElement(children, {
			value: form.values[name] ?? "",
			onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
				form.values[name] = event.target.value
				children.props.onChange?.(event)
			},
		})
	}
	Form.Item = FormItem

	const Input = (props: React.InputHTMLAttributes<HTMLInputElement>) =>
		React.createElement("input", props)
	Input.TextArea = (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) =>
		React.createElement("textarea", props)

	const Popover = ({
		children,
		content,
		open,
		onOpenChange,
	}: {
		children: React.ReactElement
		content: React.ReactNode
		open?: boolean
		onOpenChange?: (open: boolean) => void
	}) =>
		React.createElement(
			"div",
			null,
			React.cloneElement(children, {
				onClick: (event: React.MouseEvent<HTMLElement>) => {
					children.props.onClick?.(event)
					onOpenChange?.(!open)
				},
			}),
			open ? React.createElement("div", null, content) : null,
		)

	const Flex = ({ children }: { children: React.ReactNode }) =>
		React.createElement("div", null, children)

	const Button = ({
		children,
		onClick,
		type: _type,
		danger: _danger,
		...props
	}: {
		children: React.ReactNode
		onClick?: React.MouseEventHandler<HTMLButtonElement>
		type?: string
		danger?: boolean
	}) => React.createElement("button", { type: "button", onClick, ...props }, children)

	return { Button, Flex, Form, Input, Popover }
})

vi.mock("../MagicModal", () => ({
	default: {
		confirm: modalMock.confirm,
	},
}))

vi.mock("../MagicButton", () => ({
	default: ({ children, icon, onClick, type: _type, danger: _danger, ...props }: any) => (
		<button type="button" onClick={onClick} {...props}>
			{icon}
			{children}
		</button>
	),
}))

vi.mock("./style", () => ({
	useStyles: () => ({
		styles: {
			form: "form",
			formItem: "form-item",
			popover: "popover",
			textIcon: "text-icon",
			icon: "icon",
			errorIcon: "error-icon",
		},
		cx: (...classNames: Array<string | false | undefined>) =>
			classNames.filter(Boolean).join(" "),
	}),
}))

vi.mock("../AdminComponentsProvider", () => ({
	LanguageType: {
		zh_CN: "zh_CN",
		en_US: "en_US",
		ms_MY: "ms_MY",
		vi_VN: "vi_VN",
		th_TH: "th_TH",
	},
	useAdminComponents: () => ({
		getLocale: (namespace: string) => {
			if (namespace === "MultiLangSetting") {
				return {
					languageSetting: "多语言配置",
					zh_CN: "中文",
					pleaseInput: "请输入",
					confirmClose: "确认关闭",
					unsavedChanges: "当前内容未保存，关闭后将丢失，是否继续关闭？",
					discard: "继续关闭",
					continueEditing: "继续编辑",
					saveAndClose: "保存并关闭",
				}
			}

			if (namespace === "ButtonGroup") {
				return {
					cancel: "取消",
					save: "保存",
				}
			}

			return {}
		},
	}),
}))

function renderConfirmFooter(config: ModalFuncProps) {
	if (typeof config.footer !== "function") return render(<>{config.footer}</>)

	return render(
		<>
			{config.footer(null, {
				OkBtn: () => null,
				CancelBtn: () => null,
			})}
		</>,
	)
}

describe("MultiLangSetting", () => {
	beforeEach(() => {
		modalMock.confirm.mockReset()
		modalMock.destroy.mockReset()
		modalMock.update.mockReset()
		modalMock.confirm.mockImplementation(() => ({
			destroy: modalMock.destroy,
			update: modalMock.update,
		}))
	})

	it("saves changes when clicking save and close in the close confirmation", async () => {
		const handleSave = vi.fn()
		const { container } = render(
			<MultiLangSetting
				info={{ zh_CN: "旧文案" }}
				supportLangs={["zh_CN" as any]}
				clickToToggle
				onSave={handleSave}
			/>,
		)

		const trigger = container.querySelector("button")
		expect(trigger).toBeTruthy()
		fireEvent.click(trigger as HTMLButtonElement)

		const input = await screen.findByPlaceholderText("请输入")
		fireEvent.change(input, { target: { value: "新文案" } })
		fireEvent.click(screen.getByText("取消"))

		await waitFor(() => expect(modalMock.confirm).toHaveBeenCalledTimes(1))
		const confirmConfig = modalMock.confirm.mock.calls[0][0] as ModalFuncProps

		renderConfirmFooter(confirmConfig)
		fireEvent.click(screen.getByText("保存并关闭"))

		await waitFor(() => {
			expect(handleSave).toHaveBeenCalledWith({ zh_CN: "新文案" })
			expect(modalMock.destroy).toHaveBeenCalledTimes(1)
		})
	})

	it("shows close confirmation when closing with unsaved changes", async () => {
		const { container } = render(
			<MultiLangSetting
				info={{ zh_CN: "旧文案" }}
				supportLangs={["zh_CN" as any]}
				clickToToggle
			/>,
		)

		const trigger = container.querySelector("button")
		expect(trigger).toBeTruthy()
		fireEvent.click(trigger as HTMLButtonElement)

		const input = await screen.findByPlaceholderText("请输入")
		fireEvent.change(input, { target: { value: "新文案" } })
		fireEvent.click(screen.getByText("取消"))

		await waitFor(() => expect(modalMock.confirm).toHaveBeenCalledTimes(1))
		expect(modalMock.confirm.mock.calls[0][0]).toMatchObject({
			title: "确认关闭",
			content: "当前内容未保存，关闭后将丢失，是否继续关闭？",
		})
	})
})
