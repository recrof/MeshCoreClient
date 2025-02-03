import { uint8ArrayConcat, uint8ArrayToHex, hexToUint8Array } from "./Helpers.ts";

export const FPathLenDirect = 0xff;

export enum FTxtType {
  plain = 0,
  cliData = 1,
  signedPlain = 2,
}

export enum FRespCodeType {
  direct = 0,
  flood = 1
}

export enum FCmdCode {
  AppStart = 1,
  SendTxtMsg = 2,
  SendChannelTxtMsg = 3,
  GetContacts = 4,
  GetDeviceTime = 5,
  SetDeviceTime = 6,
  SendSelfAdvert = 7,
  SetAdvertName = 8,
  AddUpdateContact = 9,
  SyncNextMessage = 10,
  SetRadioParams = 11,
  SetTxPower = 12,
}

export enum FRespCode {
  Ok = 0,
  Err = 1,
  ContactsStart = 2,
  Contact = 3,
  EndOfContacts = 4,
  SelfInfo = 5,
  Sent = 6,
  ContactMsgRecv = 7,
  ChannelMsgRecv = 8,
}

export enum FPushCode {
  Advert = 0x80,
  PathUpdated = 0x81,
  SendConfirmed = 0x82,
  MsgWaiting = 0x83,
}

export enum FAdvType {
  None = 0,
  Chat = 1,
  Repeater = 2,
  Room = 3,
}

export enum FSelfAdvertType {
  ZeroHop = 0,
  Flood = 1,
}

enum FrameFieldType {
  uint = 'Uint',
  int = 'Int',
  float = 'Float',
  bigInt = 'BigInt',
  string = 'varchar',
  cString = 'cstr',
  hexString = 'hex',
  bin = 'bin',
}

interface FrameField {
  key?: string,
  value?: string | number | Uint8Array | null | undefined,
  type: FrameFieldType,
  size?: number, // varchar, bin, hex fields don't need size defined
  optional?: boolean, // if we hit this field, and value is null or undefined, we skip it.
  set?(...args: any): any,
  get?(...args: any): any,
}

interface FrameOptions {
  debug?: boolean
}

export abstract class Frame {
  #opts: FrameOptions;

  constructor(_params: object, opts?: FrameOptions) {
    this.#opts = opts ?? { debug: false };
  };

  static createFrame(fields: FrameField[]) {
    const textEncoder = new TextEncoder();
    const frameParts = [];

    for (const field of fields) {
      let value = field.value;

      // 1. Handle undefined/null values and optional fields:
      if (value === undefined || value === null) {
        if (field.key && this.hasOwnProperty(field.key)) {
          // @ts-expect-error - Accessing a property that exists on the instance
          value = this[field.key];
        }

        if (value === undefined || value === null) {
          if (field.optional) {
            continue; // Skip optional field
          } else {
            throw new Error(`Field '${field.key}' cannot be undefined or null`);
          }
        }
      }

      // 2. Handle different field types:
      if (field.type === FrameFieldType.bin && value instanceof Uint8Array) {
        frameParts.push(value);
      } else if (field.type === FrameFieldType.string) {
        frameParts.push(textEncoder.encode(value.toString()));
      } else if (field.type === FrameFieldType.hexString && typeof value === 'string') {
        frameParts.push(hexToUint8Array(value, field.size ?? value.length / 2));
      } else if (field.type === FrameFieldType.cString) {
        const binString = textEncoder.encode(value.toString());
        if (!field.size) {
          throw new Error("Size is required for cString type");
        }
        if (field.size < binString.length + 1) {
          throw new Error(`Value '${value}' exceeds maximal length of ${field.size - 1}`);
        }

        const fixedArray = new Uint8Array(field.size);
        fixedArray.set(binString, 0);
        fixedArray[binString.length] = 0; // Null terminator
        frameParts.push(fixedArray);
      } else {
        // 3. Handle fixed-size numeric types:
        if (field.size === undefined || field.size <= 0) {
          throw new Error(`Non-zero size is required for type ${field.type}`);
        }

        const setFnName = `set${field.type}${field.size * 8}`;
        if (!(setFnName in DataView.prototype)) {
          throw new Error(`Field type "${field.type}" not supported or size=${field.size} invalid`);
        }

        const fixedArray = new Uint8Array(field.size);
        const fixedArrayView = new DataView(fixedArray.buffer);

        if (typeof field.set === 'function') {
          value = field.set(value);
        }

        // @ts-ignore - setFnName is checked above
        fixedArrayView[setFnName](0, value, true); // Little-endian
        frameParts.push(fixedArray);
      }

      if(this.#opts?.debug) {
        const lastPart = frameParts.at(-1) ?? new Uint8Array();
        console.debug(`createFrame(): creating field[${field.key ?? ''}] with value "${value}" [${uint8ArrayToHex(lastPart)}]`)
      }
  }

    return uint8ArrayConcat(frameParts);
  }

