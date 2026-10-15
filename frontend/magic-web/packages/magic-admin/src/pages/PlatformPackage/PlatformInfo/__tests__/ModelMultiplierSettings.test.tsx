import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { Form } from "antd"
import { afterEach, expect, it, vi } from "vitest"
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react"
import ModelMultiplierSettings from "../ModelMultiplierSettings"

vi.unmock("antd")
// 外层页面样式依赖管理端主题；此处只验证折叠与保存行为。
vi.mock("../styles", () => ({
	useStyles: () => ({
		styles: {
			formWrapper: "form-wrapper",
			formItem: "form-item",
			formItemLabel: "form-item-label",
			formItemContent: "form-item-content",
		},
		cx: (...values: string[]) => values.join(" "),
	}),
}))

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock("@admin-components", () => ({
	MagicButton: (props: ButtonHTMLAttributes<HTMLButtonElement>) => (
		<button
			type="button"
			onClick={props.onClick}
			aria-expanded={props["aria-expanded"]}
			aria-controls={props["aria-controls"]}
		>
			{props.children}
		</button>
	),
	MagicInput: (props: InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
	MagicSwitch: ({
		checked,
		onChange,
		...props
	}: {
		checked: boolean
		onChange: (value: boolean) => void
	}) => (
		<button
			{...props}
			type="button"
			role="switch"
			aria-checked={checked}
			onClick={() => onChange(!checked)}
		/>
	),
	SubHeader: ({ title, extra }: { title: string; extra?: ReactNode }) => (
		<div>
			<h3>{title}</h3>
			{extra}
		</div>
	),
}))
afterEach(cleanup)

/** 使用模拟配置和真实表单验证旧版提交字段，不调用接口。 */
function Harness({
	onFinish,
	enabled = false,
}: {
	onFinish: (values: unknown) => void
	enabled?: boolean
}) {
	const [form] = Form.useForm()
	return (
		<Form
			form={form}
			onFinish={onFinish}
			initialValues={{
				model_billing_multiplier: {
					enabled,
					base_price_cny: null,
					usd_to_cny_rate: null,
				},
			}}
		>
			<ModelMultiplierSettings form={form} disabled={false} />
			<button type="submit">submit</button>
		</Form>
	)
}

it("默认折叠，展开编辑后再次折叠仍以字符串提交完整配置", async () => {
	const submit = vi.fn()
	render(<Harness onFinish={submit} />)
	const expand = screen.getByRole("button", { name: "multiplier.expand" })
	const content = document.getElementById(expand.getAttribute("aria-controls") || "")
	expect(content?.hidden).toBe(true)
	fireEvent.click(expand)
	expect(content?.hidden).toBe(false)
	expect(screen.getByText("multiplier.rulesTitle")).toBeTruthy()
	fireEvent.change(screen.getByLabelText("multiplier.inputPrice"), {
		target: { value: "2.000000000001" },
	})
	fireEvent.change(screen.getByLabelText("multiplier.outputPrice"), { target: { value: "3" } })
	fireEvent.change(screen.getByLabelText("multiplier.exchangeRateLabel"), {
		target: { value: "7" },
	})
	fireEvent.click(screen.getByRole("switch"))
	fireEvent.click(screen.getByRole("button", { name: "multiplier.collapse" }))
	expect(content?.hidden).toBe(true)
	fireEvent.click(screen.getByText("submit"))
	await waitFor(() =>
		expect(submit).toHaveBeenCalledWith({
			model_billing_multiplier: {
				enabled: true,
				base_price_cny: null,
				input_price_cny: "2.000000000001",
				output_price_cny: "3",
				usd_to_cny_rate: "7",
			},
		}),
	)
})

/** 折叠状态也必须校验配置，失败后自动展开，避免全页保存无可见反馈。 */
it("折叠时保存无效配置自动展开并显示错误", async () => {
	const submit = vi.fn()
	render(<Harness onFinish={submit} enabled />)
	fireEvent.click(screen.getByText("submit"))
	await waitFor(() =>
		expect(
			screen
				.getByRole("button", { name: "multiplier.collapse" })
				.getAttribute("aria-expanded"),
		).toBe("true"),
	)
	await waitFor(() =>
		expect(screen.getAllByText("multiplier.invalidPrices").length).toBeGreaterThan(0),
	)
	expect(submit).not.toHaveBeenCalled()
})
