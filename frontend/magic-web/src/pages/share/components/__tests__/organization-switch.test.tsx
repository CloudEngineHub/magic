import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import ErrorDisplay from "../ErrorDisplay"
import ShareEmptyState from "../ShareEmptyState"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string, values?: { orgName?: string }) =>
			values?.orgName ? `${key}:${values.orgName}` : key,
	}),
}))

vi.mock("antd", () => ({
	Button: ({
		children,
		onClick,
		disabled,
		loading,
		className,
		type: buttonType,
		...props
	}: {
		children: React.ReactNode
		onClick?: React.MouseEventHandler<HTMLButtonElement>
		disabled?: boolean
		loading?: boolean
		className?: string
		type?: string
	}) => {
		void buttonType

		return (
			<button
				type="button"
				onClick={onClick}
				disabled={disabled || loading}
				className={className}
				{...props}
			>
				{children}
			</button>
		)
	},
	Flex: ({ children, gap, ...props }: { children: React.ReactNode; gap?: number }) => {
		void gap

		return <div {...props}>{children}</div>
	},
}))

vi.mock("@/models/user/hooks", () => ({
	useUserInfo: () => ({ userInfo: { user_id: "current-user" } }),
}))

vi.mock("@/layouts/BaseLayout/components/Header/components/Logo", () => ({
	default: () => <div data-testid="share-empty-logo" />,
}))

vi.mock("@/components/business/UserAvatarRender", () => ({
	default: ({ userInfo }: { userInfo: { nickname?: string } | null }) => (
		<div data-testid="share-empty-avatar">{userInfo?.nickname}</div>
	),
}))

vi.mock("../ShareEmptyState/style", () => ({
	useStyles: () => ({
		styles: {
			container: "container",
			header: "header",
			logo: "logo",
			content: "content",
			main: "main",
			icon: "icon",
			title: "title",
			card: "card",
			cardContent: "cardContent",
			tip: "tip",
			userInfo: "userInfo",
			avatarContainer: "avatarContainer",
			avatar: "avatar",
			userName: "userName",
			button: "button",
		},
	}),
}))

vi.mock("../WorkspaceButton", () => ({
	default: () => <button type="button">workspace</button>,
}))

vi.mock("@/routes/history", () => ({
	history: { push: vi.fn(), replace: vi.fn() },
}))

vi.mock("@/routes/constants", () => ({
	RouteName: { Login: "login", Super: "super" },
}))

describe("share organization switching", () => {
	it("renders the target organization and invokes the switch action", () => {
		const onSwitch = vi.fn()

		render(
			<ShareEmptyState
				currentOrgName="Current Team"
				targetOrgName="Target Team"
				userInfo={{ nickname: "Target User" }}
				onSwitch={onSwitch}
				isFileShare
			/>,
		)

		expect(screen.getByTestId("share-empty-state-tip")).toHaveTextContent(
			"share.emptyState.switchTip:Target Team",
		)
		expect(screen.getByTestId("share-empty-state-user")).toHaveTextContent("Target User")

		fireEvent.click(screen.getByTestId("share-empty-switch-button"))

		expect(onSwitch).toHaveBeenCalledOnce()
	})

	it("uses the migrated error-state typography for denied shares", () => {
		render(<ErrorDisplay isFileShare />)

		expect(screen.getByTestId("error-display-message")).toHaveClass(
			"text-lg",
			"leading-6",
			"text-foreground/80",
		)
		expect(screen.getByTestId("error-display-description")).toHaveClass("mt-2.5", "leading-5")
	})
})