  static parseFrame(fields: FrameField[], rawFrame: Uint8Array) {
    let index = 0;
    const textDecoder = new TextDecoder();
    const frameValues: { [key: string]: string | number | Uint8Array } = {};
    const rawFrameView = new DataView(rawFrame.buffer);

    for (let i = 0; i < fields.length; i++) {
      const field = fields[i];

      // Handle fields without a key (reserved space)
      if (field.key == null) {
        if (field.type === FrameFieldType.bin) {
          if(!(field.value instanceof Uint8Array && field.value.length > 0)) {
            throw new Error(`Keyless field of type 'bin' needs to have value type of Uint8Array and non-zero length`);
          }
          index += field.value.length
        }
        if (field.type === FrameFieldType.uint) {
          if(!(field.size && typeof field.value === 'number')) {
            throw new Error(`Keyless field of type 'uint' needs to have numeric value and non-zero size`);
          }
          index += field.size;
        }
        continue;
      }

      // Fixed size fields
      if (field.type !== FrameFieldType.string && field.size != null) {
        if (index + field.size > rawFrame.length) {
          throw new Error(`Frame too short for field ${field.key}`);
        }

        if (field.type === FrameFieldType.bin) {
          frameValues[field.key] = rawFrame.slice(index, index + field.size);
        } else if (field.type === FrameFieldType.hexString) {
          frameValues[field.key] = uint8ArrayToHex(rawFrame.slice(index, index + field.size));
        } else if (field.type === FrameFieldType.cString) {
          const end = rawFrame.indexOf(0, index);
          if (end === -1) {
            throw new Error(`Unterminated C string for field ${field.key}`);
          }
          frameValues[field.key] = textDecoder.decode(rawFrame.slice(index, end));
        } else {
          const getFnName = `get${field.type}${field.size * 8}`;
          if (!(getFnName in DataView.prototype)) {
            throw new Error(`Field type "${field.type}" not supported or size=${field.size} invalid`);
          }

          // @ts-ignore: accessing DataView directly
          let fieldValue = rawFrameView[getFnName](index, true);

          if (typeof field.get === 'function') {
            fieldValue = field.get(fieldValue);
          }

          frameValues[field.key] = fieldValue;
        }

        index += field.size;
      }

      // Variable length string, must be the last field
      else if (field.type === FrameFieldType.string) {
        if (i !== fields.length - 1) {
          throw new Error('String type fields must be the last field');
        }

        frameValues[field.key] = textDecoder.decode(rawFrame.slice(index));
        index = rawFrame.length;
      }
    }

    // @ts-expect-error: create self
    return new this(frameValues);
  }
}

/*
  CMD_APP_START {
    code: byte,     // constant: 1
    app_ver: byte,
    reserved: bytes(6),
    app_name: (v: number)archar   // remainder of frame
  }
*/
export interface ICmdAppStart {
  appVer: number,
  appName: string,
}
export class FCmdAppStart extends Frame {
  static readonly fields = [
    { value: FCmdCode.AppStart, size: 1, type: FrameFieldType.uint },
    { key: 'appVer', size: 1, type: FrameFieldType.uint },
    { value: new Uint8Array(6), type: FrameFieldType.bin },
    { key: 'appName', type: FrameFieldType.string }
  ];

  appVer: number;
  appName: string;

  constructor(params: ICmdAppStart, opts?: FrameOptions) {
    super(params, opts);
    this.appVer = params.appVer;
    this.appName = params.appName;
  };

  public toUint8Array() {
    return Frame.createFrame.call(this, FCmdAppStart.fields);
  }

  static fromUint8Array(rawFrame: Uint8Array) {
    return super.parseFrame(FCmdAppStart.fields, rawFrame)
  }
}

/*
  CMD_GET_CONTACTS {
    code: byte,   // constant 4
    (optional) since: uint32,   // the last contact.lastmod value already received
  }
*/
export interface ICmdGetContacts {
  since?: number
}
export class FCmdGetContacts extends Frame {
  static readonly fields = [
    { value: FCmdCode.GetContacts, size: 1, type: FrameFieldType.uint },
    { key: 'since', size: 4, type: FrameFieldType.uint, optional: true },
  ];

