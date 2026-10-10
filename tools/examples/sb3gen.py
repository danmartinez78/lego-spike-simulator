"""Tiny builder for SPIKE Prime word-block programs (.llsp3).

Blocks are described as nested Python tuples/dicts and turned into the
Scratch 3 project.json layout that the LEGO SPIKE app (and the simulator)
reads.
"""

import io
import json
import zipfile
import itertools

_ids = itertools.count(1)

COSTUME = {
    'assetId': 'd41d8cd98f00b204e9800998ecf8427e',
    'md5ext': 'd41d8cd98f00b204e9800998ecf8427e.svg',
    'dataFormat': 'svg',
    'rotationCenterX': 0,
    'rotationCenterY': 0,
}


def new_id(prefix='b'):
    return f'{prefix}{next(_ids):04d}'


class Program:
    def __init__(self, name):
        self.name = name
        self.blocks = {}
        self.variables = {}
        self.comments = {}
        self.procs = {}
        self.y = 0

    # ---- values -------------------------------------------------------
    def var(self, name):
        if name not in self.variables:
            self.variables[name] = new_id('v')
        return self.variables[name]

    def _value(self, parent, value, kind='number'):
        """Return an input array for a literal, menu, or reporter block."""
        if isinstance(value, Block):
            rid = self._emit(value, parent)
            if value.boolean:
                return [2, rid]
            empty = [4, '0'] if kind == 'number' else [10, '']
            return [3, rid, empty]
        if isinstance(value, VarRef):
            vid = self.var(value.name)
            return [3, [12, value.name, vid], [10, '']]
        if isinstance(value, Menu):
            sid = new_id('s')
            self.blocks[sid] = {
                'opcode': value.opcode,
                'next': None,
                'parent': parent,
                'inputs': {},
                'fields': {value.field: [value.value, None]},
                'shadow': True,
                'topLevel': False,
            }
            return [1, sid]
        if kind == 'text':
            return [1, [10, str(value)]]
        return [1, [4, str(value)]]

    def _emit(self, block, parent):
        bid = new_id()
        entry = {
            'opcode': block.opcode,
            'next': None,
            'parent': parent,
            'inputs': {},
            'fields': {},
            'shadow': False,
            'topLevel': parent is None,
        }
        self.blocks[bid] = entry
        for key, (value, kind) in block.inputs.items():
            entry['inputs'][key] = self._value(bid, value, kind)
        for key, value in block.fields.items():
            if isinstance(value, VarRef):
                entry['fields'][key] = [value.name, self.var(value.name)]
            else:
                entry['fields'][key] = [value, None]
        for key, stack in block.substacks.items():
            first = self._stack(stack, bid)
            if first:
                entry['inputs'][key] = [2, first]
        if block.mutation:
            entry['mutation'] = block.mutation
        if block.extra_inputs:
            for key, value in block.extra_inputs.items():
                entry['inputs'][key] = self._value(bid, value, 'number')
        return bid

    def _stack(self, blocks, parent):
        first = None
        prev = None
        for block in blocks:
            bid = self._emit(block, prev if prev else parent)
            if prev:
                self.blocks[prev]['next'] = bid
            else:
                first = bid
            prev = bid
        return first

    # ---- top level ----------------------------------------------------
    def script(self, hat, body, x=0, comment=None):
        hid = self._emit(hat, None)
        self.blocks[hid]['x'] = x
        self.blocks[hid]['y'] = self.y
        first = self._stack(body, hid)
        if first:
            self.blocks[hid]['next'] = first
            self.blocks[first]['parent'] = hid
        if comment:
            self.note(comment, x + 520, self.y)
        self.y += 120 + 56 * count_blocks(body)
        return hid

    def note(self, text, x, y, width=360, height=None):
        cid = new_id('c')
        lines = max(4, len(text) // 34 + text.count('\n') + 2)
        self.comments[cid] = {
            'blockId': None,
            'x': x,
            'y': y,
            'width': width,
            'height': height or lines * 24,
            'minimized': False,
            'text': text,
        }

    def define(self, name, params, body, comment=None, x=0):
        """A My Block. name is one word; params are argument names."""
        ids = [new_id('a') for _ in params]
        proccode = ' '.join([name] + ['%s' for _ in params])
        self.procs[name] = (proccode, ids, params)
        did = new_id()
        pid = new_id('p')
        self.blocks[did] = {
            'opcode': 'procedures_definition',
            'next': None,
            'parent': None,
            'inputs': {'custom_block': [1, pid]},
            'fields': {},
            'shadow': False,
            'topLevel': True,
            'x': x,
            'y': self.y,
        }
        proto_inputs = {}
        for aid, pname in zip(ids, params):
            rid = new_id('r')
            self.blocks[rid] = {
                'opcode': 'argument_reporter_string_number',
                'next': None,
                'parent': pid,
                'inputs': {},
                'fields': {'VALUE': [pname, None]},
                'shadow': True,
                'topLevel': False,
            }
            proto_inputs[aid] = [1, rid]
        self.blocks[pid] = {
            'opcode': 'procedures_prototype',
            'next': None,
            'parent': did,
            'inputs': proto_inputs,
            'fields': {},
            'shadow': True,
            'topLevel': False,
            'mutation': {
                'tagName': 'mutation',
                'children': [],
                'proccode': proccode,
                'argumentids': json.dumps(ids),
                'argumentnames': json.dumps(params),
                'argumentdefaults': json.dumps(['' for _ in params]),
                'warp': 'false',
            },
        }
        first = self._stack(body, did)
        if first:
            self.blocks[did]['next'] = first
        if comment:
            self.note(comment, x + 560, self.y)
        self.y += 140 + 56 * count_blocks(body)

    def call(self, name, *args):
        proccode, ids, _ = self.procs[name]
        b = Block('procedures_call')
        b.mutation = {
            'tagName': 'mutation',
            'children': [],
            'proccode': proccode,
            'argumentids': json.dumps(ids),
            'warp': 'false',
        }
        b.extra_inputs = dict(zip(ids, args))
        return b

    # ---- output -------------------------------------------------------
    def project(self):
        stage = {
            'isStage': True,
            'name': 'Stage',
            'variables': {},
            'lists': {},
            'broadcasts': {},
            'blocks': {},
            'comments': {},
            'currentCostume': 0,
            'costumes': [dict(COSTUME, name='backdrop1')],
            'sounds': [],
            'volume': 100,
        }
        sprite = {
            'isStage': False,
            'name': 'Robot',
            'variables': {vid: [name, 0] for name, vid in self.variables.items()},
            'lists': {},
            'broadcasts': {},
            'blocks': self.blocks,
            'comments': self.comments,
            'currentCostume': 0,
            'costumes': [dict(COSTUME, name='costume1')],
            'sounds': [],
            'volume': 100,
            'visible': True,
            'x': 0,
            'y': 0,
            'size': 100,
            'direction': 90,
            'draggable': False,
            'rotationStyle': 'all around',
        }
        return {
            'targets': [stage, sprite],
            'monitors': [],
            'extensions': [
                'flipperevents',
                'flippermove',
                'flippersensors',
                'flippermoremove',
                'flippermotor',
                'flipperoperator',
            ],
            'meta': {'semver': '3.0.0', 'vm': '0.2.0', 'agent': 'example-generator'},
        }

    def llsp3(self):
        sb3 = io.BytesIO()
        with zipfile.ZipFile(sb3, 'w', zipfile.ZIP_DEFLATED) as z:
            z.writestr('project.json', json.dumps(self.project()))
            z.writestr(COSTUME['md5ext'], '')
        manifest = {
            'type': 'word-blocks',
            'autoDelete': False,
            'created': '2026-10-10T00:00:00.000Z',
            'id': 'example',
            'lastsaved': '2026-10-10T00:00:00.000Z',
            'size': len(sb3.getvalue()),
            'name': self.name,
            'slotIndex': 0,
            'workspaceX': 0,
            'workspaceY': 0,
            'zoomLevel': 0.6,
            'showAllBlocks': False,
            'version': 38,
            'hardware': {},
            'extensions': self.project()['extensions'],
            'state': {'playMode': 'download', 'canvasDrawerOpen': False, 'hasMonitors': False},
            'extraFiles': [],
            'lastConnectedHubType': 'flipper',
        }
        out = io.BytesIO()
        with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
            z.writestr('manifest.json', json.dumps(manifest))
            z.writestr('scratch.sb3', sb3.getvalue())
        return out.getvalue()


class Block:
    def __init__(self, opcode, inputs=None, fields=None, substacks=None, boolean=False):
        self.opcode = opcode
        self.inputs = {}
        for k, v in (inputs or {}).items():
            self.inputs[k] = v if isinstance(v, tuple) else (v, 'number')
        self.fields = fields or {}
        self.substacks = substacks or {}
        self.boolean = boolean
        self.mutation = None
        self.extra_inputs = None


class Menu:
    def __init__(self, opcode, field, value):
        self.opcode = opcode
        self.field = field
        self.value = value


class VarRef:
    def __init__(self, name):
        self.name = name


def count_blocks(stack):
    n = 0
    for b in stack:
        n += 1
        for s in b.substacks.values():
            n += count_blocks(s)
    return n


# ---- SPIKE word blocks used by the examples ----------------------------

def when_program_starts():
    return Block('flipperevents_whenProgramStarts')


def set_movement_motors(pair='CD'):
    return Block(
        'flippermove_setMovementPair',
        {'PAIR': Menu('flippermove_movement-port-selector', 'field_flippermove_movement-port-selector', pair)},
    )


def set_movement_speed(speed):
    return Block('flippermove_movementSpeed', {'SPEED': speed})


def move(direction, value, unit='cm'):
    return Block(
        'flippermove_move',
        {
            'DIRECTION': Menu('flippermove_custom-icon-direction', 'field_flippermove_custom-icon-direction', direction),
            'VALUE': value,
        },
        {'UNIT': unit},
    )


def steer(steering, value, unit='degrees'):
    return Block(
        'flippermove_steer',
        {
            'STEERING': Menu('flippermove_rotation-wheel', 'field_flippermove_rotation-wheel', str(steering)),
            'VALUE': value,
        },
        {'UNIT': unit},
    )


def start_moving(direction='forward'):
    return Block(
        'flippermove_startMove',
        {'DIRECTION': Menu('flippermove_custom-icon-direction', 'field_flippermove_custom-icon-direction', direction)},
    )


def start_dual(left, right):
    return Block('flippermoremove_startDualSpeed', {'LEFT': left, 'RIGHT': right})


def stop_moving():
    return Block('flippermove_stopMove')


def reset_yaw():
    return Block('flippersensors_resetYaw')


def yaw():
    return Block('flippersensors_orientationAxis', fields={'AXIS': 'yaw'})


def reflected(port='B'):
    return Block(
        'flippersensors_reflectivity',
        {'PORT': Menu('flippersensors_color-sensor-selector', 'field_flippersensors_color-sensor-selector', port)},
    )


def is_color(color, port='B'):
    return Block(
        'flippersensors_isColor',
        {
            'PORT': Menu('flippersensors_color-sensor-selector', 'field_flippersensors_color-sensor-selector', port),
            'VALUE': Menu('flippersensors_color-selector', 'field_flippersensors_color-selector', color),
        },
        boolean=True,
    )


def wait_until(condition):
    return Block('control_wait_until', {'CONDITION': condition})


def wait(seconds):
    return Block('control_wait', {'DURATION': seconds})


def repeat(times, body):
    return Block('control_repeat', {'TIMES': times}, substacks={'SUBSTACK': body})


def repeat_until(condition, body):
    return Block('control_repeat_until', {'CONDITION': condition}, substacks={'SUBSTACK': body})


def forever(body):
    return Block('control_forever', substacks={'SUBSTACK': body})


def if_else(condition, then, otherwise):
    return Block('control_if_else', {'CONDITION': condition}, substacks={'SUBSTACK': then, 'SUBSTACK2': otherwise})


def op(opcode, a, b, boolean=False):
    names = ('OPERAND1', 'OPERAND2') if opcode in ('operator_lt', 'operator_gt', 'operator_equals') else ('NUM1', 'NUM2')
    kind = 'text' if names[0] == 'OPERAND1' else 'number'
    return Block(opcode, {names[0]: (a, kind), names[1]: (b, kind)}, boolean=boolean)


def lt(a, b):
    return op('operator_lt', a, b, True)


def gt(a, b):
    return op('operator_gt', a, b, True)


def add(a, b):
    return op('operator_add', a, b)


def sub(a, b):
    return op('operator_subtract', a, b)


def mul(a, b):
    return op('operator_multiply', a, b)


def set_var(name, value):
    return Block('data_setvariableto', {'VALUE': (value, 'text')}, {'VARIABLE': VarRef(name)})


def arg(name):
    return Block('argument_reporter_string_number', fields={'VALUE': name})


def reset_motor_degrees(port, value=0):
    return Block(
        'flippermoremotor_motorSetDegreeCounted',
        {
            'PORT': Menu('flippermoremotor_multiple-port-selector', 'field_flippermoremotor_multiple-port-selector', port),
            'VALUE': value,
        },
    )


def motor_degrees(port):
    return Block(
        'flippermoremotor_position',
        {'PORT': Menu('flippermoremotor_single-motor-selector', 'field_flippermoremotor_single-motor-selector', port)},
    )


def reset_timer():
    return Block('flippersensors_resetTimer')


def timer():
    return Block('flippersensors_timer')


def absolute(value):
    return Block('operator_mathop', {'NUM': value}, {'OPERATOR': 'abs'})


def var(name):
    return VarRef(name)
