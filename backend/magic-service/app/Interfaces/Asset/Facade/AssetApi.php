<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\Asset\Facade;

use App\Application\Asset\Service\AssetAppService;
use App\ErrorCode\AssetErrorCode;
use App\Infrastructure\Core\AbstractApi;
use App\Infrastructure\Core\Exception\ExceptionBuilder;
use App\Infrastructure\Core\ValueObject\Page;
use App\Interfaces\Asset\Assembler\AssetAssembler;
use App\Interfaces\Asset\DTO\Request\CreateAssetRequestDTO;
use App\Interfaces\Asset\DTO\Request\QueryAssetRequestDTO;
use App\Interfaces\Asset\DTO\Request\SaveAssetToLibraryRequestDTO;
use Dtyq\ApiResponse\Annotation\ApiResponse;
use Hyperf\HttpServer\Contract\RequestInterface;

#[ApiResponse('low_code')]
class AssetApi extends AbstractApi
{
    public function __construct(
        RequestInterface $request,
        private readonly AssetAppService $assetAppService,
    ) {
        parent::__construct($request);
    }

    public function create(): array
    {
        $requestDTO = CreateAssetRequestDTO::fromRequest($this->request);
        $authorization = $this->getAuthorization();
        $asset = $this->assetAppService->createPersonalAsset(
            $authorization,
            $requestDTO,
        );
        return AssetAssembler::createItem($asset)->toArray();
    }

    public function signAgreement(): array
    {
        $this->assetAppService->signAgreement($this->getAuthorization());
        return [];
    }

    /**
     * 保存到「我的素材库」：不做第三方合规同步，直接落库并登记可见范围。
     */
    public function saveToLibrary(): array
    {
        $requestDTO = SaveAssetToLibraryRequestDTO::fromRequest($this->request);
        $asset = $this->assetAppService->saveToLibrary(
            $this->getAuthorization(),
            $requestDTO,
        );
        return AssetAssembler::createItem($asset)->toArray();
    }

    public function list(): array
    {
        $requestDTO = QueryAssetRequestDTO::fromRequest($this->request);
        $authorization = $this->getAuthorization();
        $result = $this->assetAppService->list(
            $authorization,
            $requestDTO,
        );
        $page = new Page(
            $requestDTO->getPage(),
            $requestDTO->getPageSize(),
        );
        return AssetAssembler::createList($result['list'], $page, $result['total'])->toArray();
    }

    public function detail(int|string $assetId): array
    {
        $authorization = $this->getAuthorization();
        $asset = $this->assetAppService->detail($authorization, $assetId);
        if ($asset === null) {
            ExceptionBuilder::throw(AssetErrorCode::NOT_FOUND);
        }
        return AssetAssembler::createItem($asset)->toArray();
    }

    public function delete(int|string $assetId): array
    {
        $authorization = $this->getAuthorization();
        $deleted = $this->assetAppService->deletePersonalAsset(
            $authorization,
            $assetId,
        );
        return AssetAssembler::createDeleteDTO($assetId, $deleted)->toArray();
    }
}