  since?: number;

  constructor(params: ICmdGetContacts, opts?: FrameOptions) {
    super(params, opts);
    this.since = params.since;
  }

  public toUint8Array() {
    return Frame.createFrame.call(this, FCmdGetContacts.fields);
  }

  static fromUint8Array(rawFrame: Uint8Array) {
    return super.parseFrame(FCmdGetContacts.fields, rawFrame)
  }
}

/*
  CMD_ADD_UPDATE_CONTACT {
  1  code: byte,   // constant 9
  4  public_key: bytes(32),
  1  type: byte,   // one of ADV_TYPE_*
  1  flags: byte,
  1  out_path_len: signed-byte,
  64  out_path: bytes(64),
  32  adv_name: chars(32),    // null terminated
  4  last_advert: uint32
  4  (optional) adv_lat: int32,    // advertised latitude * 1E6
  4  (optional) adv_lon: int32,    // advertised longitude * 1E6
  }
*/
export interface ICmdAddUpdateContact {
  publicKey: string,
  type: FAdvType,
  flags: number,
  outPathLen: number,
  outPath: Uint8Array,
  advName: string,
  lastAdvert: number,
  advLat?: number,
  advLon?: number
}
export class FCmdAddUpdateContact extends Frame {
  static readonly fields = [
    { value: FCmdCode.AddUpdateContact, size: 1, type: FrameFieldType.uint },
    { key: 'publicKey', type: FrameFieldType.hexString, size: 32 },
    { key: 'type', size: 1, type: FrameFieldType.uint },
    { key: 'flags', size: 1, type: FrameFieldType.uint },
    { key: 'outPathLen', size: 1, type: FrameFieldType.int },
    { key: 'outPath', size: 64, type: FrameFieldType.bin },
    { key: 'advName', size: 32, type: FrameFieldType.cString },
    { key: 'lastAdvert', size: 4, type: FrameFieldType.uint },
    { key: 'advLat', size: 4, type: FrameFieldType.int, optional: true, get: (v: number) => v * 1e-6, set: (v: number) => v * 1e6 },
    { key: 'advLon', size: 4, type: FrameFieldType.int, optional: true, get: (v: number) => v * 1e-6, set: (v: number) => v * 1e6 },
  ];

  publicKey: string;
  type: FAdvType;
  flags: number;
  outPathLen: number;
  outPath: Uint8Array;
  advName: string;
  lastAdvert: number;
  advLat?: number;
  advLon?: number;

  constructor(params: ICmdAddUpdateContact, opts?: FrameOptions) {
    super(params, opts);
    this.publicKey = params.publicKey;
    this.type = params.type;
    this.flags = params.flags;
    this.outPathLen = params.outPathLen;
    this.outPath = params.outPath;
    this.advName = params.advName;
    this.lastAdvert = params.lastAdvert;
    this.advLat = params.advLat;
    this.advLon = params.advLon;
  }

  public toUint8Array() {
    return Frame.createFrame.call(this, FCmdAddUpdateContact.fields);
  }

  static fromUint8Array(rawFrame: Uint8Array) {
    return super.parseFrame(FCmdAddUpdateContact.fields, rawFrame)
  }
}

/*
  CMD_GET_DEVICE_TIME {
    code: byte,   // constant 5
    epoch_secs: uint32
  }
*/
export class FCmdGetDeviceTime extends Frame {
  static readonly fields = [
    { value: FCmdCode.GetDeviceTime, size: 1, type: FrameFieldType.uint },
    { key: 'epochSecs', size: 4, type: FrameFieldType.uint },
  ];

  constructor(opts?: FrameOptions) {
    super({}, opts);
  }

  public toUint8Array() {
    return Frame.createFrame.call(this, FCmdGetDeviceTime.fields);
  }

  static fromUint8Array(rawFrame: Uint8Array) {
    return super.parseFrame(FCmdGetDeviceTime.fields, rawFrame)
  }
}

/*
  CMD_SET_DEVICE_TIME {
    code: byte,   // constant 6
    epoch_secs: uint32
  }
*/
export interface ICmdSetDeviceTime {
  epochSecs: number
}
export class FCmdSetDeviceTime extends Frame {
  static readonly fields = [
    { value: FCmdCode.SetDeviceTime, size: 1, type: FrameFieldType.uint },
    { key: 'epochSecs', size: 4, type: FrameFieldType.uint },
  ];

