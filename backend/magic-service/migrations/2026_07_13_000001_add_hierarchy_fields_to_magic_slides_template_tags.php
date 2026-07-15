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
            if (! Schema::hasColumn('magic_slides_template_tags', 'description_i18n')) {
                $table->json('description_i18n')->nullable()->after('name_i18n')->comment('标签描述，多语言');
            }

            $table->index(['parent_id', 'status', 'sort'], 'idx_parent_status_sort');
            $table->index(['node_type', 'status', 'sort'], 'idx_node_status_sort');
        });
    }

    public function down(): void
    {
    }
};
