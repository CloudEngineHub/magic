<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Infrastructure\ExternalAPI\ImageExpand;

use App\Infrastructure\ExternalAPI\ImageExpand\DTO\ImageExpandDriverRequest;
use App\Infrastructure\ExternalAPI\ImageExpand\DTO\ImageExpandDriverResponse;

interface ImageExpandDriverInterface
{
    public function getProviderCode(): string;

    public function expand(ImageExpandDriverRequest $request): ImageExpandDriverResponse;
}
