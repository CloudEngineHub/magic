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
        if (! Schema::hasTable('magic_super_agent_micro_apps')) {
            return;
        }

        Schema::table('magic_super_agent_micro_apps', function (Blueprint $table): void {
            $table->string('creator_id', 64)->comment('应用创建人 ID');
            $table->string('cover_file_key', 512)->nullable()->comment('应用封面文件 key');
            $table->index('creator_id', 'idx_creator_id');
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('magic_super_agent_micro_apps')) {
            return;
        }

        Schema::table('magic_super_agent_micro_apps', function (Blueprint $table): void {
            $table->dropIndex('idx_creator_id');
            $table->dropColumn(['creator_id', 'cover_file_key']);
        });
    }
};
