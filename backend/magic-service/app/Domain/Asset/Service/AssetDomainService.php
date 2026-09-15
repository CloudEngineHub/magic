<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\Asset\Service;

use App\Domain\Asset\Contract\AssetProviderInterface;
use App\Domain\Asset\Entity\AssetDataIsolation;
use App\Domain\Asset\Entity\AssetEntity;
use App\Domain\Asset\Entity\ProviderAssetEntity;
use App\Domain\Asset\Entity\ValueObject\AssetSyncStatus;
use App\Domain\Asset\Entity\ValueObject\ProviderAssetStatus;
use App\Domain\Asset\Entity\ValueObject\Query\AssetQuery;
use App\Domain\Asset\Repository\Facade\AssetAgreementRepositoryInterface;
use App\Domain\Asset\Repository\Facade\AssetProviderAssetRepositoryInterface;
use App\Domain\Asset\Repository\Facade\AssetRepositoryInterface;
use App\Domain\Provider\Entity\ValueObject\AiAbilityCode;
use App\Domain\Provider\Service\AiAbilityDomainService;
use App\ErrorCode\AssetErrorCode;
use App\Infrastructure\Core\Exception\ExceptionBuilder;
use App\Infrastructure\Core\ValueObject\Page;
use App\Infrastructure\ExternalAPI\VolcengineArk\Assets\VolcengineArkAssetProvider;
use Hyperf\Coroutine\Coroutine;
use Psr\Log\LoggerInterface;
use Throwable;

/**
 * 负责资产的本地生命周期管理，以及与第三方素材服务的同步。
 */
class AssetDomainService
{
    private const string UNNAMED_GROUP_NAME = '未命名素材组';

    private const string DEFAULT_PROJECT_NAME = 'default';

    /**
     * 第三方合规轮询的最长等待时间。
     */
    private const int COMPLIANCE_TIMEOUT_SECONDS = 120;

    /**
     * 第三方合规状态轮询间隔。
     */
    private const float COMPLIANCE_POLL_INTERVAL_SECONDS = 1.0;

    /**
     * 同步失败原因的最大存储长度。
     */
    private const int FAILED_REASON_MAX_LENGTH = 512;

    private readonly AssetProviderInterface $provider;

    /**
     * 初始化仓储、日志和第三方资产提供方。
     * 服务实例创建后即可处理本地资产和第三方素材之间的同步流程。
     */
    public function __construct(
        private readonly AssetRepositoryInterface $assets,
        private readonly AssetProviderAssetRepositoryInterface $providerAssets,
        private readonly AssetAgreementRepositoryInterface $agreements,
        private readonly LoggerInterface $logger,
        private readonly AiAbilityDomainService $abilityDomainService,
    ) {
        $this->provider = new VolcengineArkAssetProvider($this->logger, $this->abilityDomainService->getProviderConfig(AiAbilityCode::VolcengineArkAssets));
    }

    /**
     * 创建个人素材；同一用户已上传相同内容时复用原记录，并补做未完成的合规校验。
     * 未签署资产协议时直接抛出异常，未命中可复用记录时才创建新的本地和远程素材。
     */
    public function createPersonal(AssetDataIsolation $dataIsolation, AssetEntity $asset): AssetEntity
    {
        if (! $this->agreements->hasAccepted($dataIsolation)) {
            ExceptionBuilder::throw(AssetErrorCode::AGREEMENT_REQUIRED);
        }
        $asset->setUserId($dataIsolation->getCurrentUserId());

        // 复用相同内容的已有记录；未完成校验时继续执行校验。
        $existing = $this->reusePersonalByContentHash(
            $dataIsolation,
            $dataIsolation->getCurrentUserId(),
            $asset->getContentHash(),
            $asset->getFileUrl(),
        );

        if ($existing !== null) {
            $this->logger->info('命中本人已存在的同内容素材，跳过重复落库', [
                'asset_id' => $existing->getId(),
                'sync_status' => $existing->getSyncStatus()->value,
            ]);
            return $existing;
        }

        return $this->create($dataIsolation, $asset);
    }

