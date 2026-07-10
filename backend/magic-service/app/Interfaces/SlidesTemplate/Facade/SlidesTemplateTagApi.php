<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\SlidesTemplate\Facade;

use App\Application\SlidesTemplate\Service\SlidesTemplateTagAppService;
use App\Infrastructure\Core\AbstractApi;
use App\Interfaces\SlidesTemplate\Assembler\SlidesTemplateTagAssembler;
use App\Interfaces\SlidesTemplate\DTO\Request\PublicQuerySlidesTemplateTagRequest;
use Dtyq\ApiResponse\Annotation\ApiResponse;

#[ApiResponse('low_code')]
class SlidesTemplateTagApi extends AbstractApi
{
    public function __construct(
        private readonly SlidesTemplateTagAppService $slidesTemplateTagAppService,
    ) {
    }

    public function queries(PublicQuerySlidesTemplateTagRequest $request): array
    {
        $request->validated();
        $result = $this->slidesTemplateTagAppService->queries($this->getAuthorization(), $request);

        return SlidesTemplateTagAssembler::createPageDTO(
            $result['list'],
            $result['page'],
            $result['total'],
            false
        )->toArray();
    }
}
