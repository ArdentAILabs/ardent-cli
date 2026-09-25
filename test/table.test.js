import assert from 'node:assert/strict'
import test from 'node:test'
import stringWidth from 'string-width'

import {renderTable} from '../dist/table.js'

test('shrinks lower-priority columns and truncates values to the terminal width', () => {
  const table = renderTable([
    {source: 'database.example:5432/a_very_long_database_name', status: 'registered', title: 'A connector title that is much too long'},
  ], [
    {header: 'Title', maxWidth: 30, shrinkPriority: 1, value: ({title}) => title},
    {header: 'Status', shrinkPriority: 2, value: ({status}) => status},
    {header: 'Source', maxWidth: 50, minWidth: 20, shrinkPriority: 0, value: ({source}) => source},
  ], 60)

  assert.ok(table.every((line) => stringWidth(line) === 60))
  assert.equal(table[3], '│ A connector title t… │ registered │ database.example:54… │')
})

test('shrinks below preferred column minimums when the terminal is narrower', () => {
  const table = renderTable([
    {source: 'database.example:5432/app', status: 'registered', title: 'Primary database'},
  ], [
    {header: 'Title', maxWidth: 30, shrinkPriority: 1, value: ({title}) => title},
    {header: 'Status', shrinkPriority: 2, value: ({status}) => status},
    {header: 'Source', maxWidth: 50, minWidth: 20, shrinkPriority: 0, value: ({source}) => source},
  ], 30)

  assert.ok(table.every((line) => stringWidth(line) === 30))
  assert.equal(table[3], '│ Prim… │ regis… │ database… │')
})

test('measures terminal width and truncates only at Unicode grapheme boundaries', () => {
  const table = renderTable([
    {name: 'A\u0301BCDE'},
    {name: '👩‍💻数据库'},
    {name: '数据库'},
  ], [
    {header: 'Name', maxWidth: 4, value: ({name}) => name},
  ])

  assert.deepEqual(table, [
    '┌──────┐',
    '│ Name │',
    '├──────┤',
    '│ A\u0301BC… │',
    '│ 👩‍💻…  │',
    '│ 数…  │',
    '└──────┘',
  ])
  assert.ok(table.every((line) => stringWidth(line) === 8))
})
