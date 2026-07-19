<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\SlidesTemplate\Facade;

use App\Application\Kernel\Enum\MagicOperationEnum;
use App\Application\Kernel\Enum\MagicResourceEnum;
use App\Application\SlidesTemplate\Service\AdminSlidesTemplateTagAppService;
use App\Infrastructure\Core\AbstractApi;
use App\Infrastructure\Util\Permission\Annotation\CheckPermission;
use App\Interfaces\SlidesTemplate\Assembler\SlidesTemplateTagAssembler;
use App\Interfaces\SlidesTemplate\DTO\Request\AdminQuerySlidesTemplateTagRequest;
use App\Interfaces\SlidesTemplate\DTO\Request\SaveSlidesTemplateTagRequest;
use App\Interfaces\SlidesTemplate\DTO\Request\UpdateSlidesTemplateSortRequest;
use App\Interfaces\SlidesTemplate\DTO\Request\UpdateSlidesTemplateStatusRequest;
use Dtyq\ApiResponse\Annotation\ApiResponse;

#[ApiResponse('low_code')]
class AdminSlidesTemplateTagApi extends AbstractApi
{
    public function __construct(
        private readonly AdminSlidesTemplateTagAppService $adminSlidesTemplateTagAppService,
    ) {
    }

    #[CheckPermission([MagicResourceEnum::PLATFORM_SLIDES_TEMPLATE], MagicOperationEnum::QUERY)]
    public function queries(AdminQuerySlidesTemplateTagRequest $request): array
    {
        $request->validated();
        $result = $this->adminSlidesTemplateTagAppService->queries($this->getAuthorization(), $request);

        return SlidesTemplateTagAssembler::createPageDTO(
            $result['list'],
            $result['page'],
            $result['total'],
            true
        )->toArray();
    }

    #[CheckPermission([MagicResourceEnum::PLATFORM_SLIDES_TEMPLATE], MagicOperationEnum::QUERY)]
    public function detail(string $id): array
    {
        $tag = $this->adminSlidesTemplateTagAppService->detail($this->getAuthorization(), $id);

        return SlidesTemplateTagAssembler::createAdminItemDTO($tag)->toArray();
    }

    #[CheckPermission([MagicResourceEnum::PLATFORM_SLIDES_TEMPLATE], MagicOperationEnum::QUERY)]
    public function tree(): array
    {
        return SlidesTemplateTagAssembler::createAdminTreeDTO(
            $this->adminSlidesTemplateTagAppService->tree($this->getAuthorization())
        );
    }

    #[CheckPermission([MagicResourceEnum::PLATFORM_SLIDES_TEMPLATE], MagicOperationEnum::EDIT)]
    public function create(SaveSlidesTemplateTagRequest $request): array
    {
        $request->validated();
        $tag = $this->adminSlidesTemplateTagAppService->create($this->getAuthorization(), $request);

        return SlidesTemplateTagAssembler::createAdminItemDTO($tag)->toArray();
    }

    #[CheckPermission([MagicResourceEnum::PLATFORM_SLIDES_TEMPLATE], MagicOperationEnum::EDIT)]
    public function update(SaveSlidesTemplateTagRequest $request, string $id): array
    {
        $request->validated();
        $tag = $this->adminSlidesTemplateTagAppService->update($this->getAuthorization(), $id, $request);

        return SlidesTemplateTagAssembler::createAdminItemDTO($tag)->toArray();
    }

    #[CheckPermission([MagicResourceEnum::PLATFORM_SLIDES_TEMPLATE], MagicOperationEnum::EDIT)]
    public function updateStatus(UpdateSlidesTemplateStatusRequest $request, string $id): array
    {
        $request->validated();
        $this->adminSlidesTemplateTagAppService->updateStatus($this->getAuthorization(), $id, $request->getStatus());
        return [];
    }

    #[CheckPermission([MagicResourceEnum::PLATFORM_SLIDES_TEMPLATE], MagicOperationEnum::EDIT)]
    public function updateSort(UpdateSlidesTemplateSortRequest $request, string $id): array
    {
        $request->validated();
        $this->adminSlidesTemplateTagAppService->updateSort($this->getAuthorization(), $id, $request->getSort());
        return [];
    }

    #[CheckPermission([MagicResourceEnum::PLATFORM_SLIDES_TEMPLATE], MagicOperationEnum::EDIT)]
    public function delete(string $id): array
    {
        $this->adminSlidesTemplateTagAppService->delete($this->getAuthorization(), $id);
        return [];
    }
}
