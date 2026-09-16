<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\Asset\Service;

use App\Application\Asset\Support\ProjectFileMaterializer;
use App\Domain\Asset\Entity\AssetDataIsolation;
use App\Domain\Asset\Entity\AssetEntity;
use App\Domain\Asset\Entity\AssetTagEntity;
use App\Domain\Asset\Entity\ValueObject\AssetScope;
use App\Domain\Asset\Entity\ValueObject\AssetTagNodeType;
use App\Domain\Asset\Entity\ValueObject\AssetVisibility;
use App\Domain\Asset\Entity\ValueObject\Query\AssetQuery;
use App\Domain\Asset\Repository\Facade\AssetRepositoryInterface;
use App\Domain\Asset\Service\AssetDomainService;
use App\Domain\Asset\Service\AssetTagDomainService;
use App\Domain\Contact\Repository\Facade\MagicUserRepositoryInterface;
use App\Domain\Permission\Entity\ValueObject\ResourceVisibility\PrincipalType;
use App\Domain\Permission\Entity\ValueObject\ResourceVisibility\ResourceType;
use App\Domain\Permission\Service\ResourceVisibilityDomainService;
use App\ErrorCode\AssetErrorCode;
use App\Infrastructure\Core\DataIsolation\BaseDataIsolation;
use App\Infrastructure\Core\Exception\ExceptionBuilder;
use App\Infrastructure\Core\ValueObject\Page;
use App\Interfaces\Asset\DTO\Request\CreateAssetRequestDTO;
use App\Interfaces\Asset\DTO\Request\QueryAssetRequestDTO;
use App\Interfaces\Asset\DTO\Request\SaveAssetToLibraryRequestDTO;
use Hyperf\DbConnection\Db;
use Qbhy\HyperfAuth\Authenticatable;

class AssetAppService extends AbstractAssetAppService
{
    public function __construct(
        private readonly AssetDomainService $assetDomainService,
        ResourceVisibilityDomainService $resourceVisibilityDomainService,
        private readonly ProjectFileMaterializer $projectFileMaterializer,
        private readonly AssetTagDomainService $assetTagDomainService,
        private readonly AssetRepositoryInterface $assetRepository,
        private readonly MagicUserRepositoryInterface $userRepository,
    ) {
        parent::__construct($resourceVisibilityDomainService);
    }

    public function createPersonalAsset(
        Authenticatable|BaseDataIsolation $authorization,
        CreateAssetRequestDTO $requestDTO,
    ): AssetEntity {
        $dataIsolation = $this->createAssetDataIsolation($authorization);
        $contentHash = null;
        // 未传私有桶文件键时，从有权限的项目文件生成并补齐 file_key。
        if ($requestDTO->getAssetKind() === 'ASSET') {
            $contentHash = $this->materializeProjectFileIfNeeded($dataIsolation, $requestDTO);
        }
        $asset = $this->createAssetEntity($requestDTO, false, $dataIsolation->getCurrentOrganizationCode());
        // 素材只落在私有桶：创建前解析出 file_url 供第三方拉取；落库后的实体不含该字段，回填给响应。
        $this->resolveAssetFileUrls([$asset]);
        // 记录内容指纹：既用于复用已同步的第三方素材，也用于「同一份内容不重复落库」的判重。
        $asset->setContentHash($contentHash ?? $this->resolveContentHash($asset));

        $asset = $this->assetDomainService->createPersonal($dataIsolation, $asset);
        $this->grantAssetVisibility($dataIsolation, $asset, AssetVisibility::personal());
        $this->assetTagDomainService->syncAssetTags($dataIsolation, $asset, $requestDTO->getTagIds());
        $this->resolveAssetFileUrls([$asset]);
        return $asset;
    }

