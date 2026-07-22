<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\SlidesTemplate\Facade;

use App\Application\SlidesTemplate\Service\SlidesTemplateAppService;
use App\Infrastructure\Core\AbstractApi;
use App\Interfaces\SlidesTemplate\Assembler\SlidesTemplateAssembler;
use App\Interfaces\SlidesTemplate\DTO\Request\PublicQuerySlidesTemplateRequest;
use Dtyq\ApiResponse\Annotation\ApiResponse;

#[ApiResponse('low_code')]
class SlidesTemplateApi extends AbstractApi
{
    public function __construct(
        private readonly SlidesTemplateAppService $slidesTemplateAppService,
    ) {
    }

    public function queries(PublicQuerySlidesTemplateRequest $request): array
    {
        $request->validated();
        $result = $this->slidesTemplateAppService->queries($this->getAuthorization(), $request);

        return SlidesTemplateAssembler::createPublicListPageDTO($result['list'], $result['page'])->toArray();
    }

    public function count(PublicQuerySlidesTemplateRequest $request): array
    {
        $request->validated();
        $result = $this->slidesTemplateAppService->count($this->getAuthorization(), $request);

        return SlidesTemplateAssembler::createCountDTO(
            $result['total'],
            $result['total_usage_count'],
            (int) ($result['template_count_today_growth'] ?? 0)
        )->toArray();
    }

    public function detail(string $code): array
    {
        $template = $this->slidesTemplateAppService->detail($this->getAuthorization(), $code);

        return SlidesTemplateAssembler::createPublicDetailDTO($template)->toArray();
    }
}
