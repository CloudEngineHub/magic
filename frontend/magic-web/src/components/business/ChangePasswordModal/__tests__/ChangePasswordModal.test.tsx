import type { ButtonHTMLAttributes, PropsWithChildren } from "react"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import ChangePasswordModal from "../index"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock("@/apis", () => ({
	UserApi: {
		changePassword: vi.fn(),
	},
}))

vi.mock("ahooks", () => ({
	useMemoizedFn: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}))

vi.mock("antd/es/form/Form", () => ({
	useForm: () => [
		{
			validateFields: vi.fn(),
			resetFields: vi.fn(),
		},
	],
}))

vi.mock("@/hooks/useIsMobile", () => ({
	useIsMobile: () => false,
}))

vi.mock("@/components/base/MagicModal", () => ({
	default: ({ open, children }: PropsWithChildren<{ open: boolean }>) =>
		open ? <div>{children}</div> : null,
}))

vi.mock("@/components/shadcn-composed/action-drawer", () => ({
	ActionDrawer: ({ children }: PropsWithChildren) => <div>{children}</div>,
}))

vi.mock("@/components/shadcn-ui/button", () => ({
	Button: ({
		children,
		...props
	}: PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement>>) => (
		<button type="button" {...props}>
			{children}
		</button>
	),
}))

vi.mock("../EmailVerify", () => ({
	EmailVerify: () => <div>email-form</div>,
}))

vi.mock("../PhoneVerify", () => ({
	PhoneVerify: () => <div>phone-form</div>,
}))

describe("ChangePasswordModal", () => {
	const defaultProps = {
		open: true,
		onOpenChange: vi.fn(),
	}

	it.each([undefined, null, "", "   "])(
		"does not show email verification when email is %p",
		(userEmail) => {
			render(<ChangePasswordModal {...defaultProps} userEmail={userEmail} />)

			expect(screen.queryByText("setting.emailVerify")).not.toBeInTheDocument()
			expect(screen.queryByText("email-form")).not.toBeInTheDocument()
			expect(screen.getByText("setting.resetPassword")).toBeDisabled()
		},
	)

	it("updates the available strategy when contact information loads asynchronously", () => {
		const { rerender } = render(<ChangePasswordModal {...defaultProps} />)

		rerender(<ChangePasswordModal {...defaultProps} userEmail="user@example.com" />)

		expect(screen.getByText("setting.emailVerify")).toBeInTheDocument()
		expect(screen.getByText("email-form")).toBeInTheDocument()
		expect(screen.getByText("setting.resetPassword")).toBeEnabled()
	})

	it("prefers phone by default and allows switching to email", () => {
		render(
			<ChangePasswordModal
				{...defaultProps}
				userPhone="13800138000"
				userEmail="user@example.com"
			/>,
		)

		expect(screen.getByText("phone-form")).toBeInTheDocument()
		fireEvent.click(screen.getByText("setting.emailVerify"))
		expect(screen.getByText("email-form")).toBeInTheDocument()
	})
})
