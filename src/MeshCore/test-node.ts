import { Buffer } from 'node:buffer';
import { FCmdAppStart, SerialFrame } from "./Frame.ts";
import { uint8ArrayToHexPretty, delay } from "./Helpers.ts"

import { autoDetect } from '@serialport/bindings-cpp'

const port = await autoDetect().open({
  path: '/dev/cu.usbserial-0001',
  baudRate: 115200,
})

//console.log(port);
const frameOptions = { debug: true };
// 2. Send CMD_APP_START
const appStartFrame = new FCmdAppStart({ appVer: 1, appName: 'NodeClient' }, frameOptions);
const appStartSerialFrame = SerialFrame.createFrame(appStartFrame.toUint8Array());

/*
const appStartSerialFrameHeader = appStartSerialFrame.slice(0, 3);
const appStartSerialFrameBody = appStartSerialFrame.slice(3);
const parsedStartSerialHeader = SerialFrame.parseHeader(appStartSerialFrameHeader);

console.log('self-check: parsed body:', SerialFrame.parseBody(parsedStartSerialHeader, appStartSerialFrameBody));
*/

await port.write(Buffer.from(appStartSerialFrame));
await port.drain();
console.log('sent appStartFrame:', uint8ArrayToHexPretty(appStartSerialFrame));

let {buffer} = await port.read(Buffer.alloc(3), 0, 3);
const frameHeader = SerialFrame.parseHeader(buffer);
console.log('got frameHeader:', uint8ArrayToHexPretty(buffer), uint8ArrayToHexPretty(frameHeader));
delay(1000);

({buffer} = await port.read(Buffer.alloc(frameHeader.length), 0, frameHeader.length));
console.log('got frameBody:', uint8ArrayToHexPretty(buffer));

console.log('parsed', SerialFrame.parseBody(frameHeader, buffer));
