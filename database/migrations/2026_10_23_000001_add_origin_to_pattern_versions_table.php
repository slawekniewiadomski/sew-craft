<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('pattern_versions', function (Blueprint $table) {
            // `manual` keeps every checkpoint; `autosave` rows are coalesced so
            // a background writer cannot flood history. Existing rows are manual.
            $table->string('origin', 16)->default('manual');
        });
    }

    public function down(): void
    {
        Schema::table('pattern_versions', function (Blueprint $table) {
            $table->dropColumn('origin');
        });
    }
};
