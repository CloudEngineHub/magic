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
        if (! Schema::hasTable('magic_super_magic_agent_versions')
            || Schema::hasColumn('magic_super_magic_agent_versions', 'category_id')) {
            return;
        }

        Schema::table('magic_super_magic_agent_versions', function (Blueprint $table) {
            $table->bigInteger('category_id')->nullable()->after('publish_target_value')->comment('市场分类 ID');
        });
    }

    public function down(): void
    {
    }
};
