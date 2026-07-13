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
        if (! Schema::hasTable('magic_slides_template_tags')) {
            return;
        }

        Schema::table('magic_slides_template_tags', static function (Blueprint $table): void {
            if (! Schema::hasColumn('magic_slides_template_tags', 'parent_id')) {
                $table->unsignedBigInteger('parent_id')->default(0)->after('organization_code')->comment('父级标签 ID：标签组为0，标签为所属标签组 ID');
            }
            if (! Schema::hasColumn('magic_slides_template_tags', 'node_type')) {
                $table->string('node_type', 16)->default('tag')->after('parent_id')->comment('节点类型：group=标签组，tag=标签');
            }
            if (! Schema::hasColumn('magic_slides_template_tags', 'usage_type')) {
                $table->string('usage_type', 32)->nullable()->default('filter')->after('node_type')->comment('标签用途：filter/detail/operational，标签组为空');
            }
            if (! Schema::hasColumn('magic_slides_template_tags', 'description_i18n')) {
                $table->json('description_i18n')->nullable()->after('name_i18n')->comment('标签描述，多语言');
            }
            if (! Schema::hasColumn('magic_slides_template_tags', 'aliases_i18n')) {
                $table->json('aliases_i18n')->nullable()->after('description_i18n')->comment('标签别名，多语言，用于搜索和归一');
            }
            if (! Schema::hasColumn('magic_slides_template_tags', 'is_visible')) {
                $table->tinyInteger('is_visible')->default(1)->after('aliases_i18n')->comment('是否前端展示：0=隐藏，1=展示');
            }

            $table->index(['parent_id', 'status', 'sort'], 'idx_parent_status_sort');
            $table->index(['node_type', 'status', 'sort'], 'idx_node_status_sort');
            $table->index(['usage_type', 'status', 'sort'], 'idx_usage_status_sort');
        });
    }

    public function down(): void
    {
    }
};
