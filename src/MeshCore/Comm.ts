import { BleClient } from '@capacitor-community/bluetooth-le';
import { Frame, FrameParser, frameParserResult, SerialFrame } from './Frame';
import { uint8ArrayConcat, uint8ArrayToHexPretty } from './Helpers';

type PushNotificationHandler = (frame: frameParserResult) => void;
interface CommOptions {
  debug?: boolean,
  onConnect?: (param: any) => void,
  onDisconnect?: (param: any) => void
}

export abstract class Comm extends EventTarget {
  private pendingResolve: ((frame: frameParserResult) => void) | null = null;
  private pushHandlers: Map<number, PushNotificationHandler> = new Map();
  protected responseQueue: frameParserResult[] = [];
  public onDisconnect = (param: any) => {};
  public onConnect = (param: any) => {};

  public opts: CommOptions = { debug: false };

  constructor(opts?: CommOptions) {
    super();
    if(typeof opts === 'object') {
      if(typeof opts.onConnect === 'function') this.onConnect = opts?.onConnect;
      if(typeof opts.onDisconnect === 'function') this.onDisconnect = opts?.onDisconnect;

      this.opts = { ...this.opts, ...opts }
    }
  }

  protected handleIncomingFrame(frame: frameParserResult) {
    if (frame.code >= 0x80) {
      this.handlePushNotification(frame);
    } else {
      this.responseQueue.push(frame);
      this.processResponseQueue();
    }
  }

  handlePushNotification(frame: frameParserResult) {
    const handler = this.pushHandlers.get(frame.code);
    if (handler) {
      handler(frame);
    }
    this.dispatchEvent(new CustomEvent('push', { detail: frame }));
  }

  private processResponseQueue() {
    if (this.pendingResolve && this.responseQueue.length > 0) {
      const resolve = this.pendingResolve;
      this.pendingResolve = null;
      resolve(this.responseQueue.shift()!);
    }
  }

  protected registerPushHandler(code: number, handler: PushNotificationHandler) {
    this.pushHandlers.set(code, handler);
  }

  public async expectResponse(expectedCodes: number | number[], timeout = 5000): Promise<frameParserResult> {
    const codes = Array.isArray(expectedCodes) ? expectedCodes : [expectedCodes];

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timeout waiting for response codes: ${codes.join(', ')}`));
      }, timeout);

      const checkQueue = () => {
        const index = this.responseQueue.findIndex(f => codes.includes(f.code));
        if (index !== -1) {
          clearTimeout(timer);
          resolve(this.responseQueue.splice(index, 1)[0]);
        } else {
          this.pendingResolve = (frame) => {
            clearTimeout(timer);
            if (codes.includes(frame.code)) {
              resolve(frame);
            } else {
              reject(new Error(`Unexpected response code: ${frame.code}. Expected: ${codes.join(', ')}`));
            }
          };
        }
      };

      checkQueue();
    });
  }

  abstract connect(...params: any): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract sendCommand(frame: Frame): Promise<void>;
}

export class SerialComm extends Comm {
  private port: SerialPort | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private buffer = new Uint8Array();

  async connect() {
    this.port = await navigator.serial.requestPort();
    await this.port.open({ baudRate: 115200 });
    this.onConnect(this.port);
    this.port.addEventListener('disconnect', this.onDisconnect.bind(this, this.port));

    this.reader = this.port.readable.getReader();
    this.writer = this.port.writable.getWriter();
    this.readLoop();
  }

  async disconnect() {
    await this.reader?.cancel();
    await this.writer?.close();
    await this.port?.close();
  }

  private async readLoop() {
    while (true) {
      const { value, done } = await this.reader!.read();
      if (done) break;
      this.buffer = uint8ArrayConcat([this.buffer, value]);
      this.processBuffer();
    }
  }

  private processBuffer() {
    while (this.buffer.length >= 3) {
      try {
        const header = SerialFrame.parseHeader(this.buffer.slice(0, 3));
        const requiredLength = 3 + header.length;
        if (this.buffer.length >= requiredLength) {
          const frameData = this.buffer.slice(3, requiredLength);
          this.buffer = this.buffer.slice(requiredLength);
          if(this.opts.debug) console.log("[IN] raw:", uint8ArrayToHexPretty(frameData));
          const frame = FrameParser.parse(header.isReply, frameData);
          if(this.opts.debug) console.log("[IN] parsed:", frame);
          this.handleIncomingFrame(frame);
        } else {
          break;
        }
      } catch (e) {
        console.error('Error processing frame:', e);
        break;
      }
    }
  }

  async sendCommand(frame: Frame) {
    if(this.opts.debug) console.log("[OUT]: ", frame);
    const data = SerialFrame.createFrame(frame.toUint8Array());
    await this.writer!.write(data);
  }

  async reconnect() {
    await this.connect()
  }
}

export class BluetoothComm extends Comm {
  private device: BluetoothDevice | null = null;
  private characteristicRx: BluetoothRemoteGATTCharacteristic | undefined;
  private characteristicTx: BluetoothRemoteGATTCharacteristic | undefined;
  public serviceUUID = '';

  async connect(serviceUUID: string) {
    this.serviceUUID = serviceUUID;
    this.device = await navigator.bluetooth.requestDevice({
      filters: [{ services: [serviceUUID] }],
    });

    const server = await this.device.gatt!.connect();
    this.onConnect(this.device);
    this.device.addEventListener('gattserverdisconnected', this.onDisconnect.bind(this, this.device));

    const service = await server.getPrimaryService(serviceUUID);
    const allCharacteristics = await service.getCharacteristics();
    this.characteristicRx = allCharacteristics.find(ch => ch.properties.read && ch.properties.notify);
    if(!this.characteristicRx) throw new Error(`Incompatible device: cannot READ`);
    await this.characteristicRx.startNotifications();

    this.characteristicTx = allCharacteristics.find(ch => ch.properties.write);
    if(!this.characteristicRx) throw new Error(`Incompatible device: cannot WRITE`);

    this.characteristicRx.addEventListener('characteristicvaluechanged', (event) => {
      const value = (event.target as BluetoothRemoteGATTCharacteristic).value!;
      const frame = new Uint8Array(value.buffer);
      if(this.opts.debug) console.log("[IN]: raw:", uint8ArrayToHexPretty(frame));
      const parsedFrame = FrameParser.parse(true, frame);
      if(this.opts.debug) console.log("[IN] parsed:", parsedFrame);
      this.handleIncomingFrame(parsedFrame);
    });
  }

  async disconnect() {
    this.device?.gatt?.disconnect();
  }

  async sendCommand(frame: Frame) {
    if(this.opts.debug) console.log("[OUT]: ", frame);
    await this.characteristicTx!.writeValue(frame.toUint8Array());
  }

  async reconnect() {
    await this.connect(this.serviceUUID);
  }

  static async getBluetoothDevices(serviceUUID: string, timeout = 5000) {
    await BleClient.initialize();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timeout waiting for bluetooth devices`));
      }, timeout);

      BleClient.requestLEScan(
        { services: [serviceUUID] },
        result => {
          clearTimeout(timer);
          resolve(result)
        }
      );
    });
  }
}
