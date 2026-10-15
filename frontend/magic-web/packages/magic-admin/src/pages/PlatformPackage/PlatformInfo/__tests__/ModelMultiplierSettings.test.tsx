import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { Form } from "antd"
import { afterEach, expect, it, vi } from "vitest"
import type { InputHTMLAttributes } from "react"
import ModelMultiplierSettings from "../ModelMultiplierSettings"

vi.unmock("antd")
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock("@admin-components", () => ({
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
	SubHeader: ({ title }: { title: string }) => <h3>{title}</h3>,
}))
afterEach(cleanup)

/** 使用模拟配置和真实表单验证旧版提交字段，不调用接口。 */
function Harness({ onFinish }: { onFinish: (values: unknown) => void }) {
	const [form] = Form.useForm()
	return (
		<Form
			form={form}
			onFinish={onFinish}
			initialValues={{
				model_billing_multiplier: {
					enabled: false,
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

it("显示管理员说明并以字符串提交完整配置", async () => {
	const submit = vi.fn()
	render(<Harness onFinish={submit} />)
	expect(screen.getByText("multiplier.explanation")).toBeTruthy()
	fireEvent.change(screen.getByLabelText("multiplier.basePrice"), {
		target: { value: "0.123456789012" },
	})
	fireEvent.change(screen.getByLabelText("multiplier.exchangeRate"), { target: { value: "7" } })
	fireEvent.click(screen.getByRole("switch"))
	fireEvent.click(screen.getByText("submit"))
	await waitFor(() =>
		expect(submit).toHaveBeenCalledWith({
			model_billing_multiplier: {
				enabled: true,
				base_price_cny: "0.123456789012",
				usd_to_cny_rate: "7",
			},
		}),
	)
})
