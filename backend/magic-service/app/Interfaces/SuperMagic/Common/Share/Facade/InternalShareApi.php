<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\SuperMagic\Common\Share\Facade;

use App\Application\SuperMagic\Common\Share\Service\InternalShareAppService;
use Dtyq\ApiResponse\Annotation\ApiResponse;

/**
 * Internal share API.
 */
#[ApiResponse('low_code')]
class InternalShareApi extends AbstractApi
{
    public function __construct(
        protected InternalShareAppService $internalShareAppService
    ) {
    }

    /**
     * Get share title by resource ID.
     *
     * @param string $resource_id Resource ID
     * @return array Share title data
     */
    public function getShareTitle(string $resource_id): array
    {
        $dto = $this->internalShareAppService->getShareTitle($resource_id);
        return $dto->toArray();
    }
}