    /**
     * 按用户和内容指纹查找个人素材；记录已同步时直接返回，否则继续执行第三方校验。
     * 内容指纹为空或用户标识为空时不查询数据库，找不到记录时返回 null，避免重复落库。
     */
    public function reusePersonalByContentHash(
        AssetDataIsolation $dataIsolation,
        string $userId,
        ?string $contentHash,
        ?string $fileUrl = null,
    ): ?AssetEntity {
        $contentHash = trim((string) $contentHash);
        if ($contentHash === '' || $userId === '') {
            return null;
        }
        // 使用最新记录，保证补校验作用于当前状态。
        $existing = $this->assets->findPersonalAssetByContentHash($userId, $contentHash, anySyncStatus: true);
        if ($existing === null) {
            return null;
        }
        // 数据库记录不含临时文件地址，补校验时使用本次请求的地址。
        if ($fileUrl !== null && $fileUrl !== '') {
            $existing->setFileUrl($fileUrl);
        }
        return $existing->getSyncStatus()->isSynced()
            ? $existing
            : $this->syncToProvider($dataIsolation, $existing);
    }

    /**
     * 仅保存素材到个人库，不创建第三方素材或触发合规校验。
     * 该方法用于用户收藏或暂存素材，记录会保留待同步状态供后续流程继续处理。
     */
    public function saveToLibrary(AssetDataIsolation $dataIsolation, AssetEntity $asset): AssetEntity
    {
        $asset->setUserId($dataIsolation->getCurrentUserId());
        return $this->saveLocal($dataIsolation, $asset, AssetSyncStatus::PENDING);
    }

    /**
     * 签署资产服务协议；已签署时不重复写入。
     * 协议状态按当前数据隔离范围保存，重复调用保持幂等，不会产生重复协议记录。
     */
    public function signAgreement(AssetDataIsolation $dataIsolation): void
    {
        if ($this->agreements->hasAccepted($dataIsolation)) {
            return;
        }
        $this->agreements->markAccepted($dataIsolation);
    }

    /**
     * 创建不归属于任何用户的公共素材，并同步到第三方。
     * 公共素材不设置用户标识，仍会先保存本地记录，再创建第三方凭证并执行合规校验。
     */
    public function createPublic(AssetDataIsolation $dataIsolation, AssetEntity $asset): AssetEntity
    {
        $asset->setUserId(null);
        return $this->create($dataIsolation, $asset);
    }

    /**
     * 删除当前用户创建的资产；目标不存在时返回错误，他人创建的资产禁止删除。
     * 删除动作会同步处理第三方映射，只有确认不存在其他引用时才回收远程素材资源。
     */
    public function deletePersonal(AssetDataIsolation $dataIsolation, int|string $assetId): bool
    {
        $existing = $this->assets->findById($dataIsolation, $assetId);
        if ($existing === null) {
            ExceptionBuilder::throw(AssetErrorCode::NOT_FOUND);
        }
        if ($existing->getUserId() !== $dataIsolation->getCurrentUserId()) {
            ExceptionBuilder::throw(AssetErrorCode::DELETE_DENIED);
        }
        return $this->deleteAssetWithProvider($dataIsolation, $existing);
    }

    /**
     * 删除公共素材；目标不存在或不是公共素材时返回 false。
     * 公共素材删除同样会检查第三方引用关系，避免误删仍被其他本地资产共享的远程资源。
     */
    public function deletePublic(AssetDataIsolation $dataIsolation, int|string $assetId): bool
    {
        $existing = $this->assets->findById($dataIsolation, $assetId);
        if ($existing === null || $existing->getUserId() !== null) {
            return false;
        }
        return $this->deleteAssetWithProvider($dataIsolation, $existing);
    }

    /**
     * 更新素材属性。
     * 方法只更新本地资产的可变字段，不负责重新上传文件或改变第三方素材的合规状态。
     */
    public function update(AssetDataIsolation $dataIsolation, AssetEntity $asset): ?AssetEntity
    {
        return $this->updateAttributes($dataIsolation, $asset);
    }

    /**
     * 更新公共素材属性；目标不存在或不是公共素材时返回 null。
     * 通过重新查询确认目标类型后才执行更新，避免调用方越权修改个人素材记录。
     */
    public function updatePublic(AssetDataIsolation $dataIsolation, AssetEntity $asset): ?AssetEntity
    {
        if ($asset->getId() === null) {
            return null;
        }
        $existing = $this->assets->findById($dataIsolation, $asset->getId());
        if ($existing === null || $existing->getUserId() !== null) {
            return null;
        }
        return $this->updateAttributes($dataIsolation, $asset);
    }

