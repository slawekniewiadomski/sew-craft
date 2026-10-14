<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Command Spec Version
    |--------------------------------------------------------------------------
    |
    | Bump when command shapes change. Exposed via GET /api/commands so agents
    | and the SPA can discover the contract at runtime.
    |
    */
    'spec_version' => '0.1.0',

    /*
    |--------------------------------------------------------------------------
    | Working Units
    |--------------------------------------------------------------------------
    |
    | All geometry is stored in millimetres as float values. Display units are a
    | presentation concern handled by the frontend.
    |
    */
    'units' => 'mm',

    /*
    |--------------------------------------------------------------------------
    | Commands
    |--------------------------------------------------------------------------
    |
    | Every mutation to a pattern goes through a command. Each entry documents
    | the params accepted and, where possible, the command that undoes it.
    | See docs/domain/command-spec.md for the full contract.
    |
    */
    'commands' => [
        'add_point' => [
            'description' => 'Create a free or construction point.',
            'params' => [
                'x' => 'number',
                'y' => 'number',
                'construction' => 'bool?',
            ],
            'inverse' => 'delete_entity',
        ],
        'add_line' => [
            'description' => 'Create a straight segment between two points.',
            'params' => [
                'start' => 'entity_id',
                'end' => 'entity_id',
                'construction' => 'bool?',
            ],
            'inverse' => 'delete_entity',
        ],
        'add_curve' => [
            'description' => 'Create a cubic Bézier curve through four control points.',
            'params' => [
                'p0' => 'entity_id',
                'p1' => 'entity_id',
                'p2' => 'entity_id',
                'p3' => 'entity_id',
                'construction' => 'bool?',
            ],
            'inverse' => 'delete_entity',
        ],
        'add_construction_line' => [
            'description' => 'Create a reference-only line that never becomes a cut edge.',
            'params' => [
                'start' => 'entity_id',
                'end' => 'entity_id',
            ],
            'inverse' => 'delete_entity',
        ],
        'delete_entity' => [
            'description' => 'Remove an entity and any constraints referencing it.',
            'params' => [
                'id' => 'entity_id',
            ],
        ],
        'add_constraint' => [
            'description' => 'Attach a geometric constraint to one or more entities.',
            'params' => [
                'type' => 'coincident|horizontal|vertical|point_on_line|distance|angle|equal',
                'entities' => 'entity_id[]',
                'value' => 'number?',
            ],
            'inverse' => 'remove_constraint',
        ],
        'remove_constraint' => [
            'description' => 'Detach a constraint from the sketch.',
            'params' => [
                'id' => 'entity_id',
            ],
        ],
        'add_seam_allowance' => [
            'description' => 'Set a seam allowance width (mm) on a piece edge.',
            'params' => [
                'piece' => 'entity_id',
                'edge' => 'entity_id',
                'width' => 'number',
            ],
        ],
        'solve' => [
            'description' => 'Rebuild the sketch by running the constraint solver.',
            'params' => [],
        ],
    ],

];
