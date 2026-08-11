<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\Admin\SuperMagic\Agent;

use App\Application\Kernel\Enum\MagicOperationEnum;
use App\Application\Kernel\Enum\MagicResourceEnum;
use App\Application\SuperMagic\Agent\Service\AdminSuperMagicCategoryAppService;
use App\Infrastructure\Util\Permission\Annotation\CheckPermission;
use App\Interfaces\SuperMagic\Agent\DTO\Request\CreateAgentCategoryRequestAdminDTO;
use App\Interfaces\SuperMagic\Agent\DTO\Request\QueryAgentCategoriesRequestAdminDTO;
use App\Interfaces\SuperMagic\Agent\DTO\Request\UpdateAgentCategoryRequestAdminDTO;
use App\Interfaces\SuperMagic\Agent\Facade\AbstractSuperMagicApi;
use Dtyq\ApiResponse\Annotation\ApiResponse;
use Hyperf\Di\Annotation\Inject;

#[ApiResponse(version: 'low_code')]
class AdminSuperMagicCategoryApi extends AbstractSuperMagicApi
{
    #[Inject]
    protected AdminSuperMagicCategoryAppService $categoryAppService;

    #[CheckPermission([MagicResourceEnum::PLATFORM_AGENT_MARKET], MagicOperationEnum::QUERY)]
    public function queries(): array
    {
        return ['list' => $this->categoryAppService->query(QueryAgentCategoriesRequestAdminDTO::fromRequest($this->request))];
    }

    #[CheckPermission([MagicResourceEnum::PLATFORM_AGENT_MARKET], MagicOperationEnum::QUERY)]
    public function show(int $id): array
    {
        return $this->categoryAppService->getDetail($id);
    }

    #[CheckPermission([MagicResourceEnum::PLATFORM_AGENT_MARKET], MagicOperationEnum::EDIT)]
    public function create(): array
    {
        return $this->categoryAppService->create(
            $this->getAuthorization(),
            CreateAgentCategoryRequestAdminDTO::fromRequest($this->request)
        );
    }

    #[CheckPermission([MagicResourceEnum::PLATFORM_AGENT_MARKET], MagicOperationEnum::EDIT)]
    public function update(int $id): array
    {
        return $this->categoryAppService->update(
            $this->getAuthorization(),
            $id,
            UpdateAgentCategoryRequestAdminDTO::fromRequest($this->request)
        );
    }

    #[CheckPermission([MagicResourceEnum::PLATFORM_AGENT_MARKET], MagicOperationEnum::EDIT)]
    public function delete(int $id): array
    {
        $this->categoryAppService->delete($id);
        return [];
    }
}
