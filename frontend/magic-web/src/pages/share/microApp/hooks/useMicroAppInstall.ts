import { useCallback, useEffect, useRef, useState } from "react"
import {
	createMicroAppInstallController,
	detectMicroAppInstallEnvironment,
	getInitialMicroAppInstallStatus,
	type MicroAppInstallStatus,
} from "./microAppInstall"

export default function useMicroAppInstall() {
	const environment = useRef(detectMicroAppInstallEnvironment()).current
	const [status, setStatus] = useState<MicroAppInstallStatus>(() =>
		getInitialMicroAppInstallStatus(environment),
	)
	const controllerRef = useRef<ReturnType<typeof createMicroAppInstallController> | null>(null)

	useEffect(() => {
		const controller = createMicroAppInstallController(setStatus)
		controllerRef.current = controller
		setStatus(controller.status)
		return () => {
			controller.destroy()
			controllerRef.current = null
		}
	}, [])

	const prompt = useCallback(
		() => controllerRef.current?.prompt() ?? Promise.resolve("unavailable" as const),
		[],
	)

	return {
		status,
		environment,
		prompt,
	}
}
