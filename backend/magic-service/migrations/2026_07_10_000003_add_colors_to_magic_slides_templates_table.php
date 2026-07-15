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
        if (! Schema::hasTable('magic_slides_templates')
            || Schema::hasColumn('magic_slides_templates', 'colors')) {
            return;
        }

        Schema::table('magic_slides_templates', static function (Blueprint $table): void {
            $table->json('colors')->nullable()->comment('模板缩略图提取色值，数组第一项为主色')->after('thumbnail_file_key');
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('magic_slides_templates')
            || ! Schema::hasColumn('magic_slides_templates', 'colors')) {
            return;
        }

        Schema::table('magic_slides_templates', static function (Blueprint $table): void {
            $table->dropColumn('colors');
        });
    }
};
