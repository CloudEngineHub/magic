import { describe, expect, it } from "vitest"
import { ShareType } from "@/pages/superMagic/components/Share/types"
import {
	buildMicroAppAccessUrl,
	buildMicroAppCopyUrl,
	buildMicroAppPublishPayload,
	buildMicroAppShareText,
	createFormStateFromPublishedItem,
	getMicroAppPublishValidationError,
	hasMicroAppPublishFormChanged,
} from "../microAppPublishDialogUtils"

describe("microAppPublishDialogUtils", () => {
	it("builds the new app_name publish payload and optional cover", () => {
		expect(
			buildMicroAppPublishPayload({
				appName: "  Demo App  ",
				shareType: ShareType.Public,
				shareRange: "all",
				targets: [],
				password: "123456",
				coverFileKey: "micro-app/covers/demo.png",
				coverUrl: "",
			}),
		).toEqual({
			app_name: "Demo App",
			share_type: ShareType.Public,
			cover_file_key: "micro-app/covers/demo.png",
		})
	})

	it("identifies incomplete publish information", () => {
		expect(
			getMicroAppPublishValidationError({
				appName: "   ",
				shareType: ShareType.Organization,
				shareRange: "all",
				targets: [],
				password: "123456",
				coverUrl: "",
			}),
		).toBe("projectNameRequired")
	})

	it("does not fabricate a password for an existing protected share", () => {
		expect(
			createFormStateFromPublishedItem({
				share_type: ShareType.PasswordProtected,
			}),
		).toMatchObject({ password: "" })
	})

	it("builds access and share text from the stable app link", () => {
		expect(
			buildMicroAppAccessUrl({ app_id: "app-1", access_url: "https://example.com/app-1" }),
		).toBe("https://example.com/app-1")
		expect(
			buildMicroAppShareText({
				accessUrl: "https://example.com/app-1",
				shareTitle: "You're invited to use the micro app “Demo App”",
				accessHint: "Open the link below to access it:",
				passwordText: "Password: abcd1234",
			}),
		).toBe(
			"You're invited to use the micro app “Demo App”\n\nOpen the link below to access it:\nhttps://example.com/app-1\n\nPassword: abcd1234",
		)
		expect(
			buildMicroAppShareText({
				accessUrl: "https://example.com/app-1",
				shareTitle: "You're invited to use the micro app “Demo App”",
				accessHint: "Open the link below to access it:",
			}),
		).toBe(
			"You're invited to use the micro app “Demo App”\n\nOpen the link below to access it:\nhttps://example.com/app-1",
		)
	})

	it("adds an encoded password to a copied access link", () => {
		expect(
			buildMicroAppCopyUrl("https://example.com/micro-app/app-1?source=publish", "open 1&2"),
		).toBe("https://example.com/micro-app/app-1?source=publish&password=open+1%262")
	})

	it("detects unsaved changes against the published configuration", () => {
		const publishedFormState = createFormStateFromPublishedItem({
			app_name: "Demo App",
			share_type: ShareType.PasswordProtected,
			password: "open1234",
			cover_file_key: "covers/demo.png",
		})

		expect(hasMicroAppPublishFormChanged(publishedFormState, publishedFormState)).toBe(false)
		expect(
			hasMicroAppPublishFormChanged(
				{ ...publishedFormState, password: "next1234" },
				publishedFormState,
			),
		).toBe(true)
		expect(
			hasMicroAppPublishFormChanged(
				{ ...publishedFormState, shareType: ShareType.Public },
				publishedFormState,
			),
		).toBe(true)
		expect(
			hasMicroAppPublishFormChanged(
				{ ...publishedFormState, coverFileKey: null, coverUrl: "" },
				publishedFormState,
			),
		).toBe(true)
	})
})