    /**
     * 查询资产；未授权时仅返回当前用户可见的个人或公共资产。
     * granted 为 true 表示上层已完成权限判断，此时跳过重复的可见性计算并直接返回记录。
     */
    public function find(AssetDataIsolation $dataIsolation, int|string $assetId, bool $granted = false): ?AssetEntity
    {
        $existing = $this->assets->findById($dataIsolation, $assetId);
        if ($existing === null) {
            return null;
        }
        if ($granted) {
            return $existing;
        }
        $isPersonal = $existing->getOrganizationCode() === $dataIsolation->getCurrentOrganizationCode()
            && $existing->getUserId() === $dataIsolation->getCurrentUserId();
        $isOfficial = in_array($existing->getOrganizationCode(), $dataIsolation->getOfficialOrganizationCodes(), true)
            && $existing->getUserId() === null
            && $existing->getStatus()->isEnabled();
        return $isPersonal || $isOfficial ? $existing : null;
    }

    /**
     * 查询公共素材；目标不存在或属于个人时返回 null。
     * 该方法只按公共素材条件筛选，不负责判断素材是否已完成第三方同步或合规审核。
     */
    public function findPublic(AssetDataIsolation $dataIsolation, int|string $assetId): ?AssetEntity
    {
        $existing = $this->assets->findById($dataIsolation, $assetId);
        return $existing !== null && $existing->getUserId() === null ? $existing : null;
    }

    /**
     * 按用户和内容指纹查询个人素材；未找到时返回 null。
     * 查询结果用于读取已有本地记录，不会触发补校验、远程同步或其他写入操作。
     */
    public function findPersonalAssetByContentHash(string $userId, string $contentHash): ?AssetEntity
    {
        return $this->assets->findPersonalAssetByContentHash($userId, $contentHash);
    }

    /**
     * 查询本地素材对应的第三方素材 ID；没有映射或 ID 为空时返回 null。
     * 返回值是第三方服务签发的标识，不是本地资产主键，调用方可据此生成远程素材引用。
     */
    public function findProviderAssetId(AssetDataIsolation $dataIsolation, int|string $assetId): ?string
    {
        $mapping = $this->providerAssets->findMapping(
            $dataIsolation,
            $assetId,
            $this->provider->getProviderCode(),
            self::DEFAULT_PROJECT_NAME,
        );
        if ($mapping === null) {
            return null;
        }
        // 先转换为实体，再读取第三方素材 ID。
        $providerAssetId = (new ProviderAssetEntity($mapping->toArray()))->getProviderAssetId();
        return $providerAssetId === '' ? null : $providerAssetId;
    }

    /**
     * 复用个人素材后返回第三方素材 ID；素材不存在或同步失败时返回 null。
     * 当已有记录尚未完成合规校验时会先尝试补做校验，确保返回的凭证能够直接使用。
     */
    public function findPersonalProviderAssetId(AssetDataIsolation $dataIsolation, string $userId, string $contentHash): ?string
    {
        $asset = $this->reusePersonalByContentHash($dataIsolation, $userId, $contentHash);
        if ($asset === null) {
            return null;
        }
        return $this->findProviderAssetId($dataIsolation, $asset->getId());
    }

    /**
     * 按查询条件分页返回当前数据隔离范围内的资产列表和总数。
     * 仓储负责处理筛选、排序及分页细节，返回结构保持统一以便接口层直接使用。
     *
     * @return array{total: int, list: AssetEntity[]}
     */
    public function queries(AssetDataIsolation $dataIsolation, AssetQuery $query, Page $page): array
    {
        return $this->assets->queries($dataIsolation, $query, $page);
    }

    /**
     * 返回合规轮询超时时间。
     * 单独封装该配置便于测试环境缩短等待时间，同时保证生产流程使用统一的超时上限。
     */
    protected function complianceTimeoutSeconds(): int
    {
        return self::COMPLIANCE_TIMEOUT_SECONDS;
    }

