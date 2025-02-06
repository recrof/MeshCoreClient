import * as mcf from './Frame';
import { Comm } from './Comm';

export interface Contact {
  publicKey: string,
  name: string
}

export type PushAdvert = {
  type: typeof mcf.PushCode.Advert;
  publicKey: string;
};

export type PushPathUpdated = {
  type: typeof mcf.PushCode.PathUpdated;
  publicKey: string;
};

export type PushSendConfirmed = {
  type: typeof mcf.PushCode.SendConfirmed;
  ackCode: string;
  roundTrip: number;
};

export type PushMsgWaiting = {
  type: typeof mcf.PushCode.MsgWaiting;
};

export type PushNotification =
  | PushAdvert
  | PushPathUpdated
  | PushSendConfirmed
  | PushMsgWaiting;

type PushHandler<T extends PushNotification> = (notification: T) => void;
export class Client {
  private advertHandlers: PushHandler<PushAdvert>[] = [];
  private pathUpdatedHandlers: PushHandler<PushPathUpdated>[] = [];
  private sendConfirmedHandlers: PushHandler<PushSendConfirmed>[] = [];
  private msgWaitingHandlers: PushHandler<PushMsgWaiting>[] = [];

  constructor(private comm: Comm) {
    // Register internal handlers to parse push notifications
    comm.registerPushHandler(mcf.PushCode.Advert, (frame) => {
      const notification: PushAdvert = {
        type: mcf.PushCode.Advert,
        publicKey: frame.publicKey // Direct access to parsed field
      };
      this.advertHandlers.forEach(handler => handler(notification));
    });

    comm.registerPushHandler(mcf.PushCode.PathUpdated, (frame) => {
      const notification: PushPathUpdated = {
        type: mcf.PushCode.PathUpdated,
        publicKey: frame.publicKey // Direct access
      };
      this.pathUpdatedHandlers.forEach(handler => handler(notification));
    });

    comm.registerPushHandler(mcf.PushCode.SendConfirmed, (frame) => {
      const notification: PushSendConfirmed = {
        type: mcf.PushCode.SendConfirmed,
        ackCode: frame.ackCode,
        roundTrip: frame.roundTrip
      };
      this.sendConfirmedHandlers.forEach(handler => handler(notification));
    });

    comm.registerPushHandler(mcf.PushCode.MsgWaiting, (frame) => {
      const notification: PushMsgWaiting = {
        type: mcf.PushCode.MsgWaiting
      };
      this.msgWaitingHandlers.forEach(handler => handler(notification));
    });
  }

  // Public API for push notifications
  onAdvert(handler: PushHandler<PushAdvert>) {
    this.advertHandlers.push(handler);
    return this;
  }

  onPathUpdated(handler: PushHandler<PushPathUpdated>) {
    this.pathUpdatedHandlers.push(handler);
    return this;
  }

  onSendConfirmed(handler: PushHandler<PushSendConfirmed>) {
    this.sendConfirmedHandlers.push(handler);
    return this;
  }

  onMsgWaiting(handler: PushHandler<PushMsgWaiting>) {
    this.msgWaitingHandlers.push(handler);
    return this;
  }

  async syncAllMessages() {
    const messages = [];

    while(true) {
      const cmd = new mcf.CmdSyncNextMessage();
      await this.comm.sendCommand(cmd);

      const response = await this.comm.expectResponse(
        [mcf.RespCode.ContactMsgRecv, mcf.RespCode.ChannelMsgRecv, mcf.RespCode.NoMoreMessages],
        5000
      );
      if(response.code === mcf.RespCode.NoMoreMessages) {
        break
      }
      messages.push(response);
    }

    return messages;
  }

  async appStart(appVer: number, appName: string) {
    const cmd = new mcf.CmdAppStart({ appVer, appName });
    await this.comm.sendCommand(cmd);

    return await this.comm.expectResponse(mcf.RespCode.SelfInfo);
  }

  async getContacts(since?: number): Promise<Contact[]> {
    const cmd = new mcf.CmdGetContacts({ since });
    await this.comm.sendCommand(cmd);

    const start = await this.comm.expectResponse(mcf.RespCode.ContactsStart);
    const contacts = [] as Contact[];
    for (let i = 0; i < start.count; i++) {
      contacts.push(await this.comm.expectResponse(mcf.RespCode.Contact));
    }
    await this.comm.expectResponse(mcf.RespCode.EndOfContacts);

    return contacts;
  }

  async sendTextMessage(contactPubKey: string, text: string) {
    const cmd = new mcf.CmdSendTxtMsg({
      txtType: mcf.TxtType.plain,
      attempt: 0,
      senderTimestamp: Math.floor(Date.now() / 1000),
      pubKeyPrefix: contactPubKey.slice(0, 12),
      text
    });
    await this.comm.sendCommand(cmd);

    return await this.comm.expectResponse(mcf.RespCode.Sent);
  }

  async getDeviceTime() {
    await this.comm.sendCommand(new mcf.CmdGetDeviceTime());

    return await this.comm.expectResponse(mcf.RespCode.CurrTime);
  }

  async setDeviceTime(epochSecs: number) {
    const cmd = new mcf.CmdSetDeviceTime({ epochSecs });
    await this.comm.sendCommand(cmd);

    return await this.comm.expectResponse(mcf.RespCode.Ok);
  }

  async sendSelfAdvert(type: mcf.SelfAdvertType = mcf.SelfAdvertType.ZeroHop) {
    const cmd = new mcf.CmdSendSelfAdvert({ type });
    await this.comm.sendCommand(cmd);

    return await this.comm.expectResponse(mcf.RespCode.Ok);
  }

  async setAdvertName(name: string) {
    const cmd = new mcf.CmdSetAdvertName({ name });
    await this.comm.sendCommand(cmd);

    return await this.comm.expectResponse(mcf.RespCode.Ok);
  }

  async addUpdateContact(contact: mcf.CmdAddUpdateContact) {
    const cmd = new mcf.CmdAddUpdateContact(contact);
    await this.comm.sendCommand(cmd);

    return await this.comm.expectResponse(mcf.RespCode.Ok);
  }

  async sendTxtMsg(msg: mcf.CmdSendTxtMsg) {
    const cmd = new mcf.CmdSendTxtMsg(msg);
    await this.comm.sendCommand(cmd);

    return await this.comm.expectResponse(mcf.RespCode.Sent);
  }

  async setRadioParams(params: mcf.CmdSetRadioParams) {
    const cmd = new mcf.CmdSetRadioParams(params);
    await this.comm.sendCommand(cmd);

    return await this.comm.expectResponse(mcf.RespCode.Ok);
  }
}
