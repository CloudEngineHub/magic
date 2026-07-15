<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\SlidesTemplate\Command;

use App\Application\SlidesTemplate\Official\SlidesTemplateTagInitializer;
use Hyperf\Command\Annotation\Command;
use Hyperf\Command\Command as HyperfCommand;
use Psr\Container\ContainerInterface;

#[Command]
class InitSlidesTemplateTagsCommand extends HyperfCommand
{
    public function __construct(
        protected ContainerInterface $container
    ) {
        parent::__construct('slides-template-tags:init');
    }

    public function configure(): void
    {
        parent::configure();
        $this->setDescription('初始化 PPT 模板标签组和标签词表');
    }

    public function handle(): int
    {
        $this->info('开始初始化 PPT 模板标签词表...');

        $result = SlidesTemplateTagInitializer::init();
        if (($result['success'] ?? false) !== true) {
            $this->error($result['message'] ?? '初始化失败');
            return 1;
        }

        $this->info($result['message']);
        $this->line(sprintf(
            '标签组：%d，标签：%d，变更总数：%d',
            (int) ($result['groups'] ?? 0),
            (int) ($result['tags'] ?? 0),
            (int) ($result['count'] ?? 0)
        ));
        $this->info('PPT 模板标签词表初始化完成');

        return 0;
    }
}
