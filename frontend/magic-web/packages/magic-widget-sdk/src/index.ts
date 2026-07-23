import { createMagicWidgetController } from "./controller"
import type { MagicWidget } from "./types"

export type { MagicWidget } from "./types"

const controller = createMagicWidgetController()

const magicWidget: MagicWidget.Global = {
	version: "0.1.0",
	mount: controller.mount,
	open: controller.open,
	close: controller.close,
	destroy: controller.destroy,
	on: controller.on,
	setInput: controller.setInput,
	appendInput: controller.appendInput,
	clearInput: controller.clearInput,
	getInput: controller.getInput,
	sendMessage: controller.sendMessage,
	newConversation: controller.newConversation,
}

declare global {
	interface Window {
		MagicWidget?: MagicWidget.Global
	}
}

if (typeof window !== "undefined") {
	window.MagicWidget = magicWidget
}

export default magicWidget
