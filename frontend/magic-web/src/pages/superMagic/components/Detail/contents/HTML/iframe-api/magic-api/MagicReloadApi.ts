/**
 * MagicReloadApi
 *
 * 向 iframe 内的 window.Magic.reload 注入页面重载 API。
 * 调用后通过 postMessage 通知父窗口重新加载当前 HTML 内容。
 */

import { BaseRuntimeBridgeApiPlugin } from "@dtyq/html-sandbox/runtime"
import { getParentOrigin } from "@dtyq/html-sandbox/utils/parentOrigin"

export class MagicReloadApi extends BaseRuntimeBridgeApiPlugin {
	constructor() {
		super("MagicReloadApi")
	}

	install(): void {
		if (!window.Magic) window.Magic = {}
		if (window.Magic.reload) return
		this.logger.info("install")

		window.Magic.reload = () => {
			this.logger.info("reload")
			window.parent.postMessage(
				{
					type: "MAGIC_RELOAD_REQUEST",
					timestamp: Date.now(),
				},
				getParentOrigin(),
			)
		}
	}
}