  epochSecs: number;

  constructor(params: ICmdSetDeviceTime, opts?: FrameOptions) {
    super(params, opts);
    this.epochSecs = params.epochSecs;
  }

  public toUint8Array() {
    return Frame.createFrame.call(this, FCmdSetDeviceTime.fields);
  }

  static fromUint8Array(rawFrame: Uint8Array) {
    return super.parseFrame(FCmdSetDeviceTime.fields, rawFrame)
  }
}

/*
  CMD_SEND_SELF_ADVERT {
    code: byte,   // constant 7
    (optional) type: byte,   // 1 = flood, 0 = zero-hop (default)
  }
*/
export interface ICmdSendSelfAdvert {
  type?: FSelfAdvertType
}
export class FCmdSendSelfAdvert extends Frame {
  static readonly fields = [
    { value: FCmdCode.SendSelfAdvert, size: 1, type: FrameFieldType.uint },
    { key: 'type', size: 1, type: FrameFieldType.uint, optional: true },
  ];

  type?: FSelfAdvertType;

  constructor(params: ICmdSendSelfAdvert, opts?: FrameOptions) {
    super(params, opts);
    this.type = params.type;
  }

  public toUint8Array() {
    return Frame.createFrame.call(this, FCmdSendSelfAdvert.fields);
  }

  static fromUint8Array(rawFrame: Uint8Array) {
    return super.parseFrame(FCmdSendSelfAdvert.fields, rawFrame)
  }
}

/*
  CMD_SET_ADVERT_NAME {
    code: byte,   // constant 8
    name: (v: number)archar   // remainder of frame
  }
*/
export interface ICmdSetAdvertName {
  name: string
}
export class FCmdSetAdvertName extends Frame {
  static readonly fields = [
    { value: FCmdCode.SetAdvertName, size: 1, type: FrameFieldType.uint },
    { key: 'name', type: FrameFieldType.string },
  ];

  name: string;

  constructor(params: ICmdSetAdvertName, opts?: FrameOptions) {
    super(params, opts);
    this.name = params.name;
  }

  public toUint8Array() {
    return Frame.createFrame.call(this, FCmdSetAdvertName.fields);
  }

  static fromUint8Array(rawFrame: Uint8Array) {
    return super.parseFrame(FCmdSetAdvertName.fields, rawFrame)
  }
}

/*
  CMD_SEND_TXT_MSG {
    code: byte,   // constant 2
    txt_type: byte,     // one of TXT_TYPE_*  (0 = plain)
    attempt: byte,     // values: 0..3 (attempt number)
    sender_timestamp: uint32,
    pubkey_prefix: bytes(6),     // just first 6 bytes of recipient contact's public key
    text: (v: number)archar    // remainder of frame
  }
*/
export interface ICmdSendTxtMsg {
  txtType: FTxtType,
  attempt: number,
  senderTimestamp: number,
  pubKeyPrefix: string,
  text: string
}
export class FCmdSendTxtMsg extends Frame {
  static readonly fields = [
    { value: FCmdCode.SendTxtMsg, size: 1, type: FrameFieldType.uint },
    { key: 'txtType', size: 1, type: FrameFieldType.uint },
    { key: 'attempt', size: 1, type: FrameFieldType.uint },
    { key: 'senderTimestamp', size: 4, type: FrameFieldType.uint },
    { key: 'pubKeyPrefix', size: 6, type: FrameFieldType.hexString },
    { key: 'text', type: FrameFieldType.string },
  ];

  txtType: FTxtType;
  attempt: number;
  senderTimestamp: number;
  pubKeyPrefix: string;
  text: string;

  constructor(params: ICmdSendTxtMsg, opts?: FrameOptions) {
    super(params, opts);
    this.txtType = params.txtType;
    this.attempt = params.attempt;
    this.senderTimestamp = params.senderTimestamp;
    this.pubKeyPrefix = params.pubKeyPrefix;
    this.text = params.text;
  }

  public toUint8Array() {
    return Frame.createFrame.call(this, FCmdSendTxtMsg.fields);
  }

  static fromUint8Array(rawFrame: Uint8Array) {
    return super.parseFrame(FCmdSendTxtMsg.fields, rawFrame)
  }
}

