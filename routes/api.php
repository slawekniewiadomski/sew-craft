<?php

use App\Http\Controllers\Api\CommandSpecController;
use App\Http\Controllers\Api\ProjectController;
use Illuminate\Support\Facades\Route;

Route::get('/commands', CommandSpecController::class)->name('commands.index');

Route::apiResource('projects', ProjectController::class);
