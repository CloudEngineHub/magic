import { prewarmImageResourceWorkerClient } from "./runtime/resources/image/ImageResourceWorkerClient"

export function prewarmCanvasDesignImageWorker(reason = "canvas-design"): void {
	void prewarmImageResourceWorkerClient(reason)
}
