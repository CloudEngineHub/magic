import type { ModelPriceSnapshot } from "../../../../model-billing-reference"
import type { PlatformInfo } from "@admin/types/platformInfo"
import { RequestUrl } from "../constant"
import type { HttpClient } from "../core/HttpClient"

export const generatePlatformInfoApi = (client: HttpClient) => {
	return {
		/** 获取默认文本模型售价快照，失败仅由价格区域展示。 */
		getModelBillingPreview(signal?: AbortSignal) {
			return client.get<ModelPriceSnapshot>(RequestUrl.modelBillingPreview, {
				signal,
				enableErrorMessagePrompt: false,
			})
		},
		/** 获取平台信息 */
		getPlatformInfo() {
			return client.get<PlatformInfo.Details>(RequestUrl.getPlatformInfo)
		},

		/** 修改平台信息 */
		updatePlatformInfo(data: Partial<PlatformInfo.UpdateParams>) {
			return client.put<PlatformInfo.Details>(RequestUrl.updatePlatformInfo, data)
		},
	}
}
