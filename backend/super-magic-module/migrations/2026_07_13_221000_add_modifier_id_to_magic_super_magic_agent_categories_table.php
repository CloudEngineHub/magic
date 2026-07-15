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
        if (! Schema::hasTable('magic_super_magic_agent_categories')) {
            return;
        }

        Schema::table('magic_super_magic_agent_categories', static function (Blueprint $table) {
            if (! Schema::hasColumn('magic_super_magic_agent_categories', 'status')) {
                $table->tinyInteger('status')
                    ->default(1)
                    ->after('sort_order')
                    ->comment('状态：1-显示，0-隐藏');
            }

            if (! Schema::hasColumn('magic_super_magic_agent_categories', 'modifier_id')) {
                $table->string('modifier_id', 64)
                    ->nullable()
                    ->after('creator_id')
                    ->comment('最后更新者用户 ID');
            }
        });
    }

    public function down(): void
    {
    }
};
