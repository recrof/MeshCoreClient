import { SerialPort } from 'tauri-plugin-serialplugin';

/*
import {
  BleDevice, getConnectionUpdates,send, read, connect, disconnect,
} from '@mnlphlp/plugin-blec';
*/

import * as mcf from './Frame.ts';
import { delay, uint8ArrayToHexPretty } from './Helpers.ts';

interface LinkOptions {
  debug?: boolean;
  timeout?: number;
}

interface Contact {
  publicKey: string;
  type: mcf.FAdvType;
  flags: number;
  outPathLen: number;
  outPath: Uint8Array;
  advName: string;
  lastAdvert: number;
  advLat?: number;
  advLon?: number;
  lastMod: number;
}

export enum LinkType {
  Serial,
  Bluetooth,
}

export class Link {
  private port: SerialPort | null = null;
//  private bleDevice: BleDevice | null = null;
  private bleCharacteristic: string | null = null;
  private opts: LinkOptions;
  private pushListeners: { [key: number]: ((data: any) => void)[] } = {};
  private linkType: LinkType;
  public isConnected: boolean = false;
  private isReading: boolean = false;

  constructor(opts?: LinkOptions) {
    this.opts = opts ?? { debug: false, timeout: 2000 };
    this.linkType = LinkType.Serial; // Default to serial
  }

  serialConnected(): boolean {
    return this.linkType === LinkType.Bluetooth && this.isConnected
  }

  bluetoothConnected(): boolean {
    return this.linkType === LinkType.Serial && this.isConnected
  }

  async connectSerial(path: string, baudRate: number): Promise<void> {
    this.linkType = LinkType.Serial;
    this.port = new SerialPort({ path, baudRate });
    if(!this.port) throw new Error(`Cannot connect to serial ${path}`);

    await this.port.open();
    this.isConnected = true;
    this.port.disconnected(() => {
      this.isConnected = false;
      this.triggerPushListeners(mcf.FPushCode.MsgWaiting, { error: 'disconnected' }); // or a specific disconnect code
    });
    this.listenForPushNotifications();
  }
/*
  async connectBluetooth(device: BleDevice, characteristic: string): Promise<void> {
    this.linkType = LinkType.Bluetooth;
    this.bleDevice = device;
    this.bleCharacteristic = characteristic;
    await connect(device.address, () => {
      this.isConnected = false;
      this.triggerPushListeners(mcf.FPushCode.MsgWaiting, { error: 'disconnected' }); // or a specific disconnect code
    });
    this.isConnected = true;

    // Handle BLE disconnection and trigger push listeners if needed
    await getConnectionUpdates((state) => {
      this.isConnected = state;
      if (!state) {
        this.triggerPushListeners(mcf.FPushCode.MsgWaiting, { error: 'disconnected' });
      }
    });

    this.listenForPushNotifications();
  }
*/
  async disconnect(): Promise<void> {
    if (this.linkType === LinkType.Serial && this.port) {
      await this.port.close();
      this.port = null;
    }
    /*
    else if (this.linkType === LinkType.Bluetooth && this.bleDevice) {
      await disconnect();
      this.bleDevice = null;
      this.bleCharacteristic = null;
    }
    this.isConnected = false;
    */
  }

  async appStart(appName: string, appVer: number): Promise<mcf.IRespCodeSelfInfo> {
    const appStartFrame = new mcf.FCmdAppStart({ appName, appVer }, this.opts);
    await this.write(mcf.SerialFrame.createFrame(appStartFrame.toUint8Array()));

    return await this.expectResponse(mcf.FRespCode.SelfInfo) as mcf.IRespCodeSelfInfo;
  }

  async getContacts(since?: number): Promise<Contact[]> {
    const getContactsFrame = new mcf.FCmdGetContacts({ since }, this.opts);
    await this.write(mcf.SerialFrame.createFrame(getContactsFrame.toUint8Array()));

    const contactsStart = await this.expectResponse(mcf.FRespCode.ContactsStart) as mcf.IRespCodeContactsStart;
    const contacts: Contact[] = [];

    for (let i = 0; i < contactsStart.count; i++) {
      const contact = await this.expectResponse(mcf.FRespCode.Contact) as Contact;
      contacts.push(contact);
    }

    await this.expectResponse(mcf.FRespCode.EndOfContacts);

    return contacts;
  }

