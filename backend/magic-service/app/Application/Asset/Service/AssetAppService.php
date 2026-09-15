<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\Asset\Service;

use App\Domain\Asset\Entity\AssetDataIsolation;
use App\Domain\Asset\Entity\AssetEntity;
use App\Domain\Asset\Entity\ValueObject\AssetScope;
use App\Domain\Asset\Entity\ValueObject\AssetVisibility;
use App\Domain\Asset\Entity\ValueObject\Query\AssetQuery;
use App\Domain\Asset\Service\AssetDomainService;
use App\Domain\Permission\Service\ResourceVisibilityDomainService;
use App\Infrastructure\Core\DataIsolation\BaseDataIsolation;
use App\Infrastructure\Core\ValueObject\Page;
use App\Interfaces\Asset\DTO\Request\CreateAssetRequestDTO;
use App\Interfaces\Asset\DTO\Request\QueryAssetRequestDTO;
use App\Interfaces\Asset\DTO\Request\SaveAssetToLibraryRequestDTO;
use Qbhy\HyperfAuth\Authenticatable;

class AssetAppService extends AbstractAssetAppService
{
    public function __construct(
        private readonly AssetDomainService $assetDomainService,
        ResourceVisibilityDomainService $resourceVisibilityDomainService,
    ) {
        parent::__construct($resourceVisibilityDomainService);
    }

    public function createPersonalAsset(
        Authenticatable|BaseDataIsolation $authorization,
        CreateAssetRequestDTO $requestDTO,
    ): AssetEntity {
        $dataIsolation = $this->createAssetDataIsolation($authorization);
        $asset = $this->createAssetEntity($requestDTO, false, $dataIsolation->getCurrentOrganizationCode());
        // 素材只落在私有桶：创建前解析出 file_url 供第三方拉取；落库后的实体不含该字段，回填给响应。
        $this->resolveAssetFileUrls([$asset]);
        // 记录内容指纹，便于复用已同步的第三方素材。
        $asset->setContentHash($this->resolveContentHash($asset));
        $fileUrl = $asset->getFileUrl();

        $asset = $this->assetDomainService->createPersonal($dataIsolation, $asset);
        $this->grantAssetVisibility($dataIsolation, $asset, AssetVisibility::personal());
        $asset->setFileUrl($fileUrl);
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
        $asset = $this->assetDomainService->saveToLibrary(
            $dataIsolation,
            $this->createAssetEntity($requestDTO, false, $dataIsolation->getCurrentOrganizationCode()),
        );
        $this->grantAssetVisibility($dataIsolation, $asset, $requestDTO->getVisibility());
        // 落库实体不带 file_url，列表与详情都会回填，保存响应保持一致，前端拿到即可直接展示。
        $this->resolveAssetFileUrls([$asset]);

        return $asset;
    }

    public function signAgreement(Authenticatable|BaseDataIsolation $authorization): void
    {
        $this->assetDomainService->signAgreement(
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
        $query->setSharedAssetIds($scope->includesSharedAssets() ? $this->sharedAssetIds($dataIsolation) : []);
        $query->setAssetKind($requestDTO->getAssetKind());
        $query->setParentId($requestDTO->getParentId());
        $query->setAssetBusinessType($requestDTO->getAssetBusinessType());
        $query->setAssetMediaType($requestDTO->getAssetMediaType());
        $query->setKeyword($requestDTO->getKeyword());
        $query->setStatus($requestDTO->getStatus() ?? 1);
        return $query;
    }
}
