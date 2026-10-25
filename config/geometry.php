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
    'spec_version' => '0.13.0',

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
            'description' => 'Create a point inside a piece. Omitted role means cut; annotation points are sewing marks.',
            'params' => [
                'x' => 'number',
                'y' => 'number',
                'piece' => 'entity_id',
                'role' => 'construction|annotation?',
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
                'piece' => 'entity_id',
                'role' => 'construction|annotation?',
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
                'piece' => 'entity_id',
                'role' => 'construction|annotation?',
            ],
            'inverse' => 'delete_entity',
        ],
        'add_arc' => [
            'description' => 'Create a circular arc through three points: start, end and a point on the arc.',
            'params' => [
                'start' => 'entity_id',
                'end' => 'entity_id',
                'through' => 'entity_id',
                'piece' => 'entity_id',
                'role' => 'construction|annotation?',
            ],
            'inverse' => 'delete_entity',
        ],
        'add_circle' => [
            'description' => 'Create a circle from a centre point and a rim point; the radius is their distance.',
            'params' => [
                'center' => 'entity_id',
                'rim' => 'entity_id',
                'piece' => 'entity_id',
                'role' => 'construction|annotation?',
            ],
            'inverse' => 'delete_entity',
        ],
        'set_role' => [
            'description' => 'Assign an entity a cut, construction or annotation role. Text is always annotation and cannot be changed.',
            'params' => [
                'id' => 'entity_id',
                'role' => 'cut|construction|annotation',
            ],
            'inverse' => 'set_role',
        ],
        'delete_entity' => [
            'description' => 'Remove an entity and its dependent constraints and texts. A loop edge leaves a broken loop; the piece survives.',
            'params' => [
                'id' => 'entity_id',
            ],
        ],
        'add_constraint' => [
            'description' => 'Attach a geometric constraint to one or more entities. A distance without a value is a driven dimension; a distance with a reference follows another dimension. A distance anchor is a point or a straight line; a line anchor is always aligned and two line anchors must be parallel.',
            'params' => [
                'type' => 'coincident|horizontal|vertical|point_on_line|distance|angle|equal',
                'entities' => 'entity_id[]',
                'piece' => 'entity_id',
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
            'description' => 'Create an empty piece. Its cut loop is captured later with set_piece_loop.',
            'params' => [
                'name' => 'string?',
                'quantity' => 'int?',
            ],
            'inverse' => 'delete_piece',
        ],
        'set_piece_loop' => [
            'description' => 'Store an ordered closed chain of the piece’s own cut line/curve/arc edges, or clear it with an empty list. The allowance preset fills edges that have none yet.',
            'params' => [
                'piece' => 'entity_id',
                'edges' => 'entity_id[]',
                'allowance' => 'default|none|preset?',
            ],
        ],
        'move_piece' => [
            'description' => 'Translate every point the piece owns, including fixed points, as one undoable step.',
            'params' => [
                'id' => 'entity_id',
                'dx' => 'number',
                'dy' => 'number',
            ],
            'inverse' => 'move_piece',
        ],
        'add_text' => [
            'description' => 'Place a one-line annotation label at a point of its piece, with alignment, rotation, size and an optional leader point.',
            'params' => [
                'piece' => 'entity_id',
                'anchor' => 'entity_id',
                'content' => 'string',
                'alignment' => 'left|center|right?',
                'rotation' => 'number?',
                'fontSize' => 'number?',
                'leader' => 'entity_id?',
            ],
            'inverse' => 'delete_entity',
        ],
        'update_text' => [
            'description' => 'Edit a label’s content, anchor, alignment, rotation, size or leader. Null removes the leader.',
            'params' => [
                'id' => 'entity_id',
                'content' => 'string?',
                'anchor' => 'entity_id?',
                'alignment' => 'left|center|right?',
                'rotation' => 'number?',
                'fontSize' => 'number?',
                'leader' => 'entity_id|null?',
            ],
            'inverse' => 'update_text',
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
                'a' => 'cut_anchor { edge: entity_id, at: start|end|edge, loop: stitch|cut? }',
                'b' => 'cut_anchor { edge: entity_id, at: start|end|edge, loop: stitch|cut? }',
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
