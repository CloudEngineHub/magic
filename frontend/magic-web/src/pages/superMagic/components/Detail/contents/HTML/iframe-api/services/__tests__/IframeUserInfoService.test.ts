import { describe, expect, it, vi } from "vitest"
import { USER_INFO_MESSAGE_TYPES, USER_INFO_SCOPES } from "../../types"
import { IframeUserInfoService, type IframeUserInfoConfig } from "../IframeUserInfoService"

function createService(overrides?: Partial<IframeUserInfoConfig>) {
	const postToIframe = vi.fn()
	const cfg: IframeUserInfoConfig = {
		postToIframe,
		getUserInfo: () => null,
		...overrides,
	}
	return { service: new IframeUserInfoService(cfg), postToIframe }
}

describe("IframeUserInfoService", () => {
	const fullUserInfo = {
		user_id: "user-1",
		magic_id: "magic-1",
		nickname: "Nick",
		real_name: "Real Name",
		name: "Display Name",
		avatar: "https://example.com/avatar.png",
		organization_code: "org-1",
	}

	it("returns only display-safe user fields by default", async () => {
		const { service, postToIframe } = createService({
			getUserInfo: () => fullUserInfo,
		})

		await service.handleMessage(USER_INFO_MESSAGE_TYPES.GET_USER_INFO_REQUEST, {
			requestId: "req-display",
		})

		expect(postToIframe).toHaveBeenCalledWith({
			type: USER_INFO_MESSAGE_TYPES.GET_USER_INFO_RESPONSE,
			requestId: "req-display",
			success: true,
			userInfo: {
				name: "Display Name",
				avatar: "https://example.com/avatar.png",
			},
		})
	})

	it("delegates all sensitive scopes to the shared permission controller", async () => {
		const authorizeUserInfo = vi.fn().mockResolvedValue(true)
		const { service, postToIframe } = createService({
			getUserInfo: () => fullUserInfo,
			authorizeUserInfo,
		})

		await service.handleMessage(USER_INFO_MESSAGE_TYPES.GET_USER_INFO_REQUEST, {
			requestId: "req-profile",
			scopes: [USER_INFO_SCOPES.NAME, USER_INFO_SCOPES.IDENTITY],
			reason: "Build a profile card",
		})

		expect(authorizeUserInfo).toHaveBeenCalledWith({
			scopes: [USER_INFO_SCOPES.NAME, USER_INFO_SCOPES.IDENTITY],
			reason: "Build a profile card",
		})
		expect(postToIframe).toHaveBeenCalledWith({
			type: USER_INFO_MESSAGE_TYPES.GET_USER_INFO_RESPONSE,
			requestId: "req-profile",
			success: true,
			userInfo: {
				name: "Display Name",
				avatar: "https://example.com/avatar.png",
				nickname: "Nick",
				real_name: "Real Name",
				user_id: "user-1",
				magic_id: "magic-1",
			},
		})
	})

	it("does not keep a second authorization cache inside the user info service", async () => {
		const authorizeUserInfo = vi.fn().mockResolvedValue(true)
		const { service } = createService({
			getUserInfo: () => fullUserInfo,
			authorizeUserInfo,
		})
		const request = {
			requestId: "req-identity",
			scopes: [USER_INFO_SCOPES.IDENTITY],
		}

		await service.handleMessage(USER_INFO_MESSAGE_TYPES.GET_USER_INFO_REQUEST, request)
		await service.handleMessage(USER_INFO_MESSAGE_TYPES.GET_USER_INFO_REQUEST, {
			...request,
			requestId: "req-identity-again",
		})

		expect(authorizeUserInfo).toHaveBeenCalledTimes(2)
	})

	it("rejects invalid user info scopes before authorization", async () => {
		const authorizeUserInfo = vi.fn().mockResolvedValue(true)
		const { service, postToIframe } = createService({
			getUserInfo: () => fullUserInfo,
			authorizeUserInfo,
		})

		await service.handleMessage(USER_INFO_MESSAGE_TYPES.GET_USER_INFO_REQUEST, {
			requestId: "req-invalid",
			scopes: ["user.profile.unknown"],
		})

		expect(authorizeUserInfo).not.toHaveBeenCalled()
		expect(postToIframe).toHaveBeenCalledWith({
			type: USER_INFO_MESSAGE_TYPES.GET_USER_INFO_RESPONSE,
			requestId: "req-invalid",
			success: false,
			error: "Invalid user info scope",
		})
	})

	it("rejects sensitive access when stable user identity is unavailable", async () => {
		const authorizeUserInfo = vi.fn().mockResolvedValue(true)
		const { service, postToIframe } = createService({
			getUserInfo: () => ({ ...fullUserInfo, user_id: "" }),
			authorizeUserInfo,
		})

		await service.handleMessage(USER_INFO_MESSAGE_TYPES.GET_USER_INFO_REQUEST, {
			requestId: "req-no-identity",
			scopes: [USER_INFO_SCOPES.IDENTITY],
		})

		expect(authorizeUserInfo).not.toHaveBeenCalled()
		expect(postToIframe).toHaveBeenCalledWith({
			type: USER_INFO_MESSAGE_TYPES.GET_USER_INFO_RESPONSE,
			requestId: "req-no-identity",
			success: false,
			error: "User identity is not available",
		})
	})

	it("rejects when the current user changes during authorization", async () => {
		let currentUserInfo = fullUserInfo
		const authorizeUserInfo = vi.fn().mockImplementation(async () => {
			currentUserInfo = {
				...fullUserInfo,
				user_id: "user-2",
				magic_id: fullUserInfo.magic_id,
			}
			return true
		})
		const { service, postToIframe } = createService({
			getUserInfo: () => currentUserInfo,
			authorizeUserInfo,
		})

		await service.handleMessage(USER_INFO_MESSAGE_TYPES.GET_USER_INFO_REQUEST, {
			requestId: "req-user-switch",
			scopes: [USER_INFO_SCOPES.IDENTITY],
		})

		expect(postToIframe).toHaveBeenCalledWith({
			type: USER_INFO_MESSAGE_TYPES.GET_USER_INFO_RESPONSE,
			requestId: "req-user-switch",
			success: false,
			error: "User identity changed during authorization",
		})
	})

	it("rejects when the shared permission controller denies access", async () => {
		const { service, postToIframe } = createService({
			getUserInfo: () => fullUserInfo,
			authorizeUserInfo: vi.fn().mockResolvedValue(false),
		})

		await service.handleMessage(USER_INFO_MESSAGE_TYPES.GET_USER_INFO_REQUEST, {
			requestId: "req-denied",
			scopes: [USER_INFO_SCOPES.ORGANIZATION],
		})

		expect(postToIframe).toHaveBeenCalledWith({
			type: USER_INFO_MESSAGE_TYPES.GET_USER_INFO_RESPONSE,
			requestId: "req-denied",
			success: false,
			error: "User denied access to requested profile fields",
		})
	})
})
