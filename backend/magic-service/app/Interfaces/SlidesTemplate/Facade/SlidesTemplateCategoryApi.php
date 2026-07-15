<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\SlidesTemplate\Facade;

use App\Application\SlidesTemplate\Service\SlidesTemplateCategoryAppService;
use App\Infrastructure\Core\AbstractApi;
use App\Interfaces\SlidesTemplate\Assembler\SlidesTemplateCategoryAssembler;
use App\Interfaces\SlidesTemplate\DTO\Request\PublicQuerySlidesTemplateCategoryRequest;
use Dtyq\ApiResponse\Annotation\ApiResponse;

#[ApiResponse('low_code')]
class SlidesTemplateCategoryApi extends AbstractApi
{
    public function __construct(
        private readonly SlidesTemplateCategoryAppService $slidesTemplateCategoryAppService,
    ) {
    }

    public function queries(PublicQuerySlidesTemplateCategoryRequest $request): array
    {
        $request->validated();
        $result = $this->slidesTemplateCategoryAppService->queries($this->getAuthorization(), $request);

        return SlidesTemplateCategoryAssembler::createPageDTO(
            $result['list'],
            $result['page'],
            $result['total'],
            false
        )->toArray();
    }
}
