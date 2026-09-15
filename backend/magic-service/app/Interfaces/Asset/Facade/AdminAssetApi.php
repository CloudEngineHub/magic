<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\Asset\Facade;

use App\Application\Asset\Service\AdminAssetAppService;
use App\ErrorCode\AssetErrorCode;
use App\Infrastructure\Core\AbstractApi;
use App\Infrastructure\Core\Exception\ExceptionBuilder;
use App\Infrastructure\Core\ValueObject\Page;
use App\Infrastructure\Util\Auth\PermissionChecker;
use App\Interfaces\Asset\Assembler\AssetAssembler;
use App\Interfaces\Asset\DTO\Request\CreateAssetRequestDTO;
use App\Interfaces\Asset\DTO\Request\QueryAssetRequestDTO;
use App\Interfaces\Asset\DTO\Request\UpdateAssetRequestDTO;
use Dtyq\ApiResponse\Annotation\ApiResponse;
use Hyperf\HttpServer\Contract\RequestInterface;

#[ApiResponse('low_code')]
class AdminAssetApi extends AbstractApi
{
    public function __construct(
        RequestInterface $request,
        private readonly AdminAssetAppService $assetAppService,
    ) {
        parent::__construct($request);
    }

    public function create(): array
    {
        $requestDTO = CreateAssetRequestDTO::fromRequest($this->request);
        $authorization = $this->getAuthorization();
        $this->assertAdmin($authorization);
        $asset = $this->assetAppService->createPublicAsset(
            $authorization,
            $requestDTO,
        );
        return AssetAssembler::createItem($asset, null, true)->toArray();
    }

    public function list(): array
    {
        $requestDTO = QueryAssetRequestDTO::fromRequest($this->request);
        $authorization = $this->getAuthorization();
        $this->assertAdmin($authorization);
        $result = $this->assetAppService->list(
            $authorization,
            $requestDTO,
        );
        $page = new Page(
            $requestDTO->getPage(),
            $requestDTO->getPageSize(),
        );
        return AssetAssembler::createList($result['list'], $page, $result['total'], [], true)->toArray();
    }

    public function update(int|string $assetId): array
    {
        $requestDTO = UpdateAssetRequestDTO::fromRequest($this->request);
        $authorization = $this->getAuthorization();
        $this->assertAdmin($authorization);
        $asset = $this->assetAppService->updatePublicAsset(
            $authorization,
            $assetId,
            $requestDTO,
        );
        return AssetAssembler::createItem($asset, null, true)->toArray();
    }

    public function delete(int|string $assetId): array
    {
        $authorization = $this->getAuthorization();
        $this->assertAdmin($authorization);
        $deleted = $this->assetAppService->deletePublicAsset(
            $authorization,
            $assetId,
        );
        return AssetAssembler::createDeleteDTO($assetId, $deleted, true)->toArray();
    }

    private function assertAdmin(object $authorization): void
    {
        if (! PermissionChecker::isOrganizationAdminByUserId(
            $authorization->getOrganizationCode(),
            $authorization->getId(),
        )) {
            ExceptionBuilder::throw(AssetErrorCode::ADMIN_DENIED);
        }
    }
}
