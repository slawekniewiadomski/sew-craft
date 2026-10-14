<?php

use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return response()->json([
        'app' => 'SewCraft',
        'version' => '0.1.0',
        'api' => '/api',
    ]);
});
