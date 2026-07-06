import type { GenerateVideoRequest } from "../../../../public/magic-types"

export function buildVideoPointsEstimateSignature(request: Partial<GenerateVideoRequest>): string {
	return JSON.stringify({
		model_id: request.model_id,
		input_mode: request.input_mode,
		task: request.task,
		inputs: request.inputs,
		generation: request.generation,
	})
}
