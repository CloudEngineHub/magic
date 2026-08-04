import { GlobalBaseRepository } from "@/models/repository/GlobalBaseRepository"
import type { Common } from "@/types/common"
import { Storage } from "../../repository/Cache"
import { logger } from "../../repository/logger"

export class ClusterRepository extends GlobalBaseRepository<Common.PrivateConfig> {
	static readonly tableName = "cluster"

	static readonly version = 1

	constructor() {
		super(ClusterRepository.tableName)
	}

	public async setClustersConfig(clustersConfig: Array<Common.PrivateConfig>): Promise<void> {
		try {
			clustersConfig.map((config) =>
				this.put({ ...config, deployCode: config?.deployCode ?? "" }),
			)
		} catch (error) {
			logger.error({
				eventKey: "set_clusters_config_failed",
				errorKind: "unknown",
				error: error,
				message: "setClustersConfigError",
				context: { tableName: ClusterRepository.tableName },
			})
		} finally {
			clustersConfig.map((config) =>
				Storage.set(`${ClusterRepository.tableName}:${config?.deployCode ?? ""}`, {
					...config,
					deployCode: config?.deployCode ?? "",
				}),
			)
		}
	}

	public async setClusterConfig(clustersConfig: Common.PrivateConfig) {
		try {
			return await this.put(clustersConfig)
		} catch (error) {
			logger.error({
				eventKey: "set_cluster_config_failed",
				errorKind: "unknown",
				error: error,
				message: "setClusterConfigError",
				context: { tableName: ClusterRepository.tableName },
			})
			return Storage.set(
				`${ClusterRepository.tableName}:${clustersConfig?.deployCode ?? ""}`,
				clustersConfig,
			)
		}
	}

	public async getClustersConfig(): Promise<Array<Common.PrivateConfig>> {
		try {
			return await this.getAll()
		} catch (error) {
			logger.error({
				eventKey: "get_clusters_config_failed",
				errorKind: "unknown",
				error: error,
				message: "getClustersConfigError",
				context: { tableName: ClusterRepository.tableName },
			})
			return Storage.getAll<Common.PrivateConfig>(`${ClusterRepository.tableName}:`)
		}
	}
}
