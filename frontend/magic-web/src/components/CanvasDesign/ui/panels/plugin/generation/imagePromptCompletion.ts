import type { Canvas } from "../../../../runtime/core/Canvas"
import type {
	CompleteImagePromptRequest,
	CompleteImagePromptResponse,
} from "../../../../public/magic-types"

export async function completePluginImagePrompt(
	canvas: Canvas,
	params: Omit<CompleteImagePromptRequest, "project_id">,
) {
	const completeImagePrompt = canvas.magicConfigManager.config?.methods?.completeImagePrompt
	if (!completeImagePrompt) {
		throw new Error("completeImagePrompt method not available.")
	}

	return completeImagePrompt(params) as Promise<CompleteImagePromptResponse>
}