/*
  RESP_CODE_SELF_INFO {
    code: byte,   // constant: 5
    type: byte,   // one of ADV_TYPE_*
    reserved1: byte,
    reserved2: byte,
    public_key: bytes(32),
    device_loc: bytes(12),   // future (not used as yet)
    radio_freq: uint32,    // freq * 1000
    radio_bw: uint32,      // bandwidth(khz) * 1000
    radio_sf: byte,        // spreading factor
    radio_cr: byte,        // coding rate
    name: (v: number)archar   // remainder of frame
  }
*/
export interface IRespCodeSelfInfo {
  type: FAdvType,
  txPower: number,
  maxTxPower: number,
  publicKey: string,
  deviceLoc: Uint8Array,
  radioFreq: number,
  radioBw: number,
  radioSf: number,
  radioCr: number,
  name: string
}
export class FRespCodeSelfInfo extends Frame {
  static readonly fields = [
    { value: FRespCode.SelfInfo, size: 1, type: FrameFieldType.uint },
    { key: 'type', size: 1, type: FrameFieldType.uint },
    { key: 'txPower', size: 1, type: FrameFieldType.uint },
    { key: 'maxTxPower', size: 1, type: FrameFieldType.uint },
    { key: 'publicKey', size: 32, type: FrameFieldType.hexString},
    { key: 'deviceLoc', size: 12, type: FrameFieldType.bin},
    { key: 'radioFreq', size: 4, type: FrameFieldType.uint },
    { key: 'radioBw', size: 4, type: FrameFieldType.uint },
    { key: 'radioSf', size: 1, type: FrameFieldType.uint },
    { key: 'radioCr', size: 1, type: FrameFieldType.uint },
    { key: 'name', type: FrameFieldType.string},
  ];

  type: FAdvType;
  txPower: number;
  maxTxPower: number;
  publicKey: string;
  deviceLoc: Uint8Array;
  radioFreq: number;
  radioBw: number;
  radioSf: number;
  radioCr: number;
  name: string;

  constructor(params: IRespCodeSelfInfo, opts?: FrameOptions) {
    super(params, opts);
    this.type = params.type;
    this.txPower = params.txPower;
    this.maxTxPower = params.maxTxPower;
    this.publicKey = params.publicKey;
    this.deviceLoc = params.deviceLoc;
    this.radioFreq = params.radioFreq;
    this.radioBw = params.radioBw;
    this.radioSf = params.radioSf;
    this.radioCr = params.radioCr;
    this.name = params.name;
  }

  public toUint8Array() {
    return Frame.createFrame.call(this, FRespCodeSelfInfo.fields);
  }

  static fromUint8Array(rawFrame: Uint8Array) {
    return super.parseFrame(FRespCodeSelfInfo.fields, rawFrame)
  }
}

/*
  RESP_CODE_CONTACTS_START {
    code: byte,   // constant 2
    count: uint32    // total number of contacts
  }
*/
interface IRespCodeContactsStart {
  count: number
}
export class FRespCodeContactsStart extends Frame {
  static readonly fields = [
    { value: FRespCode.ContactsStart, size: 1, type: FrameFieldType.uint },
    { key: 'count', size: 4, type: FrameFieldType.uint },
  ];

  count: number;

  constructor(params: IRespCodeContactsStart, opts?: FrameOptions) {
    super(params, opts);
    this.count = params.count;
  }

  public toUint8Array() {
    return Frame.createFrame.call(this, FRespCodeContactsStart.fields);
  }

  static fromUint8Array(rawFrame: Uint8Array) {
    return super.parseFrame(FRespCodeContactsStart.fields, rawFrame)
  }
}

