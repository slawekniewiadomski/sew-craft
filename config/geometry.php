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
    'spec_version' => '0.12.0',

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
        'add_arc' => [
            'description' => 'Create a circular arc through three points: start, end and a point on the arc.',
            'params' => [
                'start' => 'entity_id',
                'end' => 'entity_id',
                'through' => 'entity_id',
                'construction' => 'bool?',
            ],
            'inverse' => 'delete_entity',
        ],
        'add_circle' => [
            'description' => 'Create a circle from a centre point and a rim point; the radius is their distance.',
            'params' => [
                'center' => 'entity_id',
                'rim' => 'entity_id',
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
            'description' => 'Remove an entity, the constraints referencing it and any piece that uses it.',
            'params' => [
                'id' => 'entity_id',
            ],
        ],
        'add_constraint' => [
            'description' => 'Attach a geometric constraint to one or more entities. A distance without a value is a driven dimension; a distance with a reference follows another dimension. A distance anchor is a point or a straight line; a line anchor is always aligned and two line anchors must be parallel.',
            'params' => [
                'type' => 'coincident|horizontal|vertical|point_on_line|distance|angle|equal',
                'entities' => 'entity_id[]',
                'value' => 'number?',
                'reference' => 'entity_id?',
                'orientation' => 'aligned|horizontal|vertical?',
                'offset' => 'number?',
            ],
            'inverse' => 'remove_constraint',
        ],
        'update_constraint' => [
            'description' => 'Change a dimensional constraint value or its dimension presentation. Null clears a distance to driven. A cut dimension accepts only orientation and offset.',
            'params' => [
                'id' => 'entity_id',
                'value' => 'number|null?',
                'reference' => 'entity_id|null?',
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
            'description' => 'Deprecated: attach a legacy seam allowance (mm) to a cut edge outside any piece. Removed in 0.3.',
            'params' => [
                'edge' => 'entity_id',
                'width' => 'number?',
                'side' => 'left|right?',
            ],
            'inverse' => 'remove_seam_allowance',
        ],
        'remove_seam_allowance' => [
            'description' => 'Deprecated: detach a legacy seam allowance from an edge. Removed in 0.3.',
            'params' => [
                'id' => 'entity_id',
            ],
            'inverse' => 'add_seam_allowance',
        ],
        'set_seam_allowance' => [
            'description' => 'Deprecated: change the width or side of a legacy seam allowance (mm). Removed in 0.3.',
            'params' => [
                'id' => 'entity_id',
                'width' => 'number?',
                'side' => 'left|right?',
            ],
            'inverse' => 'set_seam_allowance',
        ],
        'add_corner_round' => [
            'description' => 'Round a corner between two lines, trimming both to a tangent arc while keeping the sharp corner as construction geometry.',
            'params' => [
                'first' => 'entity_id',
                'second' => 'entity_id',
                'radius' => 'number',
            ],
            'inverse' => 'remove_corner_round',
        ],
        'set_corner_round_radius' => [
            'description' => 'Change the radius of a corner round and regenerate its tangent points and arc.',
            'params' => [
                'id' => 'entity_id',
                'radius' => 'number',
            ],
            'inverse' => 'set_corner_round_radius',
        ],
        'remove_corner_round' => [
            'description' => 'Restore a rounded corner: delete the arc and derived points and return both lines to the sharp corner.',
            'params' => [
                'id' => 'entity_id',
            ],
            'inverse' => 'add_corner_round',
        ],
        'create_piece' => [
            'description' => 'Create a piece from one closed loop of cut edges. The edge order is the loop order and sets the outward direction.',
            'params' => [
                'edges' => 'entity_id[]',
                'name' => 'string?',
                'quantity' => 'int?',
                'allowance' => 'default|none|preset?',
            ],
            'inverse' => 'delete_piece',
        ],
        'update_piece' => [
            'description' => 'Rename a piece or change its cut quantity. Null clears either.',
            'params' => [
                'id' => 'entity_id',
                'name' => 'string|null?',
                'quantity' => 'int|null?',
            ],
            'inverse' => 'update_piece',
        ],
        'delete_piece' => [
            'description' => 'Remove a piece together with its cut dimensions.',
            'params' => [
                'id' => 'entity_id',
            ],
        ],
        'set_piece_allowance' => [
            'description' => 'Set, change or remove the allowance of one piece loop edge. Width is the finished width in mm; double folds cut twice it.',
            'params' => [
                'piece' => 'entity_id',
                'edge' => 'entity_id',
                'width' => 'number?',
                'kind' => 'seam|single|double?',
                'remove' => 'bool?',
            ],
            'inverse' => 'set_piece_allowance',
        ],
        'set_default_allowance' => [
            'description' => 'Set, change or clear the allowance copied onto newly created pieces. Width is the finished width in mm; remove clears it.',
            'params' => [
                'width' => 'number?',
                'kind' => 'seam|single|double?',
                'remove' => 'bool?',
            ],
            'inverse' => 'set_default_allowance',
        ],
        'add_derived_dimension' => [
            'description' => 'Add a read-only cut dimension between two corners or straight edges of one piece. Its value follows the cut loop and adds no solver equation.',
            'params' => [
                'piece' => 'entity_id',
                'a' => 'cut_anchor { edge: entity_id, at: start|end|edge }',
                'b' => 'cut_anchor { edge: entity_id, at: start|end|edge }',
                'orientation' => 'aligned|horizontal|vertical?',
                'offset' => 'number?',
            ],
            'inverse' => 'remove_constraint',
        ],
        'solve' => [
            'description' => 'Rebuild the sketch by running the constraint solver.',
            'params' => [],
        ],
    ],

];
