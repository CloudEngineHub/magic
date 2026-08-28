<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */
use Hyperf\Database\Migrations\Migration;
use Hyperf\Database\Schema\Blueprint;
use Hyperf\Database\Schema\Schema;

return new class extends Migration {
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (Schema::hasColumn('magic_contact_departments', 'source_platform_id')) {
            return;
        }

        Schema::table('magic_contact_departments', static function (Blueprint $table) {
            $table->string('source_platform_id', 64)
                ->nullable()
                ->default(null)
                ->comment('来源平台部门 ID')
                ->after('department_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (! Schema::hasColumn('magic_contact_departments', 'source_platform_id')) {
            return;
        }

        Schema::table('magic_contact_departments', static function (Blueprint $table) {
            $table->dropColumn('source_platform_id');
        });
    }
};
