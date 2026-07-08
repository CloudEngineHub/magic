<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */
use Hyperf\Database\Migrations\Migration;
use Hyperf\Database\Schema\Blueprint;
use Hyperf\Database\Schema\Schema;

class AddMultiImageFieldsToMagicDesignImageGenerationTasksTable extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('magic_design_image_generation_tasks', 'generate_num')) {
            Schema::table('magic_design_image_generation_tasks', function (Blueprint $table) {
                $table->integer('generate_num')->default(1)->after('image_generation_config')->comment('请求生成图片数量');
            });
        }

        if (! Schema::hasColumn('magic_design_image_generation_tasks', 'output_images')) {
            Schema::table('magic_design_image_generation_tasks', function (Blueprint $table) {
                $table->json('output_images')->nullable()->after('generate_num')->comment('多图输出结果列表');
            });
        }
    }

    public function down(): void
    {
    }
}
