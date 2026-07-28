# SignalK Modbus Wind Sensor

Signal K server plugin for an integrated wind speed and direction sensor connected through an RS485 USB adapter.

## Sensor protocol

The plugin uses Modbus RTU, 9600 baud, 8 data bits, no parity, and 1 stop bit. It reads four holding registers from slave address `1` with function `03`, starting at register `0`.

The sensor manual defines the registers as:

| Register | Signal K value | Conversion |
| --- | --- | --- |
| 0 | `environment.wind.speedApparent` | raw / 10, m/s |
| 1 | `environment.wind.beaufortScale` | integer |
| 2 | `environment.wind.angleApparent` | raw / 10 degrees, corrected to signed vessel-relative angle and converted to radians |
| 3 | `environment.wind.directionSector` | raw integer value |

## Configuration

Configure the plugin in Signal K under Server → Plugin Config. Defaults are:

- Device: `/dev/ttyUSB0`
- Slave ID: `1`
- Baud rate: `9600`
- Poll interval: `1000 ms`
- Response timeout: `500 ms`
- Mounting angle offset: `0°` (positive values rotate the sensor reading clockwise)

The mounting angle offset is applied to the apparent wind angle. The resulting
angle follows SignalK’s convention: `0` is ahead, positive values are to
starboard, negative values are to port, and the result is limited to
`[-π, +π]` radians. The direction sector is exposed as the raw integer because
the sensor documentation does not reliably define its interpretation.

The USB serial device must be passed through to a Docker-based Signal K server.

## Development

```sh
npm install
npm test
```

For local Signal K development, link the package into the server configuration as described in the Signal K plugin documentation, then enable it in the Admin UI.

## License

MIT
