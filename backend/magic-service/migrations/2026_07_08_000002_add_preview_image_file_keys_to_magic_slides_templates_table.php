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
            || Schema::hasColumn('magic_slides_templates', 'preview_image_file_keys')) {
            return;
        }

        Schema::table('magic_slides_templates', static function (Blueprint $table) {
            $table->json('preview_image_file_keys')->nullable()->comment('模板预览多图文件 key 列表，公有桶')->after('collage_file_key');
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('magic_slides_templates')
            || ! Schema::hasColumn('magic_slides_templates', 'preview_image_file_keys')) {
            return;
        }

        Schema::table('magic_slides_templates', static function (Blueprint $table) {
            $table->dropColumn('preview_image_file_keys');
        });
    }
};
