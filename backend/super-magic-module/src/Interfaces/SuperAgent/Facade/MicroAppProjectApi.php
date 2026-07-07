<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Dtyq\SuperMagic\Interfaces\SuperAgent\Facade;

use App\Infrastructure\Util\Context\RequestContext;
use Dtyq\ApiResponse\Annotation\ApiResponse;
use Dtyq\SuperMagic\Application\SuperAgent\DTO\Request\CreateMicroAppProjectRequestDTO;
use Dtyq\SuperMagic\Application\SuperAgent\DTO\Request\PublishedMicroAppListRequestDTO;
use Dtyq\SuperMagic\Application\SuperAgent\DTO\Request\PublishMicroAppRequestDTO;
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

    public function publish(RequestContext $requestContext, int $projectId): array
    {
        $requestContext->setUserAuthorization($this->getAuthorization());

        $requestDTO = PublishMicroAppRequestDTO::fromRequest($this->request);

        return $this->microAppProjectAppService->publish($requestContext, $projectId, $requestDTO);
    }

    public function unpublish(RequestContext $requestContext, int $projectId): array
    {
        $requestContext->setUserAuthorization($this->getAuthorization());

        return $this->microAppProjectAppService->unpublish($requestContext, $projectId);
    }

    public function publishedList(RequestContext $requestContext): array
    {
        $requestContext->setUserAuthorization($this->getAuthorization());

        $requestDTO = PublishedMicroAppListRequestDTO::fromRequest($this->request);

        return $this->microAppProjectAppService->publishedList($requestContext, $requestDTO);
    }
}
