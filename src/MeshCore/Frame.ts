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
  fields: FrameField[];
  #opts: FrameOptions;
  #params: object;
  #uint8Array: Uint8Array;

  constructor(paramsOrUint8Array: object, fields: FrameField[], opts?: FrameOptions) {
    this.#opts = opts ?? { debug: false };
    this.fields = fields;

    if(paramsOrUint8Array instanceof Uint8Array) {
      this.#uint8Array = paramsOrUint8Array
      this.#params = {};
      if(this.#uint8Array.length == 0) {
        throw new Error('Frame input data cannot be empty');
      }
    } else {
      this.#params = paramsOrUint8Array;
      this.#uint8Array = new Uint8Array();
      if(this.fields.length > 1 && Object.keys(this.#params).length === 0) {
        throw new Error('Invalid Frame Definition');
      }
    }
  };

  public toUint8Array() {
    return this.createFrame();
  }

  public parse() {
    return {
      code: this.fields[0].value,
      ...this.parseFrame(this.#uint8Array)
    }
  }

  private createFrame() {
    const textEncoder = new TextEncoder();
    const frameParts = [];

    for (const field of this.fields) {
      let value = field.value;

      // 1. Handle undefined/null values and optional fields:
      if (value == null) {
        if (field.key && this.#params.hasOwnProperty(field.key)) {
          // @ts-expect-error - Accessing a property that exists on the instance
          value = this.#params[field.key];
        }

        if (value == null) {
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
        frameParts.push(hexToUint8Array(value, field.size));
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

  private parseFrame(rawFrame: Uint8Array) {
    const fields = this.constructor.prototype.fields;
    let index = 0;
    const textDecoder = new TextDecoder();
    const resultParams: { [key: string]: string | number | Uint8Array } = {};
    const rawFrameView = new DataView(rawFrame.buffer);

    for (let i = 0; i < this.fields.length; i++) {
      const field = this.fields[i];

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
        if (field.optional && index + field.size > rawFrame.length) {
          // Skip optional field if not enough data is available
          continue;
        }

        if (index + field.size > rawFrame.length) {
          throw new Error(`Frame too short for field ${field.key}`);
        }

        if (field.type === FrameFieldType.bin) {
          resultParams[field.key] = rawFrame.slice(index, index + field.size);
        } else if (field.type === FrameFieldType.hexString) {
          resultParams[field.key] = uint8ArrayToHex(rawFrame.slice(index, index + field.size));
        } else if (field.type === FrameFieldType.cString) {
          const end = rawFrame.indexOf(0, index);
          if (end === -1) {
            throw new Error(`Unterminated C string for field ${field.key}`);
          }
          resultParams[field.key] = textDecoder.decode(rawFrame.slice(index, end));
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

          resultParams[field.key] = fieldValue;
        }

        index += field.size;
      }

      // Variable length string, must be the last field
      else if (field.type === FrameFieldType.string) {
        if (i !== this.fields.length - 1) {
          throw new Error('String type fields must be the last field');
        }

        resultParams[field.key] = textDecoder.decode(rawFrame.slice(index));
        index = rawFrame.length;
      }
    }

    return resultParams;
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
  constructor(paramsOrUint8Array: ICmdAppStart | Uint8Array, opts?: FrameOptions) {
        const fields = [
        { value: FCmdCode.AppStart, size: 1, type: FrameFieldType.uint },
        { key: 'appVer', size: 1, type: FrameFieldType.uint },
        { value: new Uint8Array(6), type: FrameFieldType.bin },
        { key: 'appName', type: FrameFieldType.string }
    ];
    super(paramsOrUint8Array, fields, opts);
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
  constructor(paramsOrUint8Array: ICmdGetContacts | Uint8Array, opts?: FrameOptions) {
    const fields = [
      { value: FCmdCode.GetContacts, size: 1, type: FrameFieldType.uint },
      { key: 'since', size: 4, type: FrameFieldType.uint, optional: true },
    ];
    super(paramsOrUint8Array, fields, opts);
  }
}

/*
  CMD_ADD_UPDATE_CONTACT {
    code: byte,   // constant 9
    public_key: bytes(32),
    type: byte,   // one of ADV_TYPE_*
    flags: byte,
    out_path_len: signed-byte,
    out_path: bytes(64),
    adv_name: chars(32),    // null terminated
    last_advert: uint32
    (optional) adv_lat: int32,    // advertised latitude * 1E6
    (optional) adv_lon: int32,    // advertised longitude * 1E6
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
  constructor(paramsOrUint8Array: ICmdAddUpdateContact | Uint8Array, opts?: FrameOptions) {
    const fields = [
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
    super(paramsOrUint8Array, fields, opts);
  }
}

/*
  CMD_GET_DEVICE_TIME {
    code: byte,   // constant 5
  }
*/
export class FCmdGetDeviceTime extends Frame {
  constructor(opts?: FrameOptions) {
    const fields = [
      { value: FCmdCode.GetDeviceTime, size: 1, type: FrameFieldType.uint },
    ];
    super({}, fields, opts);
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
  constructor(paramsOrUint8Array: ICmdSetDeviceTime | Uint8Array, opts?: FrameOptions) {
    const fields = [
      { value: FCmdCode.SetDeviceTime, size: 1, type: FrameFieldType.uint },
      { key: 'epochSecs', size: 4, type: FrameFieldType.uint },
    ];
    super(paramsOrUint8Array, fields, opts);
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
  constructor(paramsOrUint8Array: ICmdSendSelfAdvert | Uint8Array, opts?: FrameOptions) {
    const fields = [
      { value: FCmdCode.SendSelfAdvert, size: 1, type: FrameFieldType.uint },
      { key: 'type', size: 1, type: FrameFieldType.uint, optional: true },
    ];
    super(paramsOrUint8Array, fields, opts);
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
  constructor(paramsOrUint8Array: ICmdSetAdvertName | Uint8Array, opts?: FrameOptions) {
    const fields = [
      { value: FCmdCode.SetAdvertName, size: 1, type: FrameFieldType.uint },
      { key: 'name', type: FrameFieldType.string },
    ];
    super(paramsOrUint8Array, fields, opts);
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
  constructor(paramsOrUint8Array: ICmdSendTxtMsg | Uint8Array, opts?: FrameOptions) {
    const fields = [
      { value: FCmdCode.SendTxtMsg, size: 1, type: FrameFieldType.uint },
      { key: 'txtType', size: 1, type: FrameFieldType.uint },
      { key: 'attempt', size: 1, type: FrameFieldType.uint },
      { key: 'senderTimestamp', size: 4, type: FrameFieldType.uint },
      { key: 'pubKeyPrefix', size: 6, type: FrameFieldType.hexString },
      { key: 'text', type: FrameFieldType.string },
    ];
    super(paramsOrUint8Array, fields, opts);
  }
}

export class FCmdSyncNextMessage extends Frame {
  constructor(paramsOrUint8Array?: Uint8Array | null, opts?: FrameOptions) {
    const fields = [
      { value: FCmdCode.SyncNextMessage, size: 1, type: FrameFieldType.uint },
    ];
    super(paramsOrUint8Array ?? {}, fields, opts);
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
  constructor(paramsOrUint8Array: IRespCodeSelfInfo | Uint8Array, opts?: FrameOptions) {
    const fields = [
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
    super(paramsOrUint8Array, fields, opts);
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
  constructor(paramsOrUint8Array: IRespCodeContactsStart | Uint8Array, opts?: FrameOptions) {
    const fields = [
      { value: FRespCode.ContactsStart, size: 1, type: FrameFieldType.uint },
      { key: 'count', size: 4, type: FrameFieldType.uint },
    ];
    super(paramsOrUint8Array, fields, opts);
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
  constructor(paramsOrUint8Array: IRespCodeContact | Uint8Array, opts?: FrameOptions) {
    const fields = [
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
    super(paramsOrUint8Array, fields, opts);
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
  constructor(paramsOrUint8Array: IRespCodeEndOfContacts | Uint8Array, opts?: FrameOptions) {
    const fields = [
      { value: FRespCode.EndOfContacts, size: 1, type: FrameFieldType.uint },
      { key: 'mostRecentLastmod', size: 4, type: FrameFieldType.uint },
    ];
    super(paramsOrUint8Array, fields, opts);
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
  constructor(paramsOrUint8Array: IRespCodeSent | Uint8Array, opts?: FrameOptions) {
    const fields = [
      { value: FRespCode.Sent, size: 1, type: FrameFieldType.uint },
      { key: 'type', size: 1, type: FrameFieldType.uint },
      { key: 'expectedAckCode', size: 4, type: FrameFieldType.uint },
      { key: 'suggestedTimeout', size: 4, type: FrameFieldType.uint },
    ];
    super(paramsOrUint8Array, fields, opts);
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
  constructor(paramsOrUint8Array: IRespContactMsgRecv | Uint8Array, opts?: FrameOptions) {
    const fields = [
      { value: FRespCode.ContactMsgRecv, size: 1, type: FrameFieldType.uint },
      { key: 'pubKeyPrefix', size: 6, type: FrameFieldType.hexString },
      { key: 'pathLen', size: 1, type: FrameFieldType.uint },
      { key: 'txtType', size: 1, type: FrameFieldType.uint },
      { key: 'senderTimestamp', size: 4, type: FrameFieldType.uint },
      { key: 'text', type: FrameFieldType.string },
    ];
    super(paramsOrUint8Array, fields, opts);
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
  constructor(paramsOrUint8Array: ICmdSetRadioParams | Uint8Array, opts?: FrameOptions) {
    const fields = [
      { value: FCmdCode.SetRadioParams, size: 1, type: FrameFieldType.uint },
      { key: 'radioFreq', size: 4, type: FrameFieldType.uint },
      { key: 'radioBw', size: 4, type: FrameFieldType.uint },
      { key: 'radioSf', size: 1, type: FrameFieldType.uint },
      { key: 'radioCr', size: 1, type: FrameFieldType.uint },
    ];
    super(paramsOrUint8Array, fields, opts);
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
  constructor(paramsOrUint8Array: ICmdSetRadioTxPower | Uint8Array, opts?: FrameOptions) {
    const fields = [
      { value: FCmdCode.SetTxPower, size: 1, type: FrameFieldType.uint },
      { key: 'txPower', size: 1, type: FrameFieldType.uint },
    ];
    super(paramsOrUint8Array, fields, opts);
  }
}

export interface IRespCodeOk {
  epochSecs?: number
}
export class FRespCodeOk extends Frame {
  constructor(paramsOrUint8Array: IRespCodeOk | Uint8Array, opts?: FrameOptions) {
    const fields = [
      { value: FRespCode.Ok, size: 1, type: FrameFieldType.uint },
      { key: 'epochSecs', size: 4, type: FrameFieldType.uint, optional: true },
    ];
    super(paramsOrUint8Array, fields, opts);
  }
}

export class FRespCodeErr extends Frame {
  constructor(uint8Array?: Uint8Array, opts?: FrameOptions) {
    const fields = [
      { value: FRespCode.Err, size: 1, type: FrameFieldType.uint },
    ];
    super(uint8Array ?? {}, fields, opts);
  }
}

export interface IPushAdvert {
  publicKey: string
}
export class FPushAdvert extends Frame {
  constructor(paramsOrUint8Array: IPushAdvert | Uint8Array, opts?: FrameOptions) {
    const fields = [
      { value: FPushCode.Advert, size: 1, type: FrameFieldType.uint },
      { key: 'publicKey', type: FrameFieldType.hexString, size: 32 },
    ];
    super(paramsOrUint8Array, fields, opts);
  }
}

export interface IPushPathUpdated {
  publicKey: string
}
export class FPushPathUpdated extends Frame {
  constructor(paramsOrUint8Array: IPushPathUpdated | Uint8Array, opts?: FrameOptions) {
    const fields = [
      { value: FPushCode.PathUpdated, size: 1, type: FrameFieldType.uint },
      { key: 'publicKey', type: FrameFieldType.hexString, size: 32 },
    ];
    super(paramsOrUint8Array, fields, opts);
  }
}

export interface IPushSendConfirmed {
  ackCode: string,
  roundTrip: number,
}
export class FPushSendConfirmed extends Frame {
  constructor(paramsOrUint8Array: IPushSendConfirmed | Uint8Array, opts?: FrameOptions) {
    const fields = [
      { value: FPushCode.SendConfirmed, size: 1, type: FrameFieldType.uint },
      { key: 'ackCode', type: FrameFieldType.hexString, size: 4 },
      { key: 'roundTrip', type: FrameFieldType.uint, size: 4 },
    ];
    super(paramsOrUint8Array, fields, opts);
  }
}

export class FPushMsgWaiting extends Frame {
  constructor(uint8Array?: Uint8Array, opts?: FrameOptions) {
    const fields = [
      { value: FPushCode.MsgWaiting, size: 1, type: FrameFieldType.uint },
    ];
    super(uint8Array ?? {}, fields, opts);
  }
}

/*****************
 *  SerialFrame  *
******************/
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

  static parseBody(frameHeader: SerialFrameHeader, frameBody: Uint8Array): object | null {
    const frameCode = frameBody[0];
    if(frameHeader.isReply) {
      switch (frameCode) {
        // push codes
        case FPushCode.Advert: return new FPushAdvert(frameBody).parse();
        case FPushCode.PathUpdated: return new FPushPathUpdated(frameBody).parse();
        case FPushCode.SendConfirmed: return new FPushSendConfirmed(frameBody).parse();
        case FPushCode.MsgWaiting: return new FPushMsgWaiting(frameBody).parse();

        // command responses
        case FRespCode.SelfInfo: return new FRespCodeSelfInfo(frameBody).parse();
        case FRespCode.ContactsStart: return new FRespCodeContactsStart(frameBody).parse();
        case FRespCode.Contact: return new FRespCodeContact(frameBody).parse();
        case FRespCode.EndOfContacts: return new FRespCodeEndOfContacts(frameBody).parse();
        case FRespCode.Sent: return new FRespCodeSent(frameBody).parse();
        case FRespCode.ContactMsgRecv: return new FRespContactMsgRecv(frameBody).parse();
        case FRespCode.Ok: return new FRespCodeOk(frameBody).parse();
        case FRespCode.Err: return new FRespCodeErr(frameBody).parse();
      }
    } else {
      // we shoudn't be needing to parse commands apart from testing
      switch (frameCode) {
        case FCmdCode.AppStart: return new FCmdAppStart(frameBody).parse();
        case FCmdCode.GetContacts: return new FCmdGetContacts(frameBody).parse();
        case FCmdCode.AddUpdateContact: return new FCmdAddUpdateContact(frameBody).parse();
        case FCmdCode.SetDeviceTime: return new FCmdSetDeviceTime(frameBody).parse();
        case FCmdCode.SendSelfAdvert: return new FCmdSendSelfAdvert(frameBody).parse();
        case FCmdCode.SetAdvertName: return new FCmdSetAdvertName(frameBody).parse();
        case FCmdCode.SendTxtMsg: return new FCmdSendTxtMsg(frameBody).parse();
        case FCmdCode.SetRadioParams: return new FCmdSetRadioParams(frameBody).parse();
      }
   }

    throw new Error(`Unknown frame code: ${frameCode}`);
  }
}