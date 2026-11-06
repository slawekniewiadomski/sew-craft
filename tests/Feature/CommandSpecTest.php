<?php

it('exposes the command spec', function () {
    $this->getJson('/api/commands')
        ->assertOk()
        ->assertJsonPath('version', '0.20.0')
        ->assertJsonStructure([
            'version',
            'commands' => [
                'add_point',
                'add_constraint',
                'solve',
            ],
        ]);
});

it('exposes dimension presentation and update params', function () {
    $this->getJson('/api/commands')
        ->assertOk()
        ->assertJsonPath('commands.add_constraint.params.orientation', 'aligned|horizontal|vertical?')
        ->assertJsonPath('commands.add_constraint.params.offset', 'number?')
        ->assertJsonPath('commands.add_constraint.params.piece', 'entity_id')
        ->assertJsonPath('commands.add_constraint.params.value', 'number|expression?')
        ->assertJsonPath('commands.update_constraint.params.id', 'entity_id')
        ->assertJsonPath('commands.update_constraint.params.value', 'number|expression|null?')
        ->assertJsonPath('commands.update_constraint.inverse', 'update_constraint')
        ->assertJsonPath(
            'commands.add_constraint.params.type',
            'coincident|horizontal|vertical|point_on_line|distance|angle|equal|midpoint',
        );
});

it('exposes the corner round commands', function () {
    $this->getJson('/api/commands')
        ->assertOk()
        ->assertJsonPath('commands.add_corner_round.params.first', 'entity_id')
        ->assertJsonPath('commands.add_corner_round.params.second', 'entity_id')
        ->assertJsonPath('commands.add_corner_round.params.radius', 'number|expression')
        ->assertJsonPath('commands.add_corner_round.inverse', 'remove_corner_round')
        ->assertJsonPath('commands.set_corner_round_radius.params.id', 'entity_id')
        ->assertJsonPath('commands.set_corner_round_radius.params.radius', 'number|expression')
        ->assertJsonPath('commands.set_corner_round_radius.inverse', 'set_corner_round_radius')
        ->assertJsonPath('commands.remove_corner_round.params.id', 'entity_id')
        ->assertJsonPath('commands.remove_corner_round.inverse', 'add_corner_round');
});

it('exposes the variable commands', function () {
    $this->getJson('/api/commands')
        ->assertOk()
        ->assertJsonPath('commands.set_variable.params.slug', 'string?')
        ->assertJsonPath('commands.set_variable.params.unit', 'mm|cm?')
        ->assertJsonPath('commands.set_variable.params.value', 'number|expression?')
        ->assertJsonPath('commands.set_variable.params.kind', 'value|measurement?')
        ->assertJsonPath('commands.set_variable.params.sources', 'entity_id[]?')
        ->assertJsonPath('commands.set_variable.inverse', 'remove_variable')
        ->assertJsonPath('commands.update_variable.params.slug', 'string')
        ->assertJsonPath('commands.update_variable.params.value', 'number|expression?')
        ->assertJsonPath('commands.update_variable.params.sources', 'entity_id[]?')
        ->assertJsonPath('commands.update_variable.inverse', 'update_variable')
        ->assertJsonPath('commands.remove_variable.params.slug', 'string')
        ->assertJsonPath('commands.remove_variable.inverse', 'set_variable');
});

it('exposes the split line command', function () {
    $this->getJson('/api/commands')
        ->assertOk()
        ->assertJsonPath('commands.split_line.params.line', 'entity_id')
        ->assertJsonPath('commands.split_line.params.point', 'entity_id')
        ->assertJsonPath('commands.split_line.inverse', null);
});

it('exposes the arc command', function () {
    $this->getJson('/api/commands')
        ->assertOk()
        ->assertJsonPath('commands.add_arc.params.start', 'entity_id')
        ->assertJsonPath('commands.add_arc.params.end', 'entity_id')
        ->assertJsonPath('commands.add_arc.params.through', 'entity_id')
        ->assertJsonPath('commands.add_arc.params.piece', 'entity_id')
        ->assertJsonPath('commands.add_arc.params.role', 'construction|annotation?')
        ->assertJsonPath('commands.add_arc.inverse', 'delete_entity');
});

it('exposes the circle command', function () {
    $this->getJson('/api/commands')
        ->assertOk()
        ->assertJsonPath('commands.add_circle.params.center', 'entity_id')
        ->assertJsonPath('commands.add_circle.params.rim', 'entity_id')
        ->assertJsonPath('commands.add_circle.params.piece', 'entity_id')
        ->assertJsonPath('commands.add_circle.params.role', 'construction|annotation?')
        ->assertJsonPath('commands.add_circle.inverse', 'delete_entity');
});

