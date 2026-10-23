<?php

use App\Http\Controllers\Api\CommandSpecController;
use App\Http\Controllers\Api\ProjectController;
use App\Http\Controllers\Api\ProjectPatternController;
use Illuminate\Support\Facades\Route;

Route::get('/commands', CommandSpecController::class)->name('commands.index');

Route::get('/projects/{project}/pattern', [ProjectPatternController::class, 'show'])
    ->name('projects.pattern.show');
Route::put('/projects/{project}/pattern', [ProjectPatternController::class, 'update'])
    ->name('projects.pattern.update');

Route::apiResource('projects', ProjectController::class);
