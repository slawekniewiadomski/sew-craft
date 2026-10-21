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
    'spec_version' => '0.7.0',

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
        'move_point' => [
            'description' => 'Move an existing point to new coordinates.',
            'params' => [
                'id' => 'entity_id',
                'x' => 'number',
                'y' => 'number',
            ],
            'inverse' => 'move_point',
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
        'set_construction' => [
            'description' => 'Mark an entity as construction geometry or convert it back to a cut edge.',
            'params' => [
                'id' => 'entity_id',
                'construction' => 'bool',
            ],
            'inverse' => 'set_construction',
        ],
        'delete_entity' => [
            'description' => 'Remove an entity and any constraints referencing it.',
            'params' => [
                'id' => 'entity_id',
            ],
        ],
        'add_constraint' => [
            'description' => 'Attach a geometric constraint to one or more entities. A distance without a value is a driven dimension.',
            'params' => [
                'type' => 'coincident|horizontal|vertical|point_on_line|distance|angle|equal',
                'entities' => 'entity_id[]',
                'value' => 'number?',
                'orientation' => 'aligned|horizontal|vertical?',
                'offset' => 'number?',
            ],
            'inverse' => 'remove_constraint',
        ],
        'update_constraint' => [
            'description' => 'Change a dimensional constraint value or its dimension presentation. Null clears a distance to driven.',
            'params' => [
                'id' => 'entity_id',
                'value' => 'number|null?',
                'orientation' => 'aligned|horizontal|vertical?',
                'offset' => 'number?',
            ],
            'inverse' => 'update_constraint',
        ],
        'remove_constraint' => [
            'description' => 'Detach a constraint from the sketch.',
            'params' => [
                'id' => 'entity_id',
            ],
            'inverse' => 'add_constraint',
        ],
        'add_seam_allowance' => [
            'description' => 'Attach a seam allowance (mm) to a cut line or curve edge.',
            'params' => [
                'edge' => 'entity_id',
                'width' => 'number?',
                'side' => 'left|right?',
            ],
            'inverse' => 'remove_seam_allowance',
        ],
        'remove_seam_allowance' => [
            'description' => 'Detach the seam allowance from an edge.',
            'params' => [
                'id' => 'entity_id',
            ],
            'inverse' => 'add_seam_allowance',
        ],
        'set_seam_allowance' => [
            'description' => 'Change the width or side of an attached seam allowance (mm).',
            'params' => [
                'id' => 'entity_id',
                'width' => 'number?',
                'side' => 'left|right?',
            ],
            'inverse' => 'set_seam_allowance',
        ],
        'solve' => [
            'description' => 'Rebuild the sketch by running the constraint solver.',
            'params' => [],
        ],
    ],

];
