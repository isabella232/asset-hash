import { createHash } from "crypto"
import { createReadStream } from "fs"
import { extname } from "path"
import BigInt from "big.js"
import { Stream, default as XXHash } from "xxhash"

const DEFAULT_HASH = "xxhash"
const DEFAULT_ENCODING = "base52"
const DEFAULT_MAX_LENGTH = 16

const XXHASH_CONSTRUCT = 0xCAFEBABE

const baseEncodeTables = {
  26: "abcdefghijklmnopqrstuvwxyz",
  32: "123456789abcdefghjkmnpqrstuvwxyz", // no 0lio
  36: "0123456789abcdefghijklmnopqrstuvwxyz",
  49: "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ", // no lIO
  52: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
  58: "123456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ", // no 0lIO
  62: "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
  64: "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-_"
}

export function baseEncode(buffer, base) {
  const baseNum = typeof base === "number" ? base : (/[0-9]+/).exec(base)[0]
  const encodeTable = baseEncodeTables[baseNum]
  if (!encodeTable) {
    throw new Error(`Unknown base encoding ${base}!`)
  }

  const readLength = buffer.length

  BigInt.DP = 0
  BigInt.RM = 0

  let current = new BigInt(0)
  for (let i = readLength - 1; i >= 0; i--) {
    current = current.times(256).plus(buffer[i])
  }

  let output = ""
  while (current.gt(0)) {
    output = encodeTable[current.mod(baseNum)] + output
    current = current.div(baseNum)
  }

  BigInt.DP = 20
  BigInt.RM = 1

  return output
}

export function computeDigest(
  buffer,
  { encoding = DEFAULT_ENCODING, maxLength = DEFAULT_MAX_LENGTH } = {}
) {
  let output = ""

  if (encoding === "hex" || encoding === "base64" || encoding === "utf8") {
    output = buffer.toString(encoding)
  } else {
    output = baseEncode(buffer, encoding)
  }

  return maxLength == null || output.length <= maxLength ?
    output :
    output.slice(0, maxLength)
}

export class Hasher {
  constructor(options = {}) {
    this._hasher = createHasher(options.hash || DEFAULT_HASH)
    this._encoding = options.encoding || DEFAULT_ENCODING
    this._maxLength = options.maxLength || DEFAULT_MAX_LENGTH
  }

  update(data) {
    const buffer =
      data instanceof Buffer ? data : Buffer.from(data.toString(), "utf-8")
    return this._hasher.update(buffer)
  }

  digest(encoding, maxLength) {
    return computeDigest(this._hasher.digest("buffer"), {
      encoding: encoding || this._encoding,
      maxLength: maxLength || this._maxLength
    })
  }
}

export function createHasher(hash) {
  return hash === "xxhash" ? new XXHash(XXHASH_CONSTRUCT) : createHash(hash)
}

export function createStreamingHasher(hash) {
  return hash === "xxhash" ? new Stream(XXHASH_CONSTRUCT, "buffer") : createHash(hash)
}

// eslint-disable-next-line max-params
export function getHash(
  fileName,
  {
    hash = DEFAULT_HASH,
    encoding = DEFAULT_ENCODING,
    maxLength = DEFAULT_MAX_LENGTH
  } = {}
) {
  return new Promise((resolve, reject) => {
    try {
      const hasher = createStreamingHasher(hash)

      createReadStream(fileName)
        .pipe(hasher)
        .on("finish", () => {
          try {
            resolve(computeDigest(hasher.read(), { encoding, maxLength }))
          } catch (error) {
            reject(error)
          }
        })
    } catch (err) {
      reject(err)
    }
  })
}

export async function getHashedName(fileName, options) {
  const hashed = await getHash(fileName, options)
  const extension = extname(fileName)

  return hashed + extension
}