    /**
     * 判断合规轮询是否超时。
     * 当前时间达到截止时间即返回 true，调用方据此终止轮询并记录合规超时状态。
     */
    protected function isComplianceWaitExpired(float $deadline): bool
    {
        return microtime(true) >= $deadline;
    }

    /**
     * 等待下一次合规状态查询。
     * 使用固定轮询间隔降低第三方接口调用频率，避免在审核尚未完成时持续发送请求。
     */
    protected function waitBeforeNextCompliancePoll(): void
    {
        Coroutine::sleep(self::COMPLIANCE_POLL_INTERVAL_SECONDS);
    }

    /**
     * 删除本地资产；第三方资源仍有引用时保留资源，否则回收资源并删除映射。
     * 素材组必须先确认没有子素材，普通素材则在本地删除后根据引用数量决定是否远程回收。
     */
    private function deleteAssetWithProvider(AssetDataIsolation $dataIsolation, AssetEntity $asset): bool
    {
        if ($asset->getAssetKind()->isGroup()) {
            if ($this->assets->hasChildren($dataIsolation, $asset->getId())) {
                ExceptionBuilder::throw(AssetErrorCode::GROUP_NOT_EMPTY);
            }
            // 素材组只存在于本地。
            return $this->assets->delete($dataIsolation, $asset);
        }

        $mappingModel = $this->providerAssets->findMapping(
            $dataIsolation,
            $asset->getId(),
            $this->provider->getProviderCode(),
            self::DEFAULT_PROJECT_NAME,
        );
        // 没有第三方映射时只删除本地记录。
        if ($mappingModel === null) {
            return $this->assets->delete($dataIsolation, $asset);
        }

        $mapping = new ProviderAssetEntity($mappingModel->toArray());

        // 先删除本地记录，再判断远程资源是否仍被引用。
        $deletedLocally = $this->assets->delete($dataIsolation, $asset);

        // 仍有其他引用时保留远程资源。
        if ($this->providerAssets->countOtherReferences($mapping) > 0) {
            $this->logger->info('素材仍有其它引用，仅删除本地记录，保留第三方资源', [
                'asset_id' => $asset->getId(),
                'provider_asset_id' => $mapping->getProviderAssetId(),
            ]);
            return $deletedLocally;
        }

        // 无其他引用时回收远程资源，并删除映射记录。
        if ($this->reclaimProviderAsset($mapping)) {
            $this->providerAssets->deleteMapping(
                $dataIsolation,
                $asset->getId(),
                $this->provider->getProviderCode(),
                self::DEFAULT_PROJECT_NAME,
            );
        }
        return $deletedLocally;
    }

    /**
     * 幂等回收第三方素材及素材组；任一资源回收失败时保留映射供后续重试。
     * 空凭证视为已完成回收，只有素材或素材组删除均成功时才允许调用方清理本地映射记录。
     */
    private function reclaimProviderAsset(ProviderAssetEntity $mapping): bool
    {
        $providerAssetId = trim($mapping->getProviderAssetId());
        $providerGroupId = trim((string) $mapping->getProviderGroupId());
        if ($providerAssetId === '' && $providerGroupId === '') {
            return true;
        }
        $reclaimedAsset = $providerAssetId === '' || $this->provider->deleteAsset($providerAssetId, self::DEFAULT_PROJECT_NAME);
        $reclaimedGroup = $providerGroupId === '' || $this->provider->deleteAssetGroup($providerGroupId, self::DEFAULT_PROJECT_NAME);
        if (! $reclaimedAsset || ! $reclaimedGroup) {
            $this->logger->warning('第三方资源回收未全部成功，映射行保留待补偿', [
                'asset_id' => $mapping->getAssetId(),
                'provider_asset_id' => $providerAssetId,
                'provider_group_id' => $providerGroupId,
            ]);
            return false;
        }
        return true;
    }

    /**
     * 先保存本地记录，再同步非素材组资产；素材组仅用于本地层级管理。
     * 本地保存失败不会触发第三方调用，远程同步失败则保留本地记录和状态供后续补偿处理。
     */
    private function create(AssetDataIsolation $dataIsolation, AssetEntity $asset): AssetEntity
    {
        $this->assertParentGroupExists($dataIsolation, $asset);
        $assetEntity = $this->saveLocal($dataIsolation, $asset);
        if ($assetEntity->getAssetKind()->isGroup()) {
            // 素材组只用于本地层级管理。
            return $assetEntity;
        }
        $assetEntity->setFileUrl($asset->getFileUrl());
        return $this->syncToProvider($dataIsolation, $assetEntity);
    }

