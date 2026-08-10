<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\SuperMagic\File\Facade;

use App\Application\SuperMagic\File\Service\AudioMarkerAppService;
use App\Infrastructure\Util\Context\RequestContext;
use App\Interfaces\SuperMagic\Common\Support\Facade\AbstractApi;
use App\Interfaces\SuperMagic\File\DTO\Request\AudioMarkerListRequestDTO;
use App\Interfaces\SuperMagic\File\DTO\Request\CreateAudioMarkerRequestDTO;
use App\Interfaces\SuperMagic\File\DTO\Request\UpdateAudioMarkerRequestDTO;
use Dtyq\ApiResponse\Annotation\ApiResponse;
use Hyperf\HttpServer\Contract\RequestInterface;

#[ApiResponse('low_code')]
class AudioMarkerApi extends AbstractApi
{
    public function __construct(
        protected RequestInterface $request,
        protected AudioMarkerAppService $audioMarkerAppService
    ) {
        parent::__construct($request);
    }

    /**
     * Create audio marker.
     */
    public function createMarker(RequestContext $requestContext, string $projectId): array
    {
        $requestContext->setUserAuthorization($this->getAuthorization());
        $requestDTO = CreateAudioMarkerRequestDTO::fromRequest($this->request);
        $requestDTO->projectId = $projectId;
        return $this->audioMarkerAppService->createMarker($requestContext, $requestDTO)->toArray();
    }

    /**
     * Update audio marker.
     */
    public function updateMarker(RequestContext $requestContext, string $projectId, string $id): array
    {
        $requestContext->setUserAuthorization($this->getAuthorization());
        $requestDTO = UpdateAudioMarkerRequestDTO::fromRequest($this->request);
        $requestDTO->markerId = $id;
        return $this->audioMarkerAppService->updateMarker($requestContext, $requestDTO)->toArray();
    }

    /**
     * Get audio marker detail.
     */
    public function getMarkerDetail(RequestContext $requestContext, string $projectId, string $id): array
    {
        $requestContext->setUserAuthorization($this->getAuthorization());
        return $this->audioMarkerAppService->getMarkerDetail($requestContext, $id)->toArray();
    }

    /**
     * Get audio markers list.
     */
    public function getMarkersList(RequestContext $requestContext, string $projectId): array
    {
        $requestContext->setUserAuthorization($this->getAuthorization());
        $requestDTO = AudioMarkerListRequestDTO::fromRequest($this->request);
        $requestDTO->projectId = $projectId;
        return $this->audioMarkerAppService->getMarkersList($requestContext, $requestDTO)->toArray();
    }

    /**
     * Delete audio marker.
     */
    public function deleteMarker(RequestContext $requestContext, string $projectId, string $id): array
    {
        $requestContext->setUserAuthorization($this->getAuthorization());
        $this->audioMarkerAppService->deleteMarker($requestContext, $id);
        return ['id' => $id];
    }
}
