export class Struct {
  static Types = {
    Int8: 'Int8',
    Uint8: 'Uint8',
    Int16: 'Int16',
    Uint16: 'Uint16',
    Int32: 'Int32',
    Uint32: 'Uint32',
    BigInt64: 'BigInt64',
    BigUint64: 'BigUint64',
    Float32: 'Float32',
    Float64: 'Float64',
    ByteArray: 'ByteArray',
    Skip: 'Skip'
  }

  constructor(...propertyInfos) {
    this.properties = propertyInfos;
    this.byteLength = propertyInfos.map(propertyInfo => propertyInfo.byteLength).reduce((accumulator, current) => accumulator + current);
    this.getObject = this.createObject;
    this.getObjects = this.createArray;
  }

  createArray(arrayBuffer, startOffset, numberOfObjects, isLittleEndian) {
    const endPosition = startOffset + numberOfObjects * this.byteLength;

    const objects = [];

    for (let i = startOffset; i < endPosition; i += this.byteLength) {
      objects.push(this.createObject(arrayBuffer, i, isLittleEndian));
    }

    return objects;
  }

  createObject(arrayBuffer, startOffset, isLittleEndian) {
    const createdObject = {
      offsetTo: {}
    };

    createdObject.dataView = new DataView(arrayBuffer);
    createdObject.isLittleEndian = isLittleEndian;

    let runningOffset = startOffset;

    this.properties.forEach(property => {
      createdObject.offsetTo[property.propertyName] = runningOffset;

      switch (property.propertyType) {
        case Struct.Types.Int8:
          Object.defineProperty(createdObject, property.propertyName, {
            get: () => createdObject.dataView.getInt8(createdObject.offsetTo[property.propertyName], createdObject.isLittleEndian),
            set: value => createdObject.dataView.setInt8(createdObject.offsetTo[property.propertyName], value, createdObject.isLittleEndian),
          });
          break;

        case Struct.Types.Uint8:
          Object.defineProperty(createdObject, property.propertyName, {
            get: () => createdObject.dataView.getUint8(createdObject.offsetTo[property.propertyName], createdObject.isLittleEndian),
            set: value => createdObject.dataView.setUint8(createdObject.offsetTo[property.propertyName], value, createdObject.isLittleEndian),
          });
          break;

        case Struct.Types.Int16:
          Object.defineProperty(createdObject, property.propertyName, {
            get: () => createdObject.dataView.getInt16(createdObject.offsetTo[property.propertyName], createdObject.isLittleEndian),
            set: value => createdObject.dataView.setInt16(createdObject.offsetTo[property.propertyName], value, createdObject.isLittleEndian),
          });
          break;

        case Struct.Types.Uint16:
          Object.defineProperty(createdObject, property.propertyName, {
            get: () => createdObject.dataView.getUint16(createdObject.offsetTo[property.propertyName], createdObject.isLittleEndian),
            set: value => createdObject.dataView.setUint16(createdObject.offsetTo[property.propertyName], value, createdObject.isLittleEndian),
          });
          break;

        case Struct.Types.Int32:
          Object.defineProperty(createdObject, property.propertyName, {
            get: () => createdObject.dataView.getInt32(createdObject.offsetTo[property.propertyName], createdObject.isLittleEndian),
            set: value => createdObject.dataView.setInt32(createdObject.offsetTo[property.propertyName], value, createdObject.isLittleEndian),
          });
          break;

        case Struct.Types.Uint32:
          Object.defineProperty(createdObject, property.propertyName, {
            get: () => createdObject.dataView.getUint32(createdObject.offsetTo[property.propertyName], createdObject.isLittleEndian),
            set: value => createdObject.dataView.setUint32(createdObject.offsetTo[property.propertyName], value, createdObject.isLittleEndian),
          });
          break;

        case Struct.Types.BigInt64:
          Object.defineProperty(createdObject, property.propertyName, {
            get: () => createdObject.dataView.getBigInt64(createdObject.offsetTo[property.propertyName], createdObject.isLittleEndian),
            set: value => createdObject.dataView.setBigInt64(createdObject.offsetTo[property.propertyName], value, createdObject.isLittleEndian),
          });
          break;

        case Struct.Types.BigUint64:
          Object.defineProperty(createdObject, property.propertyName, {
            get: () => createdObject.dataView.getBigUint64(createdObject.offsetTo[property.propertyName], createdObject.isLittleEndian),
            set: value => createdObject.dataView.setBigUint64(createdObject.offsetTo[property.propertyName], value, createdObject.isLittleEndian),
          });
          break;

        case Struct.Types.Float32:
          Object.defineProperty(createdObject, property.propertyName, {
            get: () => createdObject.dataView.getFloat32(createdObject.offsetTo[property.propertyName], createdObject.isLittleEndian),
            set: value => createdObject.dataView.setFloat32(createdObject.offsetTo[property.propertyName], value, createdObject.isLittleEndian),
          });
          break;

        case Struct.Types.Float64:
          Object.defineProperty(createdObject, property.propertyName, {
            get: () => createdObject.dataView.getFloat64(createdObject.offsetTo[property.propertyName], createdObject.isLittleEndian),
            set: value => createdObject.dataView.setFloat64(createdObject.offsetTo[property.propertyName], value, createdObject.isLittleEndian),
          });
          break;

          case Struct.Types.ByteArray:
            Object.defineProperty(createdObject, property.propertyName, {
              get: () => {
                const startOffset = createdObject.offsetTo[property.propertyName];
                return new Uint8Array(createdObject.dataView.buffer, startOffset, property.byteLength);
              },

              set: value => {
                if (!(value instanceof Uint8Array)) {
                  throw new Error('Incorrect type. Byte Arrays may only be type Uint8Array');
                }

                if (value.length !== property.byteLength) {
                  throw new Error(`Incorrect Uint8Array length. ${value} has a length of ${value.length}, but ${property.propertyName} must have a length of ${property.byteLength}`);
                }

                const startOffset = createdObject.offsetTo[property.propertyName];
                const endPosition = startOffset + property.byteLength;


                for (let i = startOffset, j = 0; i < endPosition; i++, j++) {
                  createdObject.dataView.setUint8(i, value[j]);
                }
              }
            });
      }

      runningOffset += property.byteLength;
    });

    createdObject.byteLength = runningOffset - startOffset;
    createdObject.nextOffset = runningOffset;
    createdObject.endPosition = runningOffset - 1;

    return createdObject;
  }