    /**
     * 保存本地资产记录；未指定状态时，素材组标记为已同步，其余资产标记为待同步。
     * 保存时补充当前组织编码，并记录日志，确保后续同步能够通过本地主键追踪资产归属。
     */
    private function saveLocal(AssetDataIsolation $dataIsolation, AssetEntity $asset, ?AssetSyncStatus $syncStatus = null): AssetEntity
    {
        $asset->setOrganizationCode($dataIsolation->getCurrentOrganizationCode());
        $asset->setSyncStatus($syncStatus ?? ($asset->getAssetKind()->isGroup() ? AssetSyncStatus::SYNCED : AssetSyncStatus::PENDING));
        $saved = $this->assets->save($dataIsolation, $asset);
        $this->logger->info(
            $saved->getSyncStatus()->isSynced() ? '资产已落库，无需同步第三方' : '资产已落库，等待同步第三方',
            ['asset_id' => $saved->getId()],
        );
        return $saved;
    }

    /**
     * 同步素材到第三方；优先续用处理中或已通过审核的凭证，否则创建新素材并轮询合规状态。
     * 任意远程操作抛出异常都会回写失败状态，但不会删除映射，便于重试、审计和人工处置。
     */
    private function syncToProvider(AssetDataIsolation $dataIsolation, AssetEntity $asset): AssetEntity
    {
        $this->markSyncStatus($dataIsolation, $asset, AssetSyncStatus::SYNCING);
        try {
            // 优先续用已提交但尚无结论的凭证。
            $resumable = $this->findResumableProviderAsset($dataIsolation, $asset);
            if ($resumable !== null) {
                $this->logger->info('续用已提交的第三方素材凭证，继续等待合规结论', [
                    'asset_id' => $asset->getId(),
                    'provider_asset_id' => $resumable->getProviderAssetId(),
                ]);
                $this->awaitProviderAssetActive($dataIsolation, $resumable);
                return $this->markSyncStatus($dataIsolation, $asset, AssetSyncStatus::SYNCED);
            }

            // 命中已审核通过的相同内容时复用第三方凭证。
            $reusable = $this->findReusableProviderAsset($asset);
            if ($reusable !== null) {
                $this->persistReusedMapping($dataIsolation, $asset, $reusable);
                $this->logger->info('复用已存在的第三方素材，跳过上传', [
                    'asset_id' => $asset->getId(),
                    'provider_asset_id' => $reusable->getProviderAssetId(),
                ]);
                return $this->markSyncStatus($dataIsolation, $asset, AssetSyncStatus::SYNCED);
            }

            // 创建专属素材组后提交素材。
            $providerGroupId = $this->createProviderAssetGroup($this->resolveProviderGroupName($asset));
            $this->persistGroupMapping($dataIsolation, $asset, $providerGroupId);
            $providerAssetEntity = $this->createProviderAsset($dataIsolation, $asset, $providerGroupId);
            $this->awaitProviderAssetActive($dataIsolation, $providerAssetEntity);
        } catch (Throwable $throwable) {
            $this->markSyncStatus($dataIsolation, $asset, AssetSyncStatus::FAILED, $throwable->getMessage());
            throw $throwable;
        }
        return $this->markSyncStatus($dataIsolation, $asset, AssetSyncStatus::SYNCED);
    }

    /**
     * 查询当前素材的处理中映射，用于恢复中断的合规轮询。
     * 仅返回具有第三方素材 ID 且状态仍为处理中的映射，已完成或无凭证的记录不会被续用。
     */
    private function findResumableProviderAsset(AssetDataIsolation $dataIsolation, AssetEntity $asset): ?ProviderAssetEntity
    {
        $assetId = $asset->getId();
        if ($assetId === null) {
            return null;
        }
        $mappingModel = $this->providerAssets->findMapping(
            $dataIsolation,
            $assetId,
            $this->provider->getProviderCode(),
            self::DEFAULT_PROJECT_NAME,
        );
        if ($mappingModel === null) {
            return null;
        }
        // 映射模型需转换为实体后读取状态。
        $mapping = new ProviderAssetEntity($mappingModel->toArray());
        if (trim($mapping->getProviderAssetId()) === '') {
            return null;
        }
        return $mapping->getProviderStatus()->isProcessing() ? $mapping : null;
    }

