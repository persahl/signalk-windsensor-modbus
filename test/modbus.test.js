'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { buildRequest, crc16, parseResponse } = require('../plugin/modbus')

test('builds the documented query frame', () => {
  assert.equal(buildRequest(1).toString('hex'), '0103000000044409')
  assert.equal(crc16(Buffer.from('010300000004', 'hex')), 0x0944)
})

test('decodes the documented sample response', () => {
  const response = Buffer.from('0103080024000305460003', 'hex')
  const crc = crc16(response)
  const frame = Buffer.concat([response, Buffer.from([crc & 0xff, crc >>> 8])])
  const values = parseResponse(frame)
  assert.equal(values.speedApparent, 3.6)
  assert.equal(values.beaufortScale, 3)
  assert.ok(Math.abs(values.angleApparent - (0.3 * Math.PI / 180)) < 1e-12)
})

test('rejects malformed responses', () => {
  assert.throws(() => parseResponse(Buffer.alloc(12)), /length/)
  const payload = Buffer.from('0103080024000305460003', 'hex')
  const crc = crc16(payload)
  const frame = Buffer.concat([payload, Buffer.from([crc & 0xff, crc >>> 8])])
  frame[12] ^= 0xff
  assert.throws(() => parseResponse(frame), /CRC/)
  const valid = Buffer.concat([payload, Buffer.from([crc & 0xff, crc >>> 8])])
  valid[0] = 2
  assert.throws(() => parseResponse(valid), /address/)
})

test('applies and normalizes a mounting angle offset', () => {
  const payload = Buffer.from('0103080024000305460003', 'hex')
  const crc = crc16(payload)
  const frame = Buffer.concat([payload, Buffer.from([crc & 0xff, crc >>> 8])])
  const values = parseResponse(frame, 1, 270)
  assert.ok(Math.abs(values.angleApparent - (270.3 * Math.PI / 180)) < 1e-12)
})
