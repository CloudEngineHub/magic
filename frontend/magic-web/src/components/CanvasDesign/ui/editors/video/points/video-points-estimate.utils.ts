import type { GenerateVideoRequest } from "../../../../public/magic-types"

type VideoPointsEstimateSignaturePayload = Pick<
	Partial<GenerateVideoRequest>,
	"model_id" | "input_mode" | "task" | "inputs" | "generation"
>

export function buildVideoPointsEstimateSignaturePayload(
	request: Partial<GenerateVideoRequest>,
): VideoPointsEstimateSignaturePayload {
	return {
		model_id: request.model_id,
		input_mode: request.input_mode,
		task: request.task,
		inputs: request.inputs,
		generation: request.generation,
	}
}

export function buildVideoPointsEstimateSignature(request: Partial<GenerateVideoRequest>): string {
	return JSON.stringify(buildVideoPointsEstimateSignaturePayload(request))
}
