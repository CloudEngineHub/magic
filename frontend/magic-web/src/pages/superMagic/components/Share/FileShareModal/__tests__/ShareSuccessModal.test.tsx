import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import ShareSuccessModal from "../ShareSuccessModal"

vi.mock("react-i18next", () => ({
	initReactI18next: {
		type: "3rdParty",
		init: () => undefined,
	},
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}))

vi.mock("@/hooks/useIsMobile", () => ({
	useIsMobile: () => false,
}))

vi.mock("@/pages/superMagic/components/ShareManagement/openShareManagementModal", () => ({
	openShareManagementModal: vi.fn(),
}))

vi.mock("@/models/user", () => ({
	userStore: {
		user: {
			userInfo: {
				nickname: "Mock User",
				real_name: "Mock User",
			},
		},
	},
}))

vi.mock("@/assets/locales/locale-adapters", () => ({
	getLocaleModules: () => ({}),
	getAdminLocaleModules: () => ({}),
	loadFallbackLocale: vi.fn(),
	loadMagicFlowLocale: vi.fn(),
}))

vi.mock("../hooks/useFileDisplayConfig", () => ({
	useFileDisplayConfig: () => ({
		fileDisplayConfig: null,
		loading: false,
	}),
}))

vi.mock("antd", () => ({
	QRCode: () => <div data-testid="qr-code" />,
}))

vi.mock("antd-style", () => ({
	createStyles: () => () => ({ styles: {} }),
}))

vi.mock("@/pages/superMagicMobile/components/CommonPopup", () => ({
	default: () => null,
}))

vi.mock("@/pages/superMagicMobile/components/ActionsPopup", () => ({
	default: () => null,
}))

vi.mock("@/pages/superMagicMobile/components/MobileButton", () => ({
	default: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
}))

vi.mock("@/components/base/MagicIcon", () => ({
	default: () => null,
}))

vi.mock("@/components/base/MagicModal", () => ({
	default: {
		confirm: vi.fn(),
	},
}))

vi.mock("@/components/base/MagicToaster/utils", () => ({
	default: {
		success: vi.fn(),
		error: vi.fn(),
	},
}))

vi.mock("@/utils/clipboard-helpers", () => ({
	clipboard: {
		writeText: vi.fn(),
	},
}))

vi.mock("@/utils/file", () => ({
	downloadFile: vi.fn(),
}))

vi.mock("../../../utils/handleFIle", () => ({
	downloadFileWithAnchor: vi.fn(),
}))

function renderShareSuccessModal(props?: Partial<React.ComponentProps<typeof ShareSuccessModal>>) {
	return render(
		<ShareSuccessModal
			open
			onClose={vi.fn()}
			shareName="demo-recording-share"
			fileCount={1}
			mainFileName="demo-recording.wav"
			shareUrl="https://example.test/share/files/demo-share"
			shareType={5}
			{...props}
		/>,
	)
}

describe("ShareSuccessModal", () => {
	it("shows the generic manage-share link by default", () => {
		renderShareSuccessModal()

		expect(screen.getByText("share.manageShareLinks")).toBeInTheDocument()
	})

	it("hides the generic manage-share link for recording share success UI", () => {
		renderShareSuccessModal({ hideManageShareLinks: true })

		expect(screen.queryByText("share.manageShareLinks")).not.toBeInTheDocument()
		expect(screen.getByTestId("share-success-modal-footer-actions")).toHaveClass("justify-end")
	})
})
