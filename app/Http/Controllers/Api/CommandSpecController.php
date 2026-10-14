<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;

class CommandSpecController extends Controller
{
    public function __invoke(): JsonResponse
    {
        return response()->json([
            'version' => config('geometry.spec_version'),
            'commands' => config('geometry.commands'),
        ]);
    }
}