/*
  RESP_CODE_CONTACT {
    code: byte,    // constant 3
    public_key: bytes(32),
    type: byte,   // one of ADV_TYPE_*
    flags: byte,
    out_path_len: signed-byte,
    out_path: bytes(64),
    adv_name: chars(32),    // advertised  name (null terminated)
    last_advert: uint32,
    adv_lat: int32,    // advertised latitude * 1E6
    adv_lon: int32,    // advertised longitude * 1E6
    lastmod: uint32     // used for next 'since' param to CMD_GET_CONTACTS
  }
*/
export interface IRespCodeContact {
  publicKey: string,
  type: FAdvType,
  flags: number,
  outPathLen: number,
  outPath: Uint8Array,
  advName: string,
  lastAdvert: number,
  advLat: number,
  advLon: number,
  lastMod: number,
}
export class FRespCodeContact extends Frame {
  static readonly fields = [
    { value: FRespCode.Contact, size: 1, type: FrameFieldType.uint },
    { key: 'publicKey', size: 32, type: FrameFieldType.hexString},
    { key: 'type', size: 1, type: FrameFieldType.uint },
    { key: 'flags', size: 1, type: FrameFieldType.uint },
    { key: 'outPathLen', size: 1, type: FrameFieldType.int },
    { key: 'outPath', size: 64, type: FrameFieldType.bin },
    { key: 'advName', size: 32, type: FrameFieldType.cString },
    { key: 'lastAdvert', size: 4, type: FrameFieldType.uint },
    { key: 'advLat', size: 4, type: FrameFieldType.int, get: (v: number) => v * 1e-6, set: (v: number) => v * 1e6 },
    { key: 'advLon', size: 4, type: FrameFieldType.int, get: (v: number) => v * 1e-6, set: (v: number) => v * 1e6 },
    { key: 'lastMod', size: 4, type: FrameFieldType.uint },
  ];

  publicKey: string;
  type: FAdvType;
  flags: number;
  outPathLen: number;
  outPath: Uint8Array;
  advName: string;
  lastAdvert: number;
  advLat: number;
  advLon: number;
  lastMod: number;

  constructor(params: IRespCodeContact, opts?: FrameOptions) {
    super(params, opts);
    this.publicKey = params.publicKey;
    this.type = params.type;
    this.flags = params.flags;
    this.outPathLen = params.outPathLen;
    this.outPath = params.outPath;
    this.advName = params.advName;
    this.lastAdvert = params.lastAdvert;
    this.advLat = params.advLat;
    this.advLon = params.advLon;
    this.lastMod = params.lastMod;
  }

  public toUint8Array() {
    return Frame.createFrame.call(this, FRespCodeContact.fields);
  }

  static fromUint8Array(rawFrame: Uint8Array) {
    return super.parseFrame(FRespCodeContact.fields, rawFrame)
  }
}

/*
 RESP_CODE_END_OF_CONTACTS {
  code: byte,     // constant 4
  most_recent_lastmod: uint32     // used this for next 'since' param to CMD_GET_CONTACTS
}
*/

interface IRespCodeEndOfContacts {
  mostRecentLastmod: number
}
export class FRespCodeEndOfContacts extends Frame {
  static readonly fields = [
    { value: FRespCode.EndOfContacts, size: 1, type: FrameFieldType.uint },
    { key: 'mostRecentLastmod', size: 4, type: FrameFieldType.uint },
  ];

  mostRecentLastmod: number;

  constructor(params: IRespCodeEndOfContacts, opts?: FrameOptions) {
    super(params, opts);
    this.mostRecentLastmod = params.mostRecentLastmod;
  }

  public toUint8Array() {
    return Frame.createFrame.call(this, FRespCodeEndOfContacts.fields);
  }

  static fromUint8Array(rawFrame: Uint8Array) {
    return super.parseFrame(FRespCodeEndOfContacts.fields, rawFrame)
  }
}

/*
  RESP_CODE_SENT {
    code: byte,   // constant 6
    type: byte,    // how it was sent: 1 = flood, 0 = direct
    expected_ack_code: bytes(4),
    suggested_timeout: uint32   // estimated round-trip timeout, in milliseconds
  }
*/
export interface IRespCodeSent {
  type: FRespCodeType,
  expectedAckCode: number,
  suggestedTimeout: number
}
export class FRespCodeSent extends Frame {
  static readonly fields = [
    { value: FRespCode.Sent, size: 1, type: FrameFieldType.uint },
    { key: 'type', size: 1, type: FrameFieldType.uint },
    { key: 'expectedAckCode', size: 4, type: FrameFieldType.uint },
    { key: 'suggestedTimeout', size: 4, type: FrameFieldType.uint },
  ];

  type: FRespCodeType;
  expectedAckCode: number;
  suggestedTimeout: number;

  constructor(params: IRespCodeSent, opts?: FrameOptions) {
    super(params, opts);
    this.type = params.type;
    this.expectedAckCode = params.expectedAckCode;
    this.suggestedTimeout = params.suggestedTimeout;
  }

  public toUint8Array() {
    return Frame.createFrame.call(this, FRespCodeSent.fields);
  }

  static fromUint8Array(rawFrame: Uint8Array) {
    return super.parseFrame(FRespCodeSent.fields, rawFrame)
  }
}