  static Int8(propertyName) {
    return {
      propertyName,
      propertyType: Struct.Types.Int8,
      byteLength: 1,
    }
  }

  static Uint8(propertyName) {
    return {
      propertyName,
      propertyType: Struct.Types.Uint8,
      byteLength: 1,
    }
  }

  static Int16(propertyName) {
    return {
      propertyName,
      propertyType: Struct.Types.Int16,
      byteLength: 2,
    }
  }

  static Uint16(propertyName) {
    return {
      propertyName,
      propertyType: Struct.Types.Uint16,
      byteLength: 2,
    }
  }

  static Int32(propertyName) {
    return {
      propertyName,
      propertyType: Struct.Types.Int32,
      byteLength: 4,
    }
  }

  static Uint32(propertyName) {
    return {
      propertyName,
      propertyType: Struct.Types.Uint32,
      byteLength: 4,
    }
  }

  static BigInt64(propertyName) {
    return {
      propertyName,
      propertyType: Struct.Types.BigInt64,
      byteLength: 8,
    }
  }

  static BigUint64(propertyName) {
    return {
      propertyName,
      propertyType: Struct.Types.BigUint64,
      byteLength: 8,
    }
  }

  static Float32(propertyName) {
    return {
      propertyName,
      propertyType: Struct.Types.Float32,
      byteLength: 4,
    }
  }

  static Float64(propertyName) {
    return {
      propertyName,
      propertyType: Struct.Types.Float64,
      byteLength: 8,
    }
  }

  static ByteArray(propertyName, length) {
    return {
      propertyName,
      propertyType: Struct.Types.ByteArray,
      byteLength: length,
    }
  }

  static Skip(byteLength) {
    return {
      propertyType: Struct.Types.Skip,
      byteLength
    }
  }
}