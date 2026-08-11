import { fireEvent, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import { ShareType } from "@/pages/superMagic/components/Share/types"
import {
	getPublishDialogMocks,
	renderDialog,
	resetPublishDialogMocks,
} from "./MicroAppPublishDialog.testUtils"

const mocks = getPublishDialogMocks()

describe("MicroAppPublishDialog fullscreen settings", () => {
	beforeEach(() => {
		resetPublishDialogMocks()
	})

	it("loads and saves the fullscreen display setting", async () => {
		mocks.getMicroAppProject.mockResolvedValue({
			app_id: "app-1",
			project_id: "project-1",
			project: { id: "project-1", project_name: "Demo App" },
			publish: {
				app_id: "app-1",
				app_name: "Demo App",
				resource_id: "resource-1",
				share_code: "share-code-1",
				share_type: ShareType.Public,
				extra: { pure_mode: true },
				publish_status: "published",
			},
		})

		renderDialog()

		const fullScreenSwitch = await screen.findByTestId("micro-app-publish-full-screen")
		await waitFor(() => expect(fullScreenSwitch).toHaveAttribute("data-state", "checked"))
		expect(mocks.getShareInfoByCode).not.toHaveBeenCalled()
		expect(screen.getByTestId("micro-app-publish-save")).toBeDisabled()

		fireEvent.click(fullScreenSwitch)
		expect(screen.getByTestId("micro-app-publish-save")).toBeEnabled()
		fireEvent.click(screen.getByTestId("micro-app-publish-save"))

		await waitFor(() => {
			expect(mocks.publishMicroAppProject).toHaveBeenCalledWith("app-1", {
				app_name: "Demo App",
				share_type: ShareType.Public,
				extra: { pure_mode: false },
			})
		})
	})

	it("loads fullscreen from share settings for historical publish details", async () => {
		mocks.getMicroAppProject.mockResolvedValue({
			app_id: "app-1",
			project_id: "project-1",
			project: { id: "project-1", project_name: "Demo App" },
			publish: {
				app_id: "app-1",
				app_name: "Demo App",
				resource_id: "resource-1",
				share_code: "share-code-1",
				share_type: ShareType.Public,
				publish_status: "published",
			},
		})
		mocks.getShareInfoByCode.mockResolvedValue({ extra: { pure_mode: true } })

		renderDialog()

		const fullScreenSwitch = await screen.findByTestId("micro-app-publish-full-screen")
		await waitFor(() => expect(fullScreenSwitch).toHaveAttribute("data-state", "checked"))
		expect(mocks.getShareInfoByCode).toHaveBeenCalledWith({ code: "share-code-1" })
	})
})
