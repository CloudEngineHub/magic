import { useEffect, useState } from "react"
import type { StepConfirmFooterAction } from "../steps/StepConfirm"
import { STEPS } from "../constants"

export function useConfirmFooterState(currentStep: number) {
	const [action, setAction] = useState<StepConfirmFooterAction | null>(null)
	const [isExecutionLocked, setIsExecutionLocked] = useState(false)

	useEffect(() => {
		if (currentStep !== STEPS.length - 1) {
			setAction(null)
			setIsExecutionLocked(false)
		}
	}, [currentStep])

	return {
		action,
		isExecutionLocked,
		setAction,
		setIsExecutionLocked,
	}
}
