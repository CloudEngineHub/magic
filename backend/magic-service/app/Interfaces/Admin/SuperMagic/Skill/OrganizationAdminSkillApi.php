<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\Admin\SuperMagic\Skill;

use App\Application\Kernel\Enum\MagicOperationEnum;
use App\Application\Kernel\Enum\MagicResourceEnum;
use App\Application\SuperMagic\Skill\Service\AdminSkillAppService;
use App\Infrastructure\Util\Context\RequestContext;
use App\Infrastructure\Util\Permission\Annotation\CheckPermission;
use App\Interfaces\SuperMagic\Common\Support\Facade\AbstractApi;
use App\Interfaces\SuperMagic\Skill\DTO\Request\QuerySkillVersionsRequestAdminDTO;
use App\Interfaces\SuperMagic\Skill\DTO\Request\ReviewOrganizationSkillVersionRequestDTO;
use Dtyq\ApiResponse\Annotation\ApiResponse;
use Hyperf\Di\Annotation\Inject;

#[ApiResponse(version: 'low_code')]
class OrganizationAdminSkillApi extends AbstractApi
{
    #[Inject]
    protected AdminSkillAppService $adminSkillAppService;

    #[CheckPermission(MagicResourceEnum::WORKSPACE_ADMIN_AI_SKILL, MagicOperationEnum::QUERY)]
    public function queryVersions(RequestContext $requestContext): array
    {
        $requestContext->setUserAuthorization($this->getAuthorization());

        $requestDTO = QuerySkillVersionsRequestAdminDTO::fromRequest($this->request);

        return $this->adminSkillAppService->queryOrganizationVersions($requestContext, $requestDTO)->toArray();
    }

    #[CheckPermission(MagicResourceEnum::WORKSPACE_ADMIN_AI_SKILL, MagicOperationEnum::EDIT)]
    public function reviewVersion(RequestContext $requestContext, int $id): array
    {
        $requestContext->setUserAuthorization($this->getAuthorization());
        $requestDTO = ReviewOrganizationSkillVersionRequestDTO::fromRequest($this->request);

        $this->adminSkillAppService->reviewOrganizationVersion($requestContext, $id, $requestDTO);

        return [];
    }
}