/*
  RESP_CODE_CONTACT_MSG_RECV {
    code: byte,   // constant 7
    pubkey_prefix: bytes(6),     // just first 6 bytes of sender's public key
    path_len: byte,     // 0xFF if was sent direct, otherwise hop count for flood-mode
    txt_type: byte,     // one of TXT_TYPE_*  (0 = plain)
    sender_timestamp: uint32,
    text: (v: number)archar    // remainder of frame
  }
*/
export interface IRespContactMsgRecv {
  pubKeyPrefix: string,
  pathLen: number,
  txtType: FTxtType,
  senderTimestamp: number,
  text: string,
}
export class FRespContactMsgRecv extends Frame {
  static readonly fields = [
    { value: FRespCode.ContactMsgRecv, size: 1, type: FrameFieldType.uint },
    { key: 'pubKeyPrefix', size: 6, type: FrameFieldType.hexString },
    { key: 'pathLen', size: 1, type: FrameFieldType.uint },
    { key: 'txtType', size: 1, type: FrameFieldType.uint },
    { key: 'senderTimestamp', size: 4, type: FrameFieldType.uint },
    { key: 'text', type: FrameFieldType.string },
  ];

  pubKeyPrefix: string;
  pathLen: number;
  txtType: FTxtType;
  senderTimestamp: number;
  text: string;

  constructor(params: IRespContactMsgRecv, opts?: FrameOptions) {
    super(params, opts);
    this.pubKeyPrefix = params.pubKeyPrefix;
    this.pathLen = params.pathLen;
    this.txtType = params.txtType;
    this.senderTimestamp = params.senderTimestamp;
    this.text = params.text;
  }

  public toUint8Array() {
    return Frame.createFrame.call(this, FRespContactMsgRecv.fields);
  }

  static fromUint8Array(rawFrame: Uint8Array) {
    return super.parseFrame(FRespContactMsgRecv.fields, rawFrame)
  }
}

/*
  CMD_SET_RADIO_PARAMS {
  code: byte,   // constant 11
  radio_freq: uint32,    // freq * 1000
  radio_bw: uint32,      // bandwidth(khz) * 1000
  radio_sf: byte,        // spreading factor
  radio_cr: byte         // coding rate
}
*/
export interface ICmdSetRadioParams {
  radioFreq: number,
  radioBw: number,
  radioSf: number,
  radioCr: number
}

export class FCmdSetRadioParams extends Frame {
  static readonly fields = [
    { value: FCmdCode.SetRadioParams, size: 1, type: FrameFieldType.uint },
    { key: 'radioFreq', size: 4, type: FrameFieldType.uint },
    { key: 'radioBw', size: 4, type: FrameFieldType.uint },
    { key: 'radioSf', size: 1, type: FrameFieldType.uint },
    { key: 'radioCr', size: 1, type: FrameFieldType.uint },
  ];

  radioFreq: number;
  radioBw: number;
  radioSf: number;
  radioCr: number;

  constructor(params: ICmdSetRadioParams, opts?: FrameOptions) {
    super(params, opts);
    this.radioFreq = params.radioFreq;
    this.radioBw = params.radioBw;
    this.radioSf = params.radioSf;
    this.radioCr = params.radioCr;
  }

  public toUint8Array() {
    return Frame.createFrame.call(this, FCmdSetRadioParams.fields);
  }

  static fromUint8Array(rawFrame: Uint8Array) {
    return super.parseFrame(FCmdSetRadioParams.fields, rawFrame)
  }
}

/*
  CMD_SET_RADIO_TX_POWER {
    code: byte,   // constant 12
    tx_power_dbm: byte    // TX power, in dBm
  }
*/
export interface ICmdSetRadioTxPower {
  txPower: number
}
export class FCmdSetRadioTxPower extends Frame {
  static readonly fields = [
    { value: FCmdCode.SetTxPower, size: 1, type: FrameFieldType.uint },
    { key: 'txPower', size: 1, type: FrameFieldType.uint },
  ];

  txPower: number;

  constructor(params: ICmdSetRadioTxPower, opts?: FrameOptions) {
    super(params, opts);
    this.txPower = params.txPower;
  }

  public toUint8Array() {
    return Frame.createFrame.call(this, FCmdSetRadioParams.fields);
  }

  static fromUint8Array(rawFrame: Uint8Array) {
    return super.parseFrame(FCmdSetRadioParams.fields, rawFrame)
  }
}

export class FRespCodeOk extends Frame {
  static readonly fields = [
    { value: FRespCode.Ok, size: 1, type: FrameFieldType.uint },
  ];

