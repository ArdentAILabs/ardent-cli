import assert from 'node:assert/strict'
import test from 'node:test'

import {terminalText} from '../dist/terminal.js'

test('renders terminal control characters as text', () => {
  assert.equal(terminalText('safe\u001B[2J\nspoof\u202Ename'), 'safe\\u001b[2J\\u000aspoof\\u202ename')
})
