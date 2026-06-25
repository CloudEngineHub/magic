import { prewarmImageResourceWorkerClient } from "./canvas/utils/ImageResourceWorkerClient"

export function prewarmCanvasDesignImageWorker(reason = "canvas-design"): void {
	void prewarmImageResourceWorkerClient(reason)
}