    /**
     * 保存到「我的素材库」：只落本地库、不做第三方合规同步，并按可见范围补授权记录。
     */
    public function saveToLibrary(
        Authenticatable|BaseDataIsolation $authorization,
        SaveAssetToLibraryRequestDTO $requestDTO,
    ): AssetEntity {
        $dataIsolation = $this->createAssetDataIsolation($authorization);
        $contentHash = $this->materializeProjectFileIfNeeded($dataIsolation, $requestDTO);
        $asset = $this->createAssetEntity($requestDTO, false, $dataIsolation->getCurrentOrganizationCode());
        if ($contentHash !== null) {
            $asset->setContentHash($contentHash);
        }
        // 保存前必须确认文件存在且当前组织可以访问。
        $this->resolveAssetFileUrls([$asset]);
        if ($asset->getFileUrl() === null || $asset->getFileUrl() === '') {
            ExceptionBuilder::throw(AssetErrorCode::FILE_REQUIRED);
        }
        $asset = $this->assetDomainService->saveToLibrary(
            $dataIsolation,
            $asset,
        );
        $this->grantAssetVisibility($dataIsolation, $asset, $requestDTO->getVisibility());
        $this->assetTagDomainService->syncAssetTags($dataIsolation, $asset, $requestDTO->getTagIds());
        // 落库实体不带 file_url，列表与详情都会回填，保存响应保持一致，前端拿到即可直接展示。
        $this->resolveAssetFileUrls([$asset]);

        return $asset;
    }

    /** 未提供 file_key 时，从项目文件生成私有桶文件并返回已计算的内容哈希。 */
    private function materializeProjectFileIfNeeded(AssetDataIsolation $dataIsolation, CreateAssetRequestDTO $requestDTO): ?string
    {
        if (trim((string) $requestDTO->getFileKey()) !== '') {
            return null;
        }
        $projectId = $requestDTO->getProjectId();
        $projectFilePath = $requestDTO->getProjectFilePath();
        if ($projectId === null || $projectFilePath === null) {
            ExceptionBuilder::throw(AssetErrorCode::FILE_REQUIRED);
        }
        $materialized = $this->projectFileMaterializer->materialize($dataIsolation, $projectId, $projectFilePath);
        if ($materialized === null || ($materialized['file_key'] ?? '') === '') {
            ExceptionBuilder::throw(AssetErrorCode::FILE_REQUIRED);
        }
        $requestDTO->setFileKey($materialized['file_key']);
        return $materialized['content_hash'] ?? null;
    }

    public function signAgreement(Authenticatable|BaseDataIsolation $authorization): void
    {
        $this->assetDomainService->signAgreement(
            $this->createAssetDataIsolation($authorization),
        );
    }

    /** 返回当前用户在当前组织的素材协议签署状态。 */
    public function hasSignedAgreement(Authenticatable|BaseDataIsolation $authorization): bool
    {
        return $this->assetDomainService->hasSignedAgreement(
            $this->createAssetDataIsolation($authorization),
        );
    }

    public function findPersonalAssetByContentHash(string $userId, string $contentHash): ?AssetEntity
    {
        return $this->assetDomainService->findPersonalAssetByContentHash($userId, $contentHash);
    }

    public function findProviderAssetId(Authenticatable|BaseDataIsolation $authorization, int|string $assetId): ?string
    {
        return $this->assetDomainService->findProviderAssetId(
            $this->createAssetDataIsolation($authorization),
            $assetId,
        );
    }

    public function findPersonalProviderAssetId(Authenticatable|BaseDataIsolation $authorization, string $userId, string $contentHash): ?string
    {
        return $this->assetDomainService->findPersonalProviderAssetId(
            $this->createAssetDataIsolation($authorization),
            $userId,
            $contentHash,
        );
    }

    /**
     * @return array{total: int, list: AssetEntity[]}
     */
    public function list(
        Authenticatable|BaseDataIsolation $authorization,
        QueryAssetRequestDTO $requestDTO,
    ): array {
        $dataIsolation = $this->createAssetDataIsolation($authorization);
        if ($requestDTO->getScope() === AssetScope::PUBLIC) {
            $dataIsolation->setOnlyOfficialOrganization(true);
        }
        $page = new Page(
            $requestDTO->getPage(),
            $requestDTO->getPageSize(),
        );
        $result = $this->assetDomainService->queries(
            $dataIsolation,
            $this->createQuery($requestDTO, $dataIsolation),
            $page,
        );
        $this->enrichAssets($dataIsolation, $result['list'], $requestDTO->getScope()->value);
        $this->resolveAssetFileUrls($result['list']);
        return $result;
    }