    /**
     * 按内容指纹查找其他本地素材中已通过审核、可跨组织复用的第三方凭证。
     * 当前素材自身会从候选 ID 中排除，内容指纹为空或没有其他候选记录时直接返回 null。
     */
    private function findReusableProviderAsset(AssetEntity $asset): ?ProviderAssetEntity
    {
        $contentHash = $asset->getContentHash();
        if ($contentHash === null || $contentHash === '') {
            return null;
        }
        $candidateIds = $this->assets->findIdsByContentHash($contentHash);
        $candidateIds = array_values(array_filter(
            $candidateIds,
            static fn ($id): bool => (string) $id !== (string) $asset->getId(),
        ));
        if ($candidateIds === []) {
            return null;
        }
        return $this->providerAssets->findReusableMappingByAssetIds(
            $candidateIds,
            $this->provider->getProviderCode(),
            self::DEFAULT_PROJECT_NAME,
        );
    }

    /**
     * 将已复用的第三方素材凭证写入当前素材的映射记录。
     * 新映射继承第三方素材组、状态和元数据，保证当前本地资产可以继续使用同一远程凭证。
     */
    private function persistReusedMapping(
        AssetDataIsolation $dataIsolation,
        AssetEntity $asset,
        ProviderAssetEntity $reusable,
    ): void {
        $providerAssetEntity = new ProviderAssetEntity([
            'asset_id' => $asset->getId(),
            'organization_code' => $dataIsolation->getCurrentOrganizationCode(),
            'provider_code' => $this->provider->getProviderCode(),
            'project_name' => self::DEFAULT_PROJECT_NAME,
            'provider_group_id' => $reusable->getProviderGroupId(),
            'provider_asset_id' => $reusable->getProviderAssetId(),
            'provider_status' => $reusable->getProviderStatus()->value,
            'metadata' => $reusable->getMetadata(),
        ]);
        $this->providerAssets->saveMapping($dataIsolation, $providerAssetEntity);
    }

    /**
     * 更新本地同步状态；失败时同时保存规范化后的失败原因。
     * 状态写回失败只记录错误并返回传入实体，避免数据库异常覆盖原始同步异常信息。
     */
    private function markSyncStatus(
        AssetDataIsolation $dataIsolation,
        AssetEntity $asset,
        AssetSyncStatus $status,
        ?string $failedReason = null,
    ): AssetEntity {
        $asset->setSyncStatus($status);
        $asset->setSyncFailedReason($status->isFailed() ? $this->normalizeFailedReason($failedReason) : null);
        $updated = $this->assets->update($dataIsolation, $asset);
        if ($updated === null) {
            $this->logger->error('资产同步状态回写失败', [
                'asset_id' => $asset->getId(),
                'sync_status' => $status->value,
            ]);
            return $asset;
        }
        return $updated;
    }

    /**
     * 清理并截断同步失败原因。
     * 空白原因统一转换为 null，非空原因限制在数据库允许的长度内，避免写入超长文本。
     */
    private function normalizeFailedReason(?string $reason): ?string
    {
        $reason = trim((string) $reason);
        return $reason === '' ? null : mb_substr($reason, 0, self::FAILED_REASON_MAX_LENGTH);
    }

    /**
     * 校验父级存在且为素材组，避免创建无效的层级关系。
     * 父级为空表示资产位于根层级；指定父级但查不到或类型错误时抛出资源不存在异常。
     */
    private function assertParentGroupExists(AssetDataIsolation $dataIsolation, AssetEntity $asset): void
    {
        $parentId = $asset->getParentId();
        if ($parentId === null) {
            return;
        }
        $parent = $this->assets->findById($dataIsolation, $parentId);
        if ($parent === null || ! $parent->getAssetKind()->isGroup()) {
            ExceptionBuilder::throw(AssetErrorCode::NOT_FOUND);
        }
    }

