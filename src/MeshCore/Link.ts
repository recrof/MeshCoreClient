import { SerialPort } from 'tauri-plugin-serialplugin';
import {
  FCmdAppStart,
  FCmdGetContacts,
  FCmdSetDeviceTime,
  FCmdSendSelfAdvert,
  FCmdSetAdvertName,
  FCmdAddUpdateContact,
  FCmdSendTxtMsg,
  FCmdSetRadioParams,
  FRespCodeSelfInfo,
  FRespCodeContactsStart,
  FRespCodeContact,
  FRespCodeEndOfContacts,
  FRespCodeSent,
  FRespContactMsgRecv,
  SerialFrame,
  FRespCode,
  FCmdCode,
  FPushCode,
  FSelfAdvertType,
  Frame,
  FTxtType,
  FPathLenDirect,
  FRespCodeType,
  IRespCodeContact,
  ICmdAddUpdateContact,
  ICmdSetRadioParams,
} from './Frame.ts';

interface LinkOptions {
  debug?: boolean;
}

export class Link {
  #port: SerialPort;
  #opts: LinkOptions;
  #eventTarget: EventTarget;
  #syncInProgress: boolean = false;
  #receivedFrames: Frame[] = [];

  constructor(port: SerialPort, opts?: LinkOptions) {
    this.#port = port;
    this.#opts = opts ?? { debug: false };
    this.#eventTarget = new EventTarget();
    this.#syncInProgress = false;
    this.init();
  }

