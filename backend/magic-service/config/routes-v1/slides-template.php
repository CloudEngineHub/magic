<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */
use App\Infrastructure\Util\Middleware\RequestContextMiddleware;
use App\Interfaces\SlidesTemplate\Facade\SlidesTemplateApi;
use App\Interfaces\SlidesTemplate\Facade\SlidesTemplateCategoryApi;
use App\Interfaces\SlidesTemplate\Facade\SlidesTemplateTagApi;
use Hyperf\HttpServer\Router\Router;

// 幻灯片模板分类使用侧
Router::addGroup('/api/v1/slides-template-categories', static function () {
    Router::get('', [SlidesTemplateCategoryApi::class, 'queries']);
}, ['middleware' => [RequestContextMiddleware::class]]);

// 幻灯片模板标签使用侧
Router::addGroup('/api/v1/slides-template-tags', static function () {
    Router::get('', [SlidesTemplateTagApi::class, 'queries']);
}, ['middleware' => [RequestContextMiddleware::class]]);

// 幻灯片模板标签组使用侧
Router::addGroup('/api/v1/slides-template/tags', static function () {
    Router::get('/groups', [SlidesTemplateTagApi::class, 'groups']);
}, ['middleware' => [RequestContextMiddleware::class]]);

// 幻灯片模板使用侧
Router::addGroup('/api/v1/slides-templates', static function () {
    Router::get('', [SlidesTemplateApi::class, 'queries']);
    Router::get('/count', [SlidesTemplateApi::class, 'count']);
    Router::get('/{code}', [SlidesTemplateApi::class, 'detail']);
}, ['middleware' => [RequestContextMiddleware::class]]);
