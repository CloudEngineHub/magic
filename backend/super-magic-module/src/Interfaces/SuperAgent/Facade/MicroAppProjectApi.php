<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Dtyq\SuperMagic\Interfaces\SuperAgent\Facade;

use App\Infrastructure\Util\Context\RequestContext;
use Dtyq\ApiResponse\Annotation\ApiResponse;
use Dtyq\SuperMagic\Application\SuperAgent\DTO\Request\CreateMicroAppProjectRequestDTO;
use Dtyq\SuperMagic\Application\SuperAgent\DTO\Request\MicroAppListRequestDTO;
use Dtyq\SuperMagic\Application\SuperAgent\DTO\Request\PublishedMicroAppListRequestDTO;
use Dtyq\SuperMagic\Application\SuperAgent\DTO\Request\PublishMicroAppRequestDTO;
use Dtyq\SuperMagic\Application\SuperAgent\DTO\Request\UpdateMicroAppRequestDTO;
use Dtyq\SuperMagic\Application\SuperAgent\Service\MicroAppProjectAppService;
use Dtyq\SuperMagic\Application\SuperAgent\Service\ProjectAppService;
use Hyperf\HttpServer\Contract\RequestInterface;

/**
 * Micro app project API.
 */
#[ApiResponse('low_code')]
class MicroAppProjectApi extends AbstractApi
{
    public function __construct(
        protected RequestInterface $request,
        private readonly ProjectAppService $projectAppService,
        private readonly MicroAppProjectAppService $microAppProjectAppService
    ) {
        parent::__construct($request);
    }

    /**
     * Create micro app project.
     */
    public function store(RequestContext $requestContext): array
    {
        $requestContext->setUserAuthorization($this->getAuthorization());

        $requestDTO = CreateMicroAppProjectRequestDTO::fromRequest($this->request);

        return $this->projectAppService->createMicroAppProject($requestContext, $requestDTO);
    }

    public function publish(RequestContext $requestContext, int $appId): array
    {
        $requestContext->setUserAuthorization($this->getAuthorization());

        $requestDTO = PublishMicroAppRequestDTO::fromRequest($this->request);

        return $this->microAppProjectAppService->publish($requestContext, $appId, $requestDTO);
    }

    public function unpublish(RequestContext $requestContext, int $appId): array
    {
        $requestContext->setUserAuthorization($this->getAuthorization());

        return $this->microAppProjectAppService->unpublish($requestContext, $appId);
    }

    public function destroy(RequestContext $requestContext, int $appId): array
    {
        $requestContext->setUserAuthorization($this->getAuthorization());

        return $this->microAppProjectAppService->delete($requestContext, $appId);
    }

    public function publishedList(RequestContext $requestContext): array
    {
        $requestContext->setUserAuthorization($this->getAuthorization());

        $requestDTO = PublishedMicroAppListRequestDTO::fromRequest($this->request);

        return $this->microAppProjectAppService->publishedList($requestContext, $requestDTO);
    }

    public function list(RequestContext $requestContext): array
    {
        $requestContext->setUserAuthorization($this->getAuthorization());

        $requestDTO = MicroAppListRequestDTO::fromRequest($this->request);

        return $this->microAppProjectAppService->list($requestContext, $requestDTO);
    }

    public function update(RequestContext $requestContext, int $appId): array
    {
        $requestContext->setUserAuthorization($this->getAuthorization());

        $requestDTO = UpdateMicroAppRequestDTO::fromRequest($this->request);

        return $this->microAppProjectAppService->update($requestContext, $appId, $requestDTO);
    }

    public function show(RequestContext $requestContext, int $appId): array
    {
        $requestContext->setUserAuthorization($this->getAuthorization());

        return $this->microAppProjectAppService->show($requestContext, $appId);
    }

    public function showByProject(RequestContext $requestContext, int $projectId): array
    {
        $requestContext->setUserAuthorization($this->getAuthorization());

        return $this->microAppProjectAppService->showByProject($requestContext, $projectId);
    }

    public function resolvePublished(int $appId): array
    {
        return $this->microAppProjectAppService->resolvePublished($appId);
    }
}