  async getDeviceTime(): Promise<number | undefined> {
    const getDeviceTimeFrame = new mcf.FCmdGetDeviceTime(this.opts);
    await this.write(mcf.SerialFrame.createFrame(getDeviceTimeFrame.toUint8Array()));
    const response = await this.expectResponse(mcf.FRespCode.Ok) as mcf.IRespCodeOk;

    return response.epochSecs;
  }

  async setDeviceTime(epochSecs: number): Promise<void> {
    const setDeviceTimeFrame = new mcf.FCmdSetDeviceTime({ epochSecs }, this.opts);
    await this.write(mcf.SerialFrame.createFrame(setDeviceTimeFrame.toUint8Array()));
    await this.expectResponse(mcf.FRespCode.Ok);
  }

  async sendSelfAdvert(type: mcf.FSelfAdvertType = mcf.FSelfAdvertType.ZeroHop): Promise<void> {
    const sendSelfAdvertFrame = new mcf.FCmdSendSelfAdvert({ type }, this.opts);
    await this.write(mcf.SerialFrame.createFrame(sendSelfAdvertFrame.toUint8Array()));
    await this.expectResponse(mcf.FRespCode.Ok);
  }

  async setAdvertName(name: string): Promise<void> {
    const setAdvertNameFrame = new mcf.FCmdSetAdvertName({ name }, this.opts);
    await this.write(mcf.SerialFrame.createFrame(setAdvertNameFrame.toUint8Array()));
    await this.expectResponse(mcf.FRespCode.Ok);
  }

  async syncNextMessage(): Promise<mcf.IRespContactMsgRecv | null> {
    const syncNextMessageFrame = new mcf.FCmdSyncNextMessage(null, this.opts);
    await this.write(mcf.SerialFrame.createFrame(syncNextMessageFrame.toUint8Array()));
    try {
      const message = await this.expectResponse(mcf.FRespCode.ContactMsgRecv) as mcf.IRespContactMsgRecv;
      return message;
    } catch (error) {
      // Handle no message case, which is signified by a timeout or specific error
      return null;
    }
  }

  async addUpdateContact(contact: mcf.ICmdAddUpdateContact): Promise<void> {
    const addUpdateContactFrame = new mcf.FCmdAddUpdateContact(contact, this.opts);
    await this.write(mcf.SerialFrame.createFrame(addUpdateContactFrame.toUint8Array()));
    await this.expectResponse(mcf.FRespCode.Ok);
  }

  async sendTxtMsg(msg: mcf.ICmdSendTxtMsg): Promise<mcf.IRespCodeSent> {
    const sendTxtMsgFrame = new mcf.FCmdSendTxtMsg(msg, this.opts);
    await this.write(mcf.SerialFrame.createFrame(sendTxtMsgFrame.toUint8Array()));
    return await this.expectResponse(mcf.FRespCode.Sent) as mcf.IRespCodeSent;
  }

  async setRadioParams(params: mcf.ICmdSetRadioParams): Promise<void> {
    const setRadioParamsFrame = new mcf.FCmdSetRadioParams(params, this.opts);
    await this.write(mcf.SerialFrame.createFrame(setRadioParamsFrame.toUint8Array()));
    await this.expectResponse(mcf.FRespCode.Ok);
  }

  private async acquireReadLock(): Promise<void> {
    while (this.isReading) {
      await delay(50);
    }
    this.isReading = true;
  }

  private releaseReadLock(): void {
    this.isReading = false;
  }