  constructor(_: object, opts?: FrameOptions) {
    super(_, opts);
  }

  public toUint8Array() {
    return Frame.createFrame.call(this, FRespCodeEndOfContacts.fields);
  }

  static fromUint8Array(rawFrame: Uint8Array) {
    return super.parseFrame(FRespCodeEndOfContacts.fields, rawFrame)
  }
}

export class FRespCodeErr extends Frame {
  static readonly fields = [
    { value: FRespCode.Err, size: 1, type: FrameFieldType.uint },
  ];

  constructor(_: object, opts?: FrameOptions) {
    super(_, opts);
  }

  public toUint8Array() {
    return Frame.createFrame.call(this, FRespCodeEndOfContacts.fields);
  }

  static fromUint8Array(rawFrame: Uint8Array) {
    return super.parseFrame(FRespCodeEndOfContacts.fields, rawFrame)
  }
}

const SerialFrameType = {
  Incoming: 0x3e,
  Outgoing: 0x3c
}

interface SerialFrameHeader {
  isReply: boolean,
  length: number
}

export class SerialFrame {
  static createFrame(frame: Uint8Array) {
    const frameHeader = new Uint8Array(3);
    frameHeader[0] = SerialFrameType.Outgoing;

    const frameHeaderView = new DataView(frameHeader.buffer);

    if (frame.length > 0xffff)
      throw new Error(` frame serial size exceeded. Max size: 65535, current size: ${frame.length}`);

    frameHeaderView.setUint16(1, frame.length, true);
    return uint8ArrayConcat([frameHeader, frame]);
  }

  static parseHeader(frameHeader: Uint8Array): SerialFrameHeader {
    if(frameHeader.length !== 3) {
      throw new Error(`Frame header has invalid length. Expected: 3, Got: ${frameHeader.length}`);
    }

    if(!(frameHeader[0] === SerialFrameType.Incoming || frameHeader[0] === SerialFrameType.Outgoing)) {
      throw new Error(`Unsupported frame header type "${frameHeader[0].toString(16).padStart(2, '0')}"`)
    }

    const bodyLength = new DataView(frameHeader.buffer).getUint16(1, true);
    if(!bodyLength) {
      throw new Error(`Frame should always have non-zero size`);
    }

    return {
      isReply: frameHeader[0] === SerialFrameType.Incoming,
      length: bodyLength
    };
  }

  static parseBody(frameHeader: SerialFrameHeader, frameBody: Uint8Array): Frame | null {
    const frameCode = frameBody[0];
    console.log({frameHeader, frameCode}, frameCode === FRespCode.SelfInfo);

    if(frameHeader.isReply) {
      switch (frameCode) {
        case FRespCode.SelfInfo: return FRespCodeSelfInfo.fromUint8Array(frameBody);
        case FRespCode.ContactsStart: return FRespCodeContactsStart.fromUint8Array(frameBody);
        case FRespCode.Contact: return FRespCodeContact.fromUint8Array(frameBody);
        case FRespCode.EndOfContacts: return FRespCodeEndOfContacts.fromUint8Array(frameBody);
        case FRespCode.Sent: return FRespCodeSent.fromUint8Array(frameBody);
        case FRespCode.ContactMsgRecv: return FRespContactMsgRecv.fromUint8Array(frameBody);
        case FRespCode.Ok: return new FRespCodeOk({});
        case FRespCode.Err: return new FRespCodeErr({});
      }
    } else {
      switch (frameCode) {
        case FCmdCode.AppStart: return FCmdAppStart.fromUint8Array(frameBody);
        case FCmdCode.GetContacts: return FCmdGetContacts.fromUint8Array(frameBody);
        case FCmdCode.AddUpdateContact: return FCmdAddUpdateContact.fromUint8Array(frameBody);
        case FCmdCode.SetDeviceTime: return FCmdSetDeviceTime.fromUint8Array(frameBody);
        case FCmdCode.SendSelfAdvert: return FCmdSendSelfAdvert.fromUint8Array(frameBody);
        case FCmdCode.SetAdvertName: return FCmdSetAdvertName.fromUint8Array(frameBody);
        case FCmdCode.SendTxtMsg: return FCmdSendTxtMsg.fromUint8Array(frameBody);
        case FCmdCode.SetRadioParams: return FCmdSetRadioParams.fromUint8Array(frameBody);
      }
   }

    throw new Error(`Unknown frame code: ${frameCode}`);
  }
}