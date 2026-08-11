<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\SuperMagic\Project\Facade\OpenApi;

use App\Application\SuperMagic\Project\Service\ProjectAppService;
use App\ErrorCode\GenericErrorCode;
use App\Infrastructure\Core\Exception\ExceptionBuilder;
use App\Infrastructure\Util\Context\RequestCoContext;
use App\Infrastructure\Util\Context\RequestContext;
use App\Interfaces\SuperMagic\Common\Support\Facade\AbstractApi;
use App\Interfaces\SuperMagic\File\DTO\Request\GetProjectAttachmentsRequestDTO;
use App\Interfaces\SuperMagic\Project\DTO\Request\CreateProjectRequestDTO;
use App\Interfaces\SuperMagic\Project\DTO\Request\GetProjectListRequestDTO;
use Dtyq\ApiResponse\Annotation\ApiResponse;
use Hyperf\HttpServer\Contract\RequestInterface;

/**
 * Open Project API.
 * Provides open API endpoints for project management.
 */
#[ApiResponse('low_code')]
class OpenProjectApi extends AbstractApi
{
    public function __construct(
        protected RequestInterface $request,
        private readonly ProjectAppService $projectAppService,
    ) {
        parent::__construct($request);
    }

    /**
     * Get project basic info (name, etc.) - no authentication required.
     * Uses cached project name to avoid database pressure from public access.
     */
    public function show(string $id): array
    {
        $projectName = $this->projectAppService->getProjectNameNotUserId((int) $id);

        return ['project_name' => $projectName];
    }

    /**
     * Create project.
     * Creates a new project for the authenticated user.
     *
     * @param RequestContext $requestContext Request context
     * @return array Created project information
     */
    public function createProject(RequestContext $requestContext): array
    {
        // 1. Get user authorization from coroutine context (set by middleware)
        $userAuthorization = RequestCoContext::getUserAuthorization();
        if (empty($userAuthorization)) {
            ExceptionBuilder::throw(GenericErrorCode::ParameterMissing, 'user_authorization_not_found');
        }

        // 2. Set user authorization to RequestContext
        $requestContext->setUserAuthorization($userAuthorization);

        // 3. Create request DTO from request
        $requestDTO = CreateProjectRequestDTO::fromRequest($this->request);

        // 4. Call application service (reuse existing business logic)
        return $this->projectAppService->createProject($requestContext, $requestDTO);
    }

    /**
     * Get project list.
     * Returns projects for the authenticated user with pagination and filters.
     */
    public function index(RequestContext $requestContext): array
    {
        $userAuthorization = RequestCoContext::getUserAuthorization();
        if (empty($userAuthorization)) {
            ExceptionBuilder::throw(GenericErrorCode::ParameterMissing, 'user_authorization_not_found');
        }

        $requestContext->setUserAuthorization($userAuthorization);

        $requestDTO = GetProjectListRequestDTO::fromRequest($this->request);

        return $this->projectAppService->getProjectList($requestContext, $requestDTO);
    }

    /**
     * Get project attachments.
     */
    public function getProjectAttachments(RequestContext $requestContext): array
    {
        $userAuthorization = RequestCoContext::getUserAuthorization();
        if (empty($userAuthorization)) {
            ExceptionBuilder::throw(GenericErrorCode::ParameterMissing, 'user_authorization_not_found');
        }

        $requestDTO = GetProjectAttachmentsRequestDTO::fromRequest($this->request);
        $requestDTO->setPageSize(10000);

        $requestContext->setUserAuthorization($userAuthorization);

        return $this->projectAppService->getProjectAttachments($requestContext, $requestDTO);
    }
}