    /**
     * 保存第三方素材组凭证，待素材创建后在同一映射中补充素材凭证。
     * 远程素材组创建成功后立即落本地映射，即使后续素材创建失败也能追踪和补偿回收资源。
     */
    private function persistGroupMapping(
        AssetDataIsolation $dataIsolation,
        AssetEntity $asset,
        string $providerGroupId,
    ): void {
        // 素材尚未创建，此处只记录素材组凭证。
        $providerAssetGroupEntity = new ProviderAssetEntity([
            'asset_id' => (int) $asset->getId(),
            'provider_code' => $this->provider->getProviderCode(),
            'project_name' => self::DEFAULT_PROJECT_NAME,
            'provider_group_id' => $providerGroupId,
        ]);
        $this->providerAssets->saveMapping($dataIsolation, $providerAssetGroupEntity);
        $this->logger->info('第三方素材组凭证已落库', [
            'asset_id' => $providerAssetGroupEntity->getAssetId(),
            'provider_group_id' => $providerGroupId,
        ]);
    }

    /**
     * 调用第三方创建素材组并返回素材组 ID。
     * 第三方响应缺少有效组 ID 时视为无效响应并抛出异常，禁止继续创建无法关联的素材。
     */
    private function createProviderAssetGroup(string $groupName): string
    {
        $response = $this->provider->createAssetGroup([
            'name' => $groupName,
            'project_name' => self::DEFAULT_PROJECT_NAME,
        ]);
        $providerGroupId = trim((string) ($response['provider_group_id'] ?? ''));
        if ($providerGroupId === '') {
            ExceptionBuilder::throw(AssetErrorCode::PROVIDER_RESPONSE_INVALID);
        }
        $this->logger->info('第三方素材组创建完成', [
            'provider_group_id' => $providerGroupId,
            'name' => $groupName,
        ]);
        return $providerGroupId;
    }

    /**
     * 创建第三方素材，并将第三方返回的素材和组凭证保存到本地映射。
     * 同时保存第三方状态和原始元数据，用于后续合规轮询、失败原因提取及问题审计。
     */
    private function createProviderAsset(
        AssetDataIsolation $dataIsolation,
        AssetEntity $asset,
        string $providerGroupId,
    ): ProviderAssetEntity {
        $this->logger->info('第三方素材创建开始', [
            'asset_id' => $asset->getId(),
            'provider_group_id' => $providerGroupId,
        ]);

        $response = $this->provider->createAsset([
            ...$asset->toArray(),
            'organization_code' => $dataIsolation->getCurrentOrganizationCode(),
            'group_id' => $providerGroupId,
            'project_name' => self::DEFAULT_PROJECT_NAME,
        ]);
        $providerAssetId = (string) ($response['provider_asset_id'] ?? $response['asset_id'] ?? $response['id'] ?? '');
        if ($providerAssetId === '') {
            // 缺少第三方素材 ID，无法建立映射。
            ExceptionBuilder::throw(AssetErrorCode::PROVIDER_RESPONSE_INVALID);
        }
        $providerAssetEntity = new ProviderAssetEntity([
            'asset_id' => $asset->getId(),
            'provider_code' => $this->provider->getProviderCode(),
            'project_name' => self::DEFAULT_PROJECT_NAME,
            'provider_group_id' => $providerGroupId,
            'provider_asset_id' => $providerAssetId,
            'provider_status' => ProviderAssetStatus::fromValue(
                $response['provider_status'] ?? $response['status'] ?? ProviderAssetStatus::PROCESSING->value,
            )->value,
            // 保存第三方原始响应，用于审计和提取失败原因。
            'metadata' => is_array($response['metadata'] ?? null) ? $response['metadata'] : null,
        ]);
        $this->providerAssets->saveMapping($dataIsolation, $providerAssetEntity);
        return $providerAssetEntity;
    }

