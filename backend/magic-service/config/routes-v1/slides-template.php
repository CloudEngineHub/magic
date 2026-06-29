<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

use App\Infrastructure\Util\Middleware\RequestContextMiddleware;
use App\Interfaces\SlidesTemplate\Facade\SlidesTemplateApi;
use Hyperf\HttpServer\Router\Router;

// 幻灯片模板使用侧
Router::addGroup('/api/v1/slides-templates', static function () {
    Router::get('', [SlidesTemplateApi::class, 'queries']);
    Router::get('/{code}/file-url', [SlidesTemplateApi::class, 'getFileUrl']);
}, ['middleware' => [RequestContextMiddleware::class]]);
