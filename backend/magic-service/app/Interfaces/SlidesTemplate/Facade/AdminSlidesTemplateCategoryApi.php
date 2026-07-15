<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\SlidesTemplate\Facade;

use App\Application\Kernel\Enum\MagicOperationEnum;
use App\Application\Kernel\Enum\MagicResourceEnum;
use App\Application\SlidesTemplate\Service\AdminSlidesTemplateCategoryAppService;
use App\Infrastructure\Core\AbstractApi;
use App\Infrastructure\Util\Permission\Annotation\CheckPermission;
use App\Interfaces\SlidesTemplate\Assembler\SlidesTemplateCategoryAssembler;
use App\Interfaces\SlidesTemplate\DTO\Request\AdminQuerySlidesTemplateCategoryRequest;
use App\Interfaces\SlidesTemplate\DTO\Request\SaveSlidesTemplateCategoryRequest;
use App\Interfaces\SlidesTemplate\DTO\Request\UpdateSlidesTemplateSortRequest;
use App\Interfaces\SlidesTemplate\DTO\Request\UpdateSlidesTemplateStatusRequest;
use Dtyq\ApiResponse\Annotation\ApiResponse;

#[ApiResponse('low_code')]
class AdminSlidesTemplateCategoryApi extends AbstractApi
{
    public function __construct(
        private readonly AdminSlidesTemplateCategoryAppService $adminSlidesTemplateCategoryAppService,
    ) {
    }

    #[CheckPermission([MagicResourceEnum::PLATFORM_SLIDES_TEMPLATE], MagicOperationEnum::QUERY)]
    public function queries(AdminQuerySlidesTemplateCategoryRequest $request): array
    {
        $request->validated();
        $result = $this->adminSlidesTemplateCategoryAppService->queries($this->getAuthorization(), $request);

        return SlidesTemplateCategoryAssembler::createPageDTO(
            $result['list'],
            $result['page'],
            $result['total'],
            true
        )->toArray();
    }

    #[CheckPermission([MagicResourceEnum::PLATFORM_SLIDES_TEMPLATE], MagicOperationEnum::QUERY)]
    public function detail(string $id): array
    {
        $category = $this->adminSlidesTemplateCategoryAppService->detail($this->getAuthorization(), $id);

        return SlidesTemplateCategoryAssembler::createAdminItemDTO($category)->toArray();
    }

    #[CheckPermission([MagicResourceEnum::PLATFORM_SLIDES_TEMPLATE], MagicOperationEnum::EDIT)]
    public function create(SaveSlidesTemplateCategoryRequest $request): array
    {
        $request->validated();
        $category = $this->adminSlidesTemplateCategoryAppService->create($this->getAuthorization(), $request);

        return SlidesTemplateCategoryAssembler::createAdminItemDTO($category)->toArray();
    }

    #[CheckPermission([MagicResourceEnum::PLATFORM_SLIDES_TEMPLATE], MagicOperationEnum::EDIT)]
    public function update(SaveSlidesTemplateCategoryRequest $request, string $id): array
    {
        $request->validated();
        $category = $this->adminSlidesTemplateCategoryAppService->update($this->getAuthorization(), $id, $request);

        return SlidesTemplateCategoryAssembler::createAdminItemDTO($category)->toArray();
    }

    #[CheckPermission([MagicResourceEnum::PLATFORM_SLIDES_TEMPLATE], MagicOperationEnum::EDIT)]
    public function updateStatus(UpdateSlidesTemplateStatusRequest $request, string $id): array
    {
        $request->validated();
        $this->adminSlidesTemplateCategoryAppService->updateStatus($this->getAuthorization(), $id, $request->getStatus());
        return [];
    }

    #[CheckPermission([MagicResourceEnum::PLATFORM_SLIDES_TEMPLATE], MagicOperationEnum::EDIT)]
    public function updateSort(UpdateSlidesTemplateSortRequest $request, string $id): array
    {
        $request->validated();
        $this->adminSlidesTemplateCategoryAppService->updateSort($this->getAuthorization(), $id, $request->getSort());
        return [];
    }

    #[CheckPermission([MagicResourceEnum::PLATFORM_SLIDES_TEMPLATE], MagicOperationEnum::EDIT)]
    public function delete(string $id): array
    {
        $this->adminSlidesTemplateCategoryAppService->delete($this->getAuthorization(), $id);
        return [];
    }
}
