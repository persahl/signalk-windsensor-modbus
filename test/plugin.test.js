'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const pluginFactory = require('../plugin')
const { buildRequest, crc16 } = require('../plugin/modbus')

class FakeSerialPort extends EventEmitter {
  static instances = []

  constructor(options) {
    super()
    this.options = options
    this.isOpen = false
    this.writes = []
    FakeSerialPort.instances.push(this)
  }

  open(callback) {
    this.isOpen = true
    callback()
  }

  write(buffer, callback) {
    this.writes.push(buffer)
    callback()
  }

  close(callback) {
    this.isOpen = false
    callback()
  }
}

FakeSerialPort.instances = []

test('starts polling, publishes four values, and closes cleanly', async () => {
  const messages = []
  const app = {
    __serialPort: { SerialPort: FakeSerialPort },
    handleMessage: (_id, message) => messages.push(message),
    debug: () => {},
    error: (message) => { throw new Error(message) }
  }
  const plugin = pluginFactory(app)
  plugin.start({ pollInterval: 10000 })
  const serial = FakeSerialPort.instances.at(-1)
  assert.equal(serial.options.path, '/dev/ttyUSB0')
  assert.deepEqual(serial.writes[0], buildRequest(1))

  const payload = Buffer.from('0103080024000305460003', 'hex')
  const crc = crc16(payload)
  const response = Buffer.concat([payload, Buffer.from([crc & 0xff, crc >>> 8])])
  serial.emit('data', response.subarray(0, 5))
  serial.emit('data', response.subarray(5))

  assert.equal(messages.length, 1)
  assert.deepEqual(messages[0].updates[0].values.map((entry) => entry.path), [
    'environment.wind.speedApparent',
    'environment.wind.angleApparent',
    'environment.wind.beaufortScale'
  ])
  await plugin.stop()
  assert.equal(serial.isOpen, false)
})
