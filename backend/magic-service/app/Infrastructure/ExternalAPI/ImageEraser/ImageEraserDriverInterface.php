<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Infrastructure\ExternalAPI\ImageEraser;

use App\Infrastructure\ExternalAPI\ImageEraser\DTO\ImageEraserDriverRequest;
use App\Infrastructure\ExternalAPI\ImageEraser\DTO\ImageEraserDriverResponse;

interface ImageEraserDriverInterface
{
    public function getProviderCode(): string;

    public function erase(ImageEraserDriverRequest $request): ImageEraserDriverResponse;
}