    public function detail(
        Authenticatable|BaseDataIsolation $authorization,
        int|string $assetId,
    ): ?AssetEntity {
        $dataIsolation = $this->createAssetDataIsolation($authorization);
        $dataIsolation->setContainOfficialOrganization(true);
        // 团队分享的素材也要能打开详情，否则列表里点进去会拿不到数据。
        $granted = $this->sharedAssetIds($dataIsolation, [(string) $assetId]) !== [];
        $asset = $this->assetDomainService->find($dataIsolation, $assetId, $granted);
        if ($asset !== null) {
            $this->enrichAssets($dataIsolation, [$asset], $granted ? 'TEAM' : 'PERSONAL');
            $this->resolveAssetFileUrls([$asset]);
        }
        return $asset;
    }

    public function deletePersonalAsset(
        Authenticatable|BaseDataIsolation $authorization,
        int|string $assetId,
    ): bool {
        $dataIsolation = $this->createAssetDataIsolation($authorization);
        $deleted = $this->assetDomainService->deletePersonal($dataIsolation, $assetId);
        if ($deleted) {
            // 资产行已删除，授权记录不能悬空，否则权限台会显示一条指向不存在资产的授权。
            $this->revokeAssetVisibility($dataIsolation, $assetId, AssetVisibility::personal());
        }
        return $deleted;
    }

    /**
     * 组装列表查询条件；团队分享与全部范围需要先解析出已授权给当前用户的资产主键。
     */
    private function createQuery(QueryAssetRequestDTO $requestDTO, AssetDataIsolation $dataIsolation): AssetQuery
    {
        $query = new AssetQuery();
        $scope = $requestDTO->getScope();
        $query->setScope($scope);
        $sharedAssetIds = $scope->includesSharedAssets() ? $this->sharedAssetIds($dataIsolation) : [];
        $query->setSharedAssetIds($sharedAssetIds);
        if ($scope === AssetScope::ALL) {
            $query->setAccessibleAssetIds(array_merge(
                $sharedAssetIds,
                $this->assetRepository->findIdsByOwnerUid($dataIsolation, $dataIsolation->getCurrentUserId()),
            ));
        }
        $query->setAssetKind($requestDTO->getAssetKind());
        $query->setParentId($requestDTO->getParentId());
        $query->setAssetBusinessType($requestDTO->getAssetBusinessType());
        $query->setAssetMediaType($requestDTO->getAssetMediaType());
        $query->setKeyword($requestDTO->getKeyword());
        $query->setStatus($requestDTO->getStatus() ?? 1);
        $query->setIsVerified($requestDTO->getIsVerified());
        $query->setOwnerUids($requestDTO->getOwnerUids());
        $query->setTagIds($requestDTO->getTagIds());
        $query->setTagMatch($requestDTO->getTagMatch());
        return $query;
    }

    /** @return AssetTagEntity[] */
    public function listTags(Authenticatable|BaseDataIsolation $authorization): array
    {
        $isolation = $this->createAssetDataIsolation($authorization);
        return $this->assetTagDomainService->listVisible($isolation);
    }

    public function saveTag(Authenticatable|BaseDataIsolation $authorization, string $name, string $nodeType, int $parentId = 0): AssetTagEntity
    {
        $isolation = $this->createAssetDataIsolation($authorization);
        return $this->assetTagDomainService->create($isolation, $name, AssetTagNodeType::from($nodeType), $parentId);
    }

    public function updateTag(Authenticatable|BaseDataIsolation $authorization, int|string $id, string $name, string $nodeType, int $parentId = 0): AssetTagEntity
    {
        $isolation = $this->createAssetDataIsolation($authorization);
        return $this->assetTagDomainService->update($isolation, $id, $name, AssetTagNodeType::from($nodeType), $parentId);
    }

    public function deleteTag(Authenticatable|BaseDataIsolation $authorization, int|string $id): void
    {
        $isolation = $this->createAssetDataIsolation($authorization);
        $this->assetTagDomainService->delete($isolation, $id);
    }

    public function syncAssetTags(Authenticatable|BaseDataIsolation $authorization, int|string $assetId, array $tagIds): void
    {
        $isolation = $this->createAssetDataIsolation($authorization);
        $asset = $this->assetDomainService->find($isolation, $assetId, $this->sharedAssetIds($isolation, [(string) $assetId]) !== []);
        if ($asset === null || ($asset->getOwnerUid() ?: $asset->getUserId()) !== $isolation->getCurrentUserId()) {
            ExceptionBuilder::throw(AssetErrorCode::DELETE_DENIED);
        }
        $this->assetTagDomainService->syncAssetTags($isolation, $asset, $tagIds);
    }

