import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { SuperMagicApi } from "@/apis"
import magicToast from "@/components/base/MagicToaster/utils"
import {
	canUseNativeShare,
	shareToNativeTarget,
} from "@/pages/superMagic/components/Share/utils/nativeShare"
import { clipboard } from "@/utils/clipboard-helpers"
import MobileTopicShare from "../MobileTopicShare"
import { ShareType } from "../types"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}))

vi.mock("@/utils/clipboard-helpers", () => ({
	clipboard: {
		writeText: vi.fn(),
	},
}))

vi.mock("@/models/user", () => ({
	userStore: {
		user: {
			userInfo: {
				nickname: "Fictional Share Tester",
				real_name: "Fictional Backup Tester",
			},
		},
	},
}))

vi.mock("@/components/base/MagicToaster/utils", () => ({
	default: {
		success: vi.fn(),
		error: vi.fn(),
	},
}))

vi.mock("@/pages/superMagic/components/Share/utils/nativeShare", () => ({
	canUseNativeShare: vi.fn(() => false),
	shareToNativeTarget: vi.fn(),
}))

vi.mock("@/apis", () => ({
	SuperMagicApi: {
		createOrUpdateShareResource: vi.fn(),
		cancelShareResource: vi.fn(),
	},
}))

describe("MobileTopicShare", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		vi.mocked(canUseNativeShare).mockReturnValue(false)
		vi.mocked(shareToNativeTarget).mockResolvedValue("shared")
	})

	it("未开启分享时只展示主开关卡片，不展示链接和高级设置", () => {
		render(
			<MobileTopicShare
				type={ShareType.None}
				shareContext={{ resource_id: "topic-1" }}
				extraData={{ passwordEnabled: true, password: "abc123" }}
				setExtraData={vi.fn()}
			/>,
		)

		expect(screen.getByTestId("mobile-topic-share-toggle-card")).toBeInTheDocument()
		expect(screen.queryByTestId("mobile-topic-share-link-card")).not.toBeInTheDocument()
		expect(
			screen.queryByTestId("mobile-topic-share-advanced-settings-card"),
		).not.toBeInTheDocument()
	})

	it("公开分享时只展示链接卡片和密码保护开关，不展示密码卡片", () => {
		render(
			<MobileTopicShare
				type={ShareType.Public}
				shareContext={{
					resource_id: "topic-1",
					share_url: "https://example.com/topic-1",
				}}
				extraData={{
					passwordEnabled: false,
					shareUrl: "https://example.com/topic-1",
				}}
				setExtraData={vi.fn()}
			/>,
		)

		expect(screen.getByTestId("mobile-topic-share-link-card")).toHaveTextContent(
			"https://example.com/topic-1",
		)
		expect(screen.getByTestId("mobile-topic-share-password-toggle-row")).toBeInTheDocument()
		expect(screen.queryByTestId("mobile-topic-share-password-card")).not.toBeInTheDocument()
		expect(
			screen.queryByTestId("mobile-topic-share-advanced-settings-card"),
		).not.toBeInTheDocument()
	})

	it("密码分享时展示密码卡片，但不再提供复制与重置入口", () => {
		render(
			<MobileTopicShare
				type={ShareType.PasswordProtected}
				shareContext={{ resource_id: "topic-1" }}
				extraData={{
					passwordEnabled: true,
					password: "abc123",
					shareUrl: "https://example.com/topic-1?password=abc123",
				}}
				setExtraData={vi.fn()}
			/>,
		)

		expect(screen.getByTestId("mobile-topic-share-password-card")).toBeInTheDocument()
		expect(
			screen.queryByTestId("mobile-topic-share-password-copy-button"),
		).not.toBeInTheDocument()
		expect(
			screen.queryByTestId("mobile-topic-share-password-reset-button"),
		).not.toBeInTheDocument()
	})

	it("点击复制链接按钮会复制 PC 对齐的多行话题分享文案", () => {
		render(
			<MobileTopicShare
				type={ShareType.Public}
				topicTitle="测试话题"
				shareContext={{
					resource_id: "topic-1",
					share_url: "https://example.com/topic-1",
				}}
				extraData={{
					passwordEnabled: false,
					shareUrl: "https://example.com/topic-1",
				}}
				setExtraData={vi.fn()}
			/>,
		)

		fireEvent.click(screen.getByTestId("mobile-topic-share-copy-link-button"))
		const copiedText = String(vi.mocked(clipboard.writeText).mock.calls[0]?.[0])
		expect(copiedText).toContain("share.shareMessageTopic")
		expect(copiedText).toContain("share.shareMessageTopicLink")
		expect(copiedText).toContain("share.createdBy.footerLine")
		expect(copiedText).not.toBe("https://example.com/topic-1")
		expect(copiedText.split("\n").length).toBeGreaterThan(3)
	})

	it("浏览器不支持系统分享时不展示分享至按钮", () => {
		vi.mocked(canUseNativeShare).mockReturnValue(false)

		render(
			<MobileTopicShare
				type={ShareType.Public}
				topicTitle="Fictional Topic Unsupported"
				shareContext={{
					resource_id: "fictional-topic-unsupported",
					share_url: "https://example.invalid/topic-unsupported",
				}}
				extraData={{
					passwordEnabled: false,
					shareUrl: "https://example.invalid/topic-unsupported",
				}}
				setExtraData={vi.fn()}
			/>,
		)

		expect(
			screen.queryByTestId("mobile-topic-share-native-share-button"),
		).not.toBeInTheDocument()
	})

	it("浏览器支持系统分享时展示分享至按钮且复制链接保持纯文字", () => {
		vi.mocked(canUseNativeShare).mockReturnValue(true)

		render(
			<MobileTopicShare
				type={ShareType.Public}
				topicTitle="Fictional Topic Visual"
				shareContext={{
					resource_id: "fictional-topic-visual",
					share_url: "https://example.invalid/topic-visual",
				}}
				extraData={{
					passwordEnabled: false,
					shareUrl: "https://example.invalid/topic-visual",
				}}
				setExtraData={vi.fn()}
			/>,
		)

		expect(screen.getByTestId("mobile-topic-share-native-share-button")).toHaveTextContent(
			"share.shareToSystem",
		)
		expect(
			screen.getByTestId("mobile-topic-share-native-share-button").querySelector("svg"),
		).toBeInTheDocument()
		expect(
			screen.getByTestId("mobile-topic-share-copy-link-button").querySelector("svg"),
		).toBeNull()
	})

	it("点击分享至按钮会使用已生成的话题分享文案调用系统分享", async () => {
		vi.mocked(canUseNativeShare).mockReturnValue(true)

		render(
			<MobileTopicShare
				type={ShareType.Public}
				topicTitle="Fictional Topic Native"
				shareContext={{
					resource_id: "fictional-topic-native",
					share_url: "https://example.invalid/topic-native",
				}}
				extraData={{
					passwordEnabled: false,
					shareUrl: "https://example.invalid/topic-native",
				}}
				setExtraData={vi.fn()}
			/>,
		)

		fireEvent.click(screen.getByTestId("mobile-topic-share-native-share-button"))

		await waitFor(() => {
			expect(shareToNativeTarget).toHaveBeenCalledWith(
				expect.objectContaining({
					title: "Fictional Topic Native",
					url: "https://example.invalid/topic-native",
				}),
			)
		})
		const payload = vi.mocked(shareToNativeTarget).mock.calls[0]?.[0]
		expect(payload?.text).toContain("share.shareMessageTopic")
		expect(payload?.text).toContain("share.shareMessageTopicLink")
	})

	it("系统分享失败时展示失败提示", async () => {
		vi.mocked(canUseNativeShare).mockReturnValue(true)
		vi.mocked(shareToNativeTarget).mockResolvedValue("failed")

		render(
			<MobileTopicShare
				type={ShareType.Public}
				topicTitle="Fictional Topic Failed"
				shareContext={{
					resource_id: "fictional-topic-failed",
					share_url: "https://example.invalid/topic-failed",
				}}
				extraData={{
					passwordEnabled: false,
					shareUrl: "https://example.invalid/topic-failed",
				}}
				setExtraData={vi.fn()}
			/>,
		)

		fireEvent.click(screen.getByTestId("mobile-topic-share-native-share-button"))

		await waitFor(() => {
			expect(magicToast.error).toHaveBeenCalledWith("share.nativeShareFailed")
		})
	})

	it("开启密码保护时复制文案中的链接仍包含 password 参数", () => {
		render(
			<MobileTopicShare
				type={ShareType.PasswordProtected}
				topicTitle="测试话题"
				shareContext={{
					resource_id: "topic-1",
					share_url: "https://example.com/topic-1?password=abc123",
				}}
				extraData={{
					passwordEnabled: true,
					password: "abc123",
					shareUrl: "https://example.com/topic-1?password=abc123",
				}}
				setExtraData={vi.fn()}
			/>,
		)

		fireEvent.click(screen.getByTestId("mobile-topic-share-copy-link-button"))
		const copiedText = String(vi.mocked(clipboard.writeText).mock.calls[0]?.[0])
		expect(copiedText).toContain("share.shareMessageTopic")
		expect(copiedText).toContain("share.shareMessageTopicLink")
		expect(copiedText).not.toBe("https://example.com/topic-1?password=abc123")
		expect(copiedText.split("\n").length).toBeGreaterThan(3)
	})

	it("点击密码保护行会切换为密码分享并调用保存接口", async () => {
		render(
			<MobileTopicShare
				type={ShareType.Public}
				shareContext={{ resource_id: "topic-1" }}
				extraData={{ passwordEnabled: false, password: "abc123" }}
				setExtraData={vi.fn()}
			/>,
		)

		fireEvent.click(screen.getByTestId("mobile-topic-share-password-toggle-row"))

		await waitFor(() => {
			expect(SuperMagicApi.createOrUpdateShareResource).toHaveBeenCalled()
		})
	})

	it("关闭分享成功后停留当前页，不自动关闭弹层", async () => {
		const onClose = vi.fn()
		vi.mocked(SuperMagicApi.cancelShareResource).mockResolvedValue(undefined as never)

		render(
			<MobileTopicShare
				type={ShareType.Public}
				shareContext={{ resource_id: "topic-1" }}
				extraData={{ passwordEnabled: false }}
				setExtraData={vi.fn()}
				onClose={onClose}
			/>,
		)

		fireEvent.click(screen.getByTestId("mobile-topic-share-toggle-row"))

		await waitFor(() => {
			expect(SuperMagicApi.cancelShareResource).toHaveBeenCalledWith({
				resourceId: "topic-1",
			})
		})

		expect(onClose).not.toHaveBeenCalled()
	})
})
