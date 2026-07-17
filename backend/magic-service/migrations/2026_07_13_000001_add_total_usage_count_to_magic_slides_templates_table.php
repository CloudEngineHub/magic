<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */
use Hyperf\Database\Migrations\Migration;
use Hyperf\Database\Schema\Blueprint;
use Hyperf\Database\Schema\Schema;
use Hyperf\DbConnection\Db;

return new class extends Migration {
    public function up(): void
    {
        if (! Schema::hasTable('magic_slides_templates')) {
            return;
        }

        if (! Schema::hasColumn('magic_slides_templates', 'total_usage_count')) {
            Schema::table('magic_slides_templates', static function (Blueprint $table): void {
                $table->unsignedInteger('total_usage_count')
                    ->default(0)
                    ->comment('总使用次数')
                    ->after('actual_usage_count');
            });
        }

        Db::table('magic_slides_templates')->update([
            'total_usage_count' => Db::raw('base_usage_count + actual_usage_count'),
        ]);

        Schema::table('magic_slides_templates', static function (Blueprint $table): void {
            $table->index(['status', 'total_usage_count', 'id'], 'idx_status_total_usage_count');
            $table->index(['category_code', 'status', 'total_usage_count', 'id'], 'idx_category_status_total_usage_count');
        });
    }

    public function down(): void
    {
    }
};