    /**
     * 轮询第三方合规状态，直到通过、失败或达到超时时间。
     * 审核失败会保存失败状态和原因，审核超时则保留远程凭证，不主动中断第三方审核流程。
     */
    private function awaitProviderAssetActive(
        AssetDataIsolation $dataIsolation,
        ProviderAssetEntity $providerAssetEntity,
    ): void {
        $deadline = microtime(true) + $this->complianceTimeoutSeconds();
        $status = $providerAssetEntity->getProviderStatus();
        // 保存最近一次响应，用于提取合规失败原因。
        $metadata = $providerAssetEntity->getMetadata() ?? [];

        while (! $status->isActive()) {
            if (! $status->isProcessing()) {
                $reason = $this->provider->extractComplianceFailedReason($metadata, $status->value);
                $this->logger->error('第三方素材合规未通过', [
                    'provider_asset_id' => $providerAssetEntity->getProviderAssetId(),
                    'provider_status' => $status->value,
                    'reason' => $reason,
                ]);
                $this->persistProviderStatus($dataIsolation, $providerAssetEntity, $status);
                ExceptionBuilder::throw(AssetErrorCode::COMPLIANCE_FAILED, $reason);
            }
            if ($this->isComplianceWaitExpired($deadline)) {
                $this->logger->error('第三方素材合规回查超时', [
                    'provider_asset_id' => $providerAssetEntity->getProviderAssetId(),
                    'timeout_seconds' => self::COMPLIANCE_TIMEOUT_SECONDS,
                ]);
                ExceptionBuilder::throw(
                    AssetErrorCode::COMPLIANCE_TIMEOUT,
                    sprintf('第三方素材合规回查超时（%d 秒内未返回结论）', self::COMPLIANCE_TIMEOUT_SECONDS),
                );
            }
            $this->waitBeforeNextCompliancePoll();
            [$status, $metadata] = $this->fetchProviderStatus($providerAssetEntity);
        }

        // 轮询后再写入最终状态，避免重复更新。
        if (! $providerAssetEntity->getProviderStatus()->isActive()) {
            $this->persistProviderStatus($dataIsolation, $providerAssetEntity, $status);
        }
    }

    /**
     * 查询一次第三方状态；请求异常时保留处理中状态，交由下一轮继续查询。
     * 正常响应同时提取状态和元数据，调用方可使用最新元数据分析审核失败的具体原因。
     */
    private function fetchProviderStatus(ProviderAssetEntity $providerAssetEntity): array
    {
        try {
            $state = $this->provider->getAssetStatus($providerAssetEntity->getProviderAssetId());
        } catch (Throwable $throwable) {
            $this->logger->warning('第三方素材状态回查失败，继续等待', [
                'provider_asset_id' => $providerAssetEntity->getProviderAssetId(),
                'exception' => $throwable::class,
                'message' => $throwable->getMessage(),
            ]);
            return [ProviderAssetStatus::PROCESSING, []];
        }
        return [
            ProviderAssetStatus::fromValue(
                $state['provider_status'] ?? $state['status'] ?? ProviderAssetStatus::PROCESSING->value,
            ),
            is_array($state['metadata'] ?? null) ? $state['metadata'] : [],
        ];
    }

    /**
     * 将第三方状态写回映射表；写回失败时仅记录日志。
     * 状态持久化异常不再阻断主流程，保留当前内存状态并通过日志交给后续补偿任务处理。
     */
    private function persistProviderStatus(
        AssetDataIsolation $dataIsolation,
        ProviderAssetEntity $providerAssetEntity,
        ProviderAssetStatus $status,
    ): void {
        try {
            $providerAssetEntity->setProviderStatus($status);
            $this->providerAssets->saveMapping($dataIsolation, $providerAssetEntity);
        } catch (Throwable $throwable) {
            $this->logger->error('第三方素材状态回写失败', [
                'provider_asset_id' => $providerAssetEntity->getProviderAssetId(),
                'exception' => $throwable::class,
                'message' => $throwable->getMessage(),
            ]);
        }
    }

    /**
     * 更新素材的可变属性。
     * 没有本地资产 ID 时无法执行更新并返回 null，否则将更新请求交给资产仓储处理。
     */
    private function updateAttributes(AssetDataIsolation $dataIsolation, AssetEntity $asset): ?AssetEntity
    {
        if ($asset->getId() === null) {
            return null;
        }
        return $this->assets->update($dataIsolation, $asset);
    }

    /**
     * 根据素材名称生成第三方素材组名称。
     * 优先使用默认语言名称，名称为空或仅包含空白字符时使用统一的未命名素材组名称。
     */
    private function resolveProviderGroupName(AssetEntity $asset): string
    {
        $name = trim($asset->getI18nName('default'));
        return $name === '' ? self::UNNAMED_GROUP_NAME : $name;
    }
}