it('exposes the piece commands', function () {
    $this->getJson('/api/commands')
        ->assertOk()
        ->assertJsonPath('commands.create_piece.params.name', 'string?')
        ->assertJsonPath('commands.create_piece.params.quantity', 'int?')
        ->assertJsonPath('commands.create_piece.params.color', '#rrggbb?')
        ->assertJsonPath('commands.create_piece.params.defaults', 'piece_defaults?')
        ->assertJsonPath('commands.create_piece.inverse', 'delete_piece')
        ->assertJsonPath('commands.set_piece_loop.params.piece', 'entity_id')
        ->assertJsonPath('commands.set_piece_loop.params.edges', 'entity_id[]')
        ->assertJsonPath('commands.set_piece_loop.params.allowance', 'default|none|preset?')
        ->assertJsonPath('commands.set_role.params.role', 'cut|construction|annotation')
        ->assertJsonPath('commands.set_role.inverse', 'set_role')
        ->assertJsonPath('commands.add_text.params.content', 'string')
        ->assertJsonPath('commands.add_text.params.leader', 'entity_id?')
        ->assertJsonPath('commands.update_text.params.leader', 'entity_id|null?')
        ->assertJsonPath('commands.update_piece.params.name', 'string|null?')
        ->assertJsonPath('commands.update_piece.params.quantity', 'int|null?')
        ->assertJsonPath('commands.update_piece.params.notes', 'string|null?')
        ->assertJsonPath('commands.update_piece.params.fabric', 'string|null?')
        ->assertJsonPath('commands.update_piece.params.color', '#rrggbb|null?')
        ->assertJsonPath('commands.update_piece.inverse', 'update_piece')
        ->assertJsonPath('commands.delete_piece.params.id', 'entity_id')
        ->assertJsonPath('commands.set_piece_allowance.params.piece', 'entity_id')
        ->assertJsonPath('commands.set_piece_allowance.params.edge', 'entity_id')
        ->assertJsonPath('commands.set_piece_allowance.params.width', 'number|expression?')
        ->assertJsonPath('commands.set_piece_allowance.params.kind', 'seam|single|double?')
        ->assertJsonPath('commands.set_piece_allowance.params.remove', 'bool?')
        ->assertJsonPath('commands.set_piece_allowance.inverse', 'set_piece_allowance')
        ->assertJsonPath('commands.set_piece_corner_allowance.params.piece', 'entity_id')
        ->assertJsonPath('commands.set_piece_corner_allowance.params.round', 'entity_id')
        ->assertJsonPath('commands.set_piece_corner_allowance.params.cutWidth', 'number?')
        ->assertJsonPath('commands.set_piece_corner_allowance.params.remove', 'bool?')
        ->assertJsonPath(
            'commands.set_piece_corner_allowance.inverse',
            'set_piece_corner_allowance',
        );
});

it('exposes the assembly, instance and tab commands', function () {
    $this->getJson('/api/commands')
        ->assertOk()
        ->assertJsonPath('commands.set_piece_default_allowance.params.mode', 'inherit|none|preset')
        ->assertJsonPath('commands.set_piece_default_allowance.inverse', 'set_piece_default_allowance')
        ->assertJsonPath('commands.create_assembly.params.name', 'string?')
        ->assertJsonPath('commands.create_assembly.inverse', 'delete_assembly')
        ->assertJsonPath('commands.update_assembly.params.name', 'string')
        ->assertJsonPath('commands.update_assembly.inverse', 'update_assembly')
        ->assertJsonPath('commands.delete_assembly.params.id', 'entity_id')
        ->assertJsonPath('commands.add_instance.params.piece', 'entity_id')
        ->assertJsonPath('commands.add_instance.params.x', 'number')
        ->assertJsonPath('commands.add_instance.params.rotation', 'number?')
        ->assertJsonPath('commands.add_instance.params.mirrored', 'bool?')
        ->assertJsonPath('commands.add_instance.inverse', 'remove_instance')
        ->assertJsonPath('commands.remove_instance.inverse', 'add_instance')
        ->assertJsonPath('commands.update_instance.params.instance', 'entity_id')
        ->assertJsonPath('commands.update_instance.inverse', 'update_instance')
        ->assertJsonPath('commands.reorder_tabs.params.tabs', 'tab_ref[]')
        ->assertJsonPath('commands.reorder_tabs.inverse', 'reorder_tabs');
});

it('retires move_piece', function () {
    $this->getJson('/api/commands')
        ->assertOk()
        ->assertJsonMissingPath('commands.move_piece');
});

it('exposes the default allowance command', function () {
    $this->getJson('/api/commands')
        ->assertOk()
        ->assertJsonPath('commands.set_default_allowance.params.width', 'number|expression?')
        ->assertJsonPath('commands.set_default_allowance.params.kind', 'seam|single|double?')
        ->assertJsonPath('commands.set_default_allowance.params.remove', 'bool?')
        ->assertJsonPath('commands.set_default_allowance.inverse', 'set_default_allowance');
});

it('exposes the derived cut dimension command', function () {
    $this->getJson('/api/commands')
        ->assertOk()
        ->assertJsonPath('commands.add_derived_dimension.params.piece', 'entity_id')
        ->assertJsonPath('commands.add_derived_dimension.params.a', 'cut_anchor { edge: entity_id, at: start|end|edge, loop: stitch|cut? }')
        ->assertJsonPath('commands.add_derived_dimension.params.b', 'cut_anchor { edge: entity_id, at: start|end|edge, loop: stitch|cut? }')
        ->assertJsonPath('commands.add_derived_dimension.params.orientation', 'aligned|horizontal|vertical?')
        ->assertJsonPath('commands.add_derived_dimension.params.offset', 'number?')
        ->assertJsonPath('commands.add_derived_dimension.inverse', 'remove_constraint');
});

it('exposes the piece mark commands', function () {
    $this->getJson('/api/commands')
        ->assertOk()
        ->assertJsonPath('commands.add_notch.params.edge', 'entity_id')
        ->assertJsonPath('commands.add_notch.params.point', 'entity_id')
        ->assertJsonPath('commands.add_notch.params.depth', 'number?')
        ->assertJsonPath('commands.add_notch.inverse', 'delete_entity')
        ->assertJsonPath('commands.update_notch.params.depth', 'number|null')
        ->assertJsonPath('commands.update_notch.inverse', 'update_notch')
        ->assertJsonPath('commands.add_centre_line.params.start', 'entity_id')
        ->assertJsonPath('commands.add_centre_line.inverse', 'delete_entity')
        ->assertJsonPath('commands.update_centre_line.params.end', 'entity_id?')
        ->assertJsonPath('commands.update_centre_line.inverse', 'update_centre_line');
});
