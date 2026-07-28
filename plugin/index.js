'use strict'

const { buildRequest, parseResponse } = require('./modbus')

const DEFAULTS = {
  device: '/dev/ttyUSB0',
  slaveId: 1,
  baudRate: 9600,
  pollInterval: 1000,
  timeout: 500,
  mountingAngleOffset: 0
}

module.exports = function windSensorPlugin(app) {
  let port
  let timer
  let timeoutTimer
  let reconnectTimer
  let input = Buffer.alloc(0)
  let reading = false
  let stopping = false

  const log = (message) => {
    if (typeof app.debug === 'function') app.debug(message)
  }
  const error = (message) => {
    if (typeof app.error === 'function') app.error(message)
    else log(message)
  }

  const plugin = {
    id: 'signalk-windsensor-modbus',
    name: 'Modbus RS485 Wind Sensor',
    schema: () => ({
      type: 'object',
      properties: {
        device: { type: 'string', title: 'Serial device', default: DEFAULTS.device },
        slaveId: { type: 'integer', minimum: 1, maximum: 247, default: DEFAULTS.slaveId },
        baudRate: { type: 'integer', enum: [9600], default: DEFAULTS.baudRate },
        pollInterval: { type: 'integer', minimum: 100, default: DEFAULTS.pollInterval },
        timeout: { type: 'integer', minimum: 100, default: DEFAULTS.timeout },
        mountingAngleOffset: {
          type: 'number',
          minimum: -360,
          maximum: 360,
          default: DEFAULTS.mountingAngleOffset,
          title: 'Mounting angle offset (degrees clockwise)'
        }
      }
    }),

    start: (settings = {}) => {
      const config = { ...DEFAULTS, ...settings }
      stopping = false
      input = Buffer.alloc(0)
      reading = false

      // Lazy loading keeps protocol tests and non-serial inspection lightweight.
      const SerialPort = (app.__serialPort || require('serialport')).SerialPort
      port = new SerialPort({
        path: config.device,
        baudRate: config.baudRate,
        dataBits: 8,
        parity: 'none',
        stopBits: 1,
        autoOpen: false
      })

      port.on('data', (chunk) => {
        input = Buffer.concat([input, chunk])
        while (input.length >= 13) {
          if (input[0] !== config.slaveId || input[1] !== 0x03 || input[2] !== 0x08) {
            input = input.subarray(1)
            continue
          }
          const frame = input.subarray(0, 13)
          input = input.subarray(13)
          clearTimeout(timeoutTimer)
          reading = false
          try {
            const values = parseResponse(frame, config.slaveId, config.mountingAngleOffset)
            const timestamp = new Date().toISOString()
            app.handleMessage(plugin.id, {
              context: 'vessels.self',
              updates: [{
                timestamp,
                values: [
                  { path: 'environment.wind.speedApparent', value: values.speedApparent },
                  { path: 'environment.wind.directionTrue', value: values.directionTrue },
                  { path: 'environment.wind.beaufortScale', value: values.beaufortScale },
                  { path: 'environment.wind.directionSector', value: values.directionSector }
                ]
              }]
            })
            log(`Reading: ${values.speedApparent} m/s, ${values.directionSector}`)
          } catch (err) {
            error(`Invalid wind sensor response: ${err.message}`)
          }
        }
      })
      port.on('error', (err) => error(`Serial error: ${err.message}`))
      port.on('close', () => {
        if (stopping) return
        error('Wind sensor serial port closed; retrying in 5 seconds')
        if (!reconnectTimer) {
          reconnectTimer = setTimeout(() => {
            reconnectTimer = undefined
            openPort()
          }, 5000)
        }
      })

      const poll = () => {
        if (stopping || !port.isOpen || reading) return
        reading = true
        input = Buffer.alloc(0)
        const request = buildRequest(config.slaveId)
        log(`Request: ${request.toString('hex')}`)
        port.write(request, (err) => {
          if (err) {
            reading = false
            error(`Serial write error: ${err.message}`)
          }
        })
        timeoutTimer = setTimeout(() => {
          if (reading) {
            reading = false
            input = Buffer.alloc(0)
            error('Wind sensor response timeout')
          }
        }, config.timeout)
      }

      const openPort = () => {
        if (stopping || port.isOpen) return
        port.open((err) => {
          if (err) {
            error(`Unable to open ${config.device}: ${err.message}; retrying in 5 seconds`)
            if (!reconnectTimer) {
              reconnectTimer = setTimeout(() => {
                reconnectTimer = undefined
                openPort()
              }, 5000)
            }
            return
          }
          log(`Connected to wind sensor on ${config.device}`)
          poll()
        })
      }

      timer = setInterval(poll, config.pollInterval)
      openPort()
    },

    stop: () => {
      stopping = true
      clearInterval(timer)
      clearTimeout(timeoutTimer)
      clearTimeout(reconnectTimer)
      timer = undefined
      timeoutTimer = undefined
      reconnectTimer = undefined
      reading = false
      input = Buffer.alloc(0)
      if (!port) return Promise.resolve()
      const currentPort = port
      port = undefined
      if (!currentPort.isOpen) return Promise.resolve()
      return new Promise((resolve) => currentPort.close(() => resolve()))
    }
  }

  return plugin
}
