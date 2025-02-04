import { SerialPort } from 'tauri-plugin-serialplugin';
import * as mcf from './Frame.ts';
import { delay, uint8ArrayToHex, uint8ArrayToHexPretty } from './Helpers.ts';

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

export class Link {
  private port: SerialPort;
  private opts: LinkOptions;
  private pushListeners: { [key: number]: ((data: any) => void)[] } = {};

  constructor(port: SerialPort, opts?: LinkOptions) {
    this.port = port;
    this.opts = opts ?? { debug: false, timeout: 2000 };
    this.port.disconnected(() => {
      this.triggerPushListeners(mcf.FPushCode.MsgWaiting, { error: 'disconnected' }); // or a specific disconnect code
    });
    this.listenForPushNotifications();
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

  private async read(size: number) {
    console.log(`[serial] request(requested: ${size}, buffer: ${await this.port.bytesToRead()})`);
    if(await this.port.bytesToRead() === 0) console.trace();

    const reply = await this.port.readBinary({ size, timeout: this.opts.timeout });

    if(this.opts.debug) {
      console.log('[serial] in: ', uint8ArrayToHexPretty(reply));
    }

    return reply;
  }

  private async write(data: Uint8Array) {
    if(this.opts.debug) {
      console.log('[serial] out:', uint8ArrayToHexPretty(data));
    }

    return await this.port.writeBinary(data)
  }

  private async expectResponse(expectedCode: mcf.FRespCode, timeout: number = 5000): Promise<object | null> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const frameHeader = await this.read(3);
      if (frameHeader.length === 3) {
        const header = mcf.SerialFrame.parseHeader(frameHeader);
        const frameBody = await this.read(header.length);
        const parsedFrame = mcf.SerialFrame.parseBody(header, frameBody);
        if (this.opts.debug) {
          console.debug('expectResponse()', { header, parsedFrame });
        }

        if (parsedFrame && 'code' in parsedFrame && parsedFrame.code === expectedCode) {
          return parsedFrame;
        }
      }
    }
    throw new Error(`timeout waiting for response code ${expectedCode}`);
  }

  async listenForPushNotifications(): Promise<void> {
    while (this.port.isOpen) {
      await delay(500); // poll every 500msec
      try {
        if(await this.port.bytesToRead() < 3) continue;
        const frameHeader = await this.read(3);
        if (frameHeader.length === 3) {
          const header = mcf.SerialFrame.parseHeader(frameHeader);
          if (this.opts.debug) {
            console.debug('listenForPushNotifications()', { header });
          }

          const frameBody = await this.read(header.length);
          const parsedFrame = mcf.SerialFrame.parseBody(header, frameBody);

          if (this.opts.debug) {
            console.debug('listenForPushNotifications()', { frameBody: uint8ArrayToHex(frameBody), parsedFrame });
          }

          if (parsedFrame && 'code' in parsedFrame) {
            this.triggerPushListeners(parsedFrame.code as number, parsedFrame);
          }
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
