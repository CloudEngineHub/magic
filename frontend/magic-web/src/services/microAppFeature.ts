import { isPrivateDeployment } from "@/utils/env"

/** Whether micro-app product entries are available in this deployment. */
export const isMicroAppEnabled = (): boolean => !isPrivateDeployment()