    public function listOwners(Authenticatable|BaseDataIsolation $authorization): array
    {
        $isolation = $this->createAssetDataIsolation($authorization);
        $assetIds = $this->sharedAssetIds($isolation);
        if ($assetIds === []) {
            return [];
        }
        $ownerUids = array_values(array_diff(
            $this->assetRepository->findOwnerUidsByIds($isolation, $assetIds),
            [$isolation->getCurrentUserId()],
        ));
        if ($ownerUids === []) {
            return [];
        }
        $users = $this->userRepository->getUserByIdsAndOrganizations(
            $ownerUids,
            [$isolation->getCurrentOrganizationCode()],
        );
        return array_map(static fn ($user): array => [
            'id' => $user->getUserId(),
            'name' => $user->getNickname(),
        ], $users);
    }

    public function transferOwner(Authenticatable|BaseDataIsolation $authorization, array $assetIds, string $ownerUid): array
    {
        $isolation = $this->createAssetDataIsolation($authorization);
        $ownerUid = trim($ownerUid);
        if ($ownerUid === '' || $ownerUid === $isolation->getCurrentUserId() || $this->userRepository->getUserByIdsAndOrganizations([$ownerUid], [$isolation->getCurrentOrganizationCode()]) === []) {
            ExceptionBuilder::throw(AssetErrorCode::DELETE_DENIED);
        }
        $assets = [];
        foreach ($this->assetDomainService->transferOwner($isolation, $assetIds, $ownerUid) as $asset) {
            $this->assetTagDomainService->stripPersonalTagsForTransfer($isolation, $asset);
            $assets[] = $asset;
        }
        Db::transaction(function () use ($isolation, $assets, $ownerUid): void {
            $permissionIsolation = $this->permissionDataIsolation($isolation);
            foreach ($assets as $asset) {
                $code = (string) $asset->getId();
                $this->resourceVisibilityDomainService->deleteResourceVisibilityByPrincipals(
                    $permissionIsolation,
                    ResourceType::ASSET,
                    $code,
                    PrincipalType::USER,
                    [$isolation->getCurrentUserId()],
                );
                $this->resourceVisibilityDomainService->addResourceVisibilityByPrincipalsIfMissing(
                    $permissionIsolation,
                    ResourceType::ASSET,
                    $code,
                    PrincipalType::USER,
                    [$ownerUid],
                );
            }
        });
        return ['changed_num' => count($assets), 'owner_uid' => $ownerUid];
    }

    private function enrichAssets(AssetDataIsolation $isolation, array $assets, string $scope): void
    {
        $ownerIds = [];
        foreach ($assets as $asset) {
            $ownerId = $asset->getOwnerUid() ?: $asset->getUserId();
            if ($ownerId !== null) {
                $ownerIds[] = $ownerId;
            }
            $asset->setSource($ownerId === $isolation->getCurrentUserId() ? 'PERSONAL' : (in_array($scope, ['TEAM', 'ALL'], true) ? 'TEAM' : 'PUBLIC'));
            $asset->setTags(array_map(static fn ($tag): array => [
                'id' => (string) $tag->getId(),
                'name' => (string) ($tag->getNameI18n()['default'] ?? ''),
                'parentId' => (string) $tag->getParentId(),
                'nodeType' => $tag->getNodeType()->value,
                'isOfficial' => $tag->getOwnerUid() === null,
            ], $this->assetTagDomainService->findAssetTags($isolation, (string) $asset->getId())));
        }
        $infos = [];
        foreach ($this->userRepository->getUserByIdsAndOrganizations(array_values(array_unique($ownerIds)), [$isolation->getCurrentOrganizationCode()]) as $user) {
            $infos[$user->getUserId()] = ['nickname' => $user->getNickname()];
        }
        foreach ($assets as $asset) {
            $ownerId = $asset->getOwnerUid() ?: $asset->getUserId();
            $info = $infos[$ownerId] ?? [];
            $asset->setOwnerName((string) ($info['nickname'] ?? $info['real_name'] ?? ''));
        }
    }

}