  async init() {
    // Handle port disconnection
    this.#port.disconnected(() => {
      this.#eventTarget.dispatchEvent(new CustomEvent('disconnected'));
    });

    // Start reading from the serial port
    this.readLoop().catch(err => {
      console.error('Serial read loop error:', err);
    });

    // Send app start command
    await this.appStart('MeshCore App', 1);
  }

  async readLoop() {
    while (this.#port.isOpen) {
      try {
        if(await this.#port.bytesToRead() < 3) continue;
        const frameHeader = await this.#port.readBinary({ size: 3 });
        const header = SerialFrame.parseHeader(frameHeader);
        const frameBody = await this.#port.readBinary({ size: header.length });
        const parsedFrame = SerialFrame.parseBody(header, frameBody);

        if (parsedFrame) {
          if(header.isReply) {
            if(this.#syncInProgress) {
              this.#receivedFrames.push(parsedFrame);
            }
          } else {
            this.handlePushNotification(parsedFrame);
          }
        }
      } catch (err) {
        console.error('Error reading from serial port:', err);
        // Handle read errors, potentially implement re-connection logic
        break;
      }
    }
  }

  private async sendFrame(frame: Frame) {
    const serialFrame = SerialFrame.createFrame(frame.toUint8Array());
    await this.#port.writeBinary(serialFrame);
    if (this.#opts.debug) {
      console.debug('Sent frame:', frame);
    }
  }

  async appStart(appName: string, appVer: number) {
    const frame = new FCmdAppStart({ appName, appVer }, this.#opts);
    await this.sendFrame(frame);
  }

  async getContacts(since?: number): Promise<IRespCodeContact[]> {
    const frame = new FCmdGetContacts({ since }, this.#opts);
    await this.sendFrame(frame);
    return await this.syncResponse(FCmdCode.GetContacts) as IRespCodeContact[];
  }

  async addUpdateContact(contact: ICmdAddUpdateContact) {
    const frame = new FCmdAddUpdateContact(contact, this.#opts);
    await this.sendFrame(frame);
    return await this.syncResponse(FCmdCode.AddUpdateContact);
  }

  async setDeviceTime(epochSecs: number) {
    const frame = new FCmdSetDeviceTime({ epochSecs }, this.#opts);
    await this.sendFrame(frame);
    return await this.syncResponse(FCmdCode.SetDeviceTime);
  }

  async sendSelfAdvert(type: FSelfAdvertType = FSelfAdvertType.ZeroHop) {
    const frame = new FCmdSendSelfAdvert({ type }, this.#opts);
    await this.sendFrame(frame);
    return await this.syncResponse(FCmdCode.SendSelfAdvert);
  }

  async setAdvertName(name: string) {
    const frame = new FCmdSetAdvertName({ name }, this.#opts);
    await this.sendFrame(frame);
    return await this.syncResponse(FCmdCode.SetAdvertName);
  }

  async sendTxtMsg(
    txtType: FTxtType,
    attempt: number,
    senderTimestamp: number,
    pubKeyPrefix: string,
    text: string,
  ) {
    const frame = new FCmdSendTxtMsg({ txtType, attempt, senderTimestamp, pubKeyPrefix, text }, this.#opts);
    await this.sendFrame(frame);

    return await this.syncResponse(FCmdCode.SendTxtMsg) as IRespCodeSent;
  }

  async syncNextMessage() {
    return await this.syncResponse(FCmdCode.SyncNextMessage);
  }

  async setRadioParams(params: ICmdSetRadioParams) {
    const frame = new FCmdSetRadioParams(params, this.#opts);
    await this.sendFrame(frame);

    return await this.syncResponse(FCmdCode.SetRadioParams);
  }

  async syncResponse(cmdCode: number): Promise<IRespCodeContact[] | IRespCodeSent | null> {
    this.#syncInProgress = true;
    this.#receivedFrames = [];
    // Timeout to prevent infinite wait
    const timeout = setTimeout(() => {
      this.#syncInProgress = false;
      this.#receivedFrames = [];
    }, 5000);

    while (this.#syncInProgress) {
      if (this.#receivedFrames.length > 0) {
        switch (cmdCode) {
          case FCmdCode.GetContacts: {
            const contacts = [];
            for(const frame of this.#receivedFrames) {
              if(frame instanceof FRespCodeContactsStart) {
                console.log('Total contacts received', frame.count);
              } else if (frame instanceof FRespCodeContact) {
                contacts.push(frame);
              } else if (frame instanceof FRespCodeEndOfContacts) {
                this.#syncInProgress = false;
                clearTimeout(timeout);
                return contacts;
              }
            }
            break;
          }
          case FCmdCode.AddUpdateContact:
          case FCmdCode.SetDeviceTime:
          case FCmdCode.SendSelfAdvert:
          case FCmdCode.SetAdvertName:
          case FCmdCode.SetRadioParams: {
            const responseCode = this.#receivedFrames[0];
            this.#syncInProgress = false;
            clearTimeout(timeout);
            if(responseCode instanceof Frame) {
              return responseCode[0] === FRespCode.Ok ? true : false;
            } else {
              return false;
            }
          }
          case FCmdCode.SendTxtMsg: {
            const sendResponse = this.#receivedFrames[0];
            this.#syncInProgress = false;
            clearTimeout(timeout);
            if(sendResponse instanceof FRespCodeSent) {
              return sendResponse;
            } else {
              return null;
            }
          }
        }
      }
      // Prevent event loop blocking
      await new Promise(resolve => setTimeout(resolve, 5));
    }

    clearTimeout(timeout);
    return null;
  }

  private handlePushNotification(frame: Frame) {
    if (this.#opts.debug) {
      console.debug('Received push notification:', frame);
    }

    switch (frame[0]) {
      case FPushCode.Advert:
        this.#eventTarget.dispatchEvent(new CustomEvent('advert', { detail: frame }));
        break;
      case FPushCode.PathUpdated:
        this.#eventTarget.dispatchEvent(new CustomEvent('pathUpdated', { detail: frame }));
        break;
      case FPushCode.SendConfirmed:
        this.#eventTarget.dispatchEvent(new CustomEvent('sendConfirmed', { detail: frame }));
        break;
      case FPushCode.MsgWaiting:
        this.#eventTarget.dispatchEvent(new CustomEvent('msgWaiting'));
        break;
    }
  }

  on(eventName: string, listener: EventListenerOrEventListenerObject) {
    this.#eventTarget.addEventListener(eventName, listener);
  }

  off(eventName: string, listener: EventListenerOrEventListenerObject) {
    this.#eventTarget.removeEventListener(eventName, listener);
  }
}