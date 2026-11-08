<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CommandSpecController;
use App\Http\Controllers\Api\ProjectController;
use App\Http\Controllers\Api\ProjectPatternController;
use Illuminate\Support\Facades\Route;

Route::get('/commands', CommandSpecController::class)->name('commands.index');

Route::post('/register', [AuthController::class, 'register'])->middleware('throttle:6,1');
Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:6,1');

Route::middleware('auth:sanctum')->group(function () {
    Route::get('/user', [AuthController::class, 'user'])->name('user.show');
    Route::post('/logout', [AuthController::class, 'logout'])->name('user.logout');

    Route::get('/projects', [ProjectController::class, 'index'])->name('projects.index');
    Route::post('/projects', [ProjectController::class, 'store'])->name('projects.store');
    Route::get('/projects/{project}', [ProjectController::class, 'show'])->name('projects.show');
    Route::put('/projects/{project}', [ProjectController::class, 'update'])
        ->middleware('can:update,project')
        ->name('projects.update');
    Route::delete('/projects/{project}', [ProjectController::class, 'destroy'])
        ->middleware('can:delete,project')
        ->name('projects.destroy');

    Route::get('/projects/{project}/pattern', [ProjectPatternController::class, 'show'])
        ->name('projects.pattern.show');
    Route::put('/projects/{project}/pattern', [ProjectPatternController::class, 'update'])
        ->middleware('can:update,project')
        ->name('projects.pattern.update');
});
