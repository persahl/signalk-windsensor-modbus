'use strict'

function crc16(buffer) {
  let crc = 0xffff
  for (const byte of buffer) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) ? (crc >>> 1) ^ 0xa001 : crc >>> 1
    }
  }
  return crc
}

function withCrc(payload) {
  const result = Buffer.alloc(payload.length + 2)
  payload.copy(result)
  const crc = crc16(payload)
  result[payload.length] = crc & 0xff
  result[payload.length + 1] = crc >>> 8
  return result
}

function buildRequest(slaveId = 1) {
  return withCrc(Buffer.from([slaveId, 0x03, 0x00, 0x00, 0x00, 0x04]))
}

function normalizeDegrees(degrees) {
  return ((degrees % 360) + 360) % 360
}

function parseResponse(frame, slaveId = 1, mountingAngleOffset = 0) {
  if (!Buffer.isBuffer(frame) || frame.length !== 13) throw new Error('Invalid Modbus response length')
  if (frame[0] !== slaveId) throw new Error('Unexpected Modbus slave address')
  if (frame[1] !== 0x03) throw new Error('Unexpected Modbus function code')
  if (frame[2] !== 0x08) throw new Error('Unexpected Modbus byte count')

  const expectedCrc = crc16(frame.subarray(0, -2))
  const receivedCrc = frame[11] | (frame[12] << 8)
  if (expectedCrc !== receivedCrc) throw new Error('Invalid Modbus CRC')

  const registers = [0, 1, 2, 3].map((index) => frame.readUInt16BE(3 + index * 2))
  const directionDegrees = normalizeDegrees(registers[3] / 10 + mountingAngleOffset)

  return {
    speedApparent: registers[0] / 10,
    beaufortScale: registers[1],
    angleApparent: directionDegrees * Math.PI / 180
  }
}

module.exports = { crc16, buildRequest, normalizeDegrees, parseResponse }