  private async read(size?: number): Promise<Uint8Array> {
    let reply = new Uint8Array();
    await this.acquireReadLock();
    if (this.linkType === LinkType.Serial) {
      if(!this.port) throw Error('SerialPort not initialized');
      console.log(`[serial] request(requested: ${size}, buffer: ${await this.port.bytesToRead()})`);

      reply = await this.port.readBinary({ size, timeout: this.opts.timeout });

      if (this.opts.debug) {
        console.log('[serial] in: ', uint8ArrayToHexPretty(reply));
      }
    }
    /*
    else {
      if(!this.bleCharacteristic) throw Error('bleCharacteristic not initialized');

      reply = await read(this.bleCharacteristic);
      if (this.opts.debug) {
        console.log('[ble] in: ', uint8ArrayToHexPretty(reply));
      }
    }
    */
    this.releaseReadLock();

    return reply;
  }

  private async write(data: Uint8Array): Promise<void> {
    if (this.linkType === LinkType.Serial) {
      if(!this.port) throw Error('SerialPort not initialized');

      if (this.opts.debug) {
        console.log('[serial] out:', uint8ArrayToHexPretty(data));
      }
      await this.port.writeBinary(data);
    } else {
      if(!this.bleCharacteristic) throw Error('bleCharacteristic not initialized');

      if (this.opts.debug) {
        console.log('[ble] out:', uint8ArrayToHexPretty(data));
      }
      //await send(this.bleCharacteristic, data, 'withoutResponse');
    }
  }

  private async getSerialFrame() {
    const frameHeader = await this.read(3);
    if (frameHeader.length === 3) {
      const header = mcf.SerialFrame.parseHeader(frameHeader);
      const frameBody = await this.read(header.length);
      const parsedFrame =  mcf.SerialFrame.parseBody(header, frameBody);

      if (this.opts.debug) {
        console.debug('getSerialFrame()', { header, parsedFrame });
      }

      return parsedFrame;
    }

    throw new Error('Incorrect header size');
  }

  private async expectResponse(expectedCode: mcf.FRespCode): Promise<object | null> {
    let parsedFrame;
    let tries = 0;

    if(this.linkType === LinkType.Serial) {
      parsedFrame = await this.getSerialFrame() as mcf.frameParserResult;
    }
    else {
      let rawFrame = new Uint8Array();
      while(tries++ < 4) {
        rawFrame = await this.read();
        if(rawFrame.length == 0) {
          await delay(500);
          continue;
        }
      }
      if(rawFrame.length === 0) throw new Error(`Timeout wating for packet with code ${expectedCode}`);
      parsedFrame = mcf.FrameParser.parse(true, rawFrame) as mcf.frameParserResult;
    }
    if(!parsedFrame) {
      throw new Error(`Cannot parse frame.`);
    }
    if (!(parsedFrame && 'code' in parsedFrame && parsedFrame.code === expectedCode)) {
      throw new Error(`Expected response code ${expectedCode}, got: ${parsedFrame.code}`);
    }
    return parsedFrame;
  }

  async listenForPushNotifications(): Promise<void> {
    while (this.isConnected) {
      let parsedFrame;
      await delay(50);

      try {
        if (this.linkType === LinkType.Serial) {
          if(this.isReading) {
            continue;
          }
          const bytesToRead = await this.port?.bytesToRead() ?? 0;

          if(bytesToRead < 3) {
            continue;
          }

          console.log('listenForPushNotifications(): got', bytesToRead, 'in queue')
          parsedFrame = await this.getSerialFrame();
        }
        else {
          if(this.isReading) {
            continue;
          }
          const rawFrame = await this.read();
          if(rawFrame.length === 0) {
            continue;
          }
          parsedFrame = mcf.FrameParser.parse(true, rawFrame);
        }

        if (parsedFrame && 'code' in parsedFrame) {
          this.triggerPushListeners(parsedFrame.code as number, parsedFrame);
        }
      } catch (error) {
        console.error('Error in push notification listener:', error);
        break;
      }
    }
  }

  onPushNotification(code: mcf.FPushCode, callback: (data: any) => void): void {
    if (!this.pushListeners[code]) {
      this.pushListeners[code] = [];
    }
    this.pushListeners[code].push(callback);
  }

  private triggerPushListeners(code: number, data: any): void {
    const listeners = this.pushListeners[code];
    if (listeners) {
      listeners.forEach(callback => callback(data));
    }
  }
}

export * from './Frame.ts';