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
        if (Schema::hasTable('magic_slides_template_tag_relations')) {
            return;
        }

        Schema::create('magic_slides_template_tag_relations', static function (Blueprint $table): void {
            $table->bigIncrements('id')->comment('主键 ID');
            $table->string('organization_code', 64)->comment('关系所属组织编码');
            $table->unsignedBigInteger('template_id')->comment('幻灯片模板 ID');
            $table->unsignedBigInteger('tag_id')->comment('标签 ID');
            $table->string('created_uid', 64)->nullable()->comment('创建人用户 ID');
            $table->timestamps();

            $table->unique(['template_id', 'tag_id'], 'uk_template_tag');
            $table->index(['tag_id', 'template_id'], 'idx_tag_template');
            $table->index(['template_id'], 'idx_template');
            $table->index(['organization_code', 'tag_id', 'template_id'], 'idx_org_tag_template');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('magic_slides_template_tag_relations');
    }
};
