<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Infrastructure\ExternalAPI\ImageEraser;

use App\Infrastructure\ExternalAPI\ImageEraser\Driver\OfficialProxyImageEraserDriver;
use App\Infrastructure\ExternalAPI\ImageEraser\Driver\VolcengineImageEraserDriver;
use App\Infrastructure\ExternalAPI\ImageEraser\Driver\VolcengineJimengImageEraserDriver;
use App\Infrastructure\Util\File\ImageFileInspector;
use Hyperf\Logger\LoggerFactory;
use InvalidArgumentException;

class ImageEraserDriverFactory
{
    public const PROVIDER_OFFICIAL_PROXY = 'official_proxy';

    public const PROVIDER_VOLCENGINE = 'volcengine';

    public const PROVIDER_JIMENG = 'jimeng';

    public function __construct(
        private readonly ImageFileInspector $imageFileInspector,
        private readonly LoggerFactory $loggerFactory,
    ) {
    }

    /**
     * @param array<string, mixed> $providerConfig
     */
    public function create(string $providerCode, array $providerConfig): ImageEraserDriverInterface
    {
        return match ($providerCode) {
            self::PROVIDER_OFFICIAL_PROXY => new OfficialProxyImageEraserDriver($providerConfig, $this->imageFileInspector, $this->loggerFactory),
            self::PROVIDER_VOLCENGINE => new VolcengineImageEraserDriver($providerConfig, $this->imageFileInspector, $this->loggerFactory),
            self::PROVIDER_JIMENG => new VolcengineJimengImageEraserDriver($providerConfig, $this->imageFileInspector, $this->loggerFactory),
            default => throw new InvalidArgumentException("Unsupported image eraser provider: {$providerCode}"),
        };
    }
}
