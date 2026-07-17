<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */
use App\Application\SlidesTemplate\Official\SlidesTemplateTagInitializer;
use Hyperf\Database\Migrations\Migration;

return new class extends Migration {
    public function up(): void
    {
        $result = SlidesTemplateTagInitializer::init();
        if (! $result['success']) {
            echo "Warning: {$result['message']}\n";
            return;
        }

        echo "{$result['message']}\n";
    }

    public function down(): void
    {
        // 官方 PPT 标签词表由初始化器幂等维护，回滚时不自动删除数据。
    }
};
