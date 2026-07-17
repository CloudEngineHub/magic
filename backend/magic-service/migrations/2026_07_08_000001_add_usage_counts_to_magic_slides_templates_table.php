<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */
use Hyperf\Database\Migrations\Migration;
use Hyperf\Database\Schema\Blueprint;
use Hyperf\Database\Schema\Schema;

return new class extends Migration {
    public function up(): void
    {
        if (! Schema::hasTable('magic_slides_templates')) {
            return;
        }

        $hasBaseUsageCount = Schema::hasColumn('magic_slides_templates', 'base_usage_count');
        $hasActualUsageCount = Schema::hasColumn('magic_slides_templates', 'actual_usage_count');
        if ($hasBaseUsageCount && $hasActualUsageCount) {
            return;
        }

        Schema::table('magic_slides_templates', static function (Blueprint $table) use ($hasBaseUsageCount, $hasActualUsageCount): void {
            if (! $hasBaseUsageCount) {
                $table->unsignedInteger('base_usage_count')->default(0)->comment('基础使用次数')->after('sort');
            }
            if (! $hasActualUsageCount) {
                $table->unsignedInteger('actual_usage_count')->default(0)->comment('真实使用次数')->after('base_usage_count');
            }
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('magic_slides_templates')) {
            return;
        }

        $hasBaseUsageCount = Schema::hasColumn('magic_slides_templates', 'base_usage_count');
        $hasActualUsageCount = Schema::hasColumn('magic_slides_templates', 'actual_usage_count');
        if (! $hasBaseUsageCount && ! $hasActualUsageCount) {
            return;
        }

        Schema::table('magic_slides_templates', static function (Blueprint $table) use ($hasBaseUsageCount, $hasActualUsageCount): void {
            if ($hasActualUsageCount) {
                $table->dropColumn('actual_usage_count');
            }
            if ($hasBaseUsageCount) {
                $table->dropColumn('base_usage_count');
            }
        });
    }
};
