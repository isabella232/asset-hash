import { createHash } from "crypto"
import { createReadStream } from "fs"
import { extname } from "path"

import BigInt from "big.js"
import { MetroHash128, MetroHash64 } from "metrohash"

// optional xxhash module
let xxhash = null

try {
  // eslint-disable-next-line global-require, node/no-missing-require
  xxhash = require("xxhash")
} catch (importError) {
  // We don't care about import issues as this is an optional dependency.
}

const XXHash32 = xxhash ? xxhash : null
const XXHash64 = xxhash ? xxhash.XXHash64 : null

const DEFAULT_HASH = "metrohash128"
const DEFAULT_ENCODING = "base52"
const DEFAULT_MAX_LENGTH = 8

const XXHASH_CONSTRUCT = 0xcafebabe

const baseEncodeTables = {
  26: "abcdefghijklmnopqrstuvwxyz",
  32: "123456789abcdefghjkmnpqrstuvwxyz", // no 0lio
  36: "0123456789abcdefghijklmnopqrstuvwxyz",
  49: "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ", // no lIO
  52: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
  58: "123456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ", // no 0lIO
  62: "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"

  // Note: `base64` is implemented using native NodeJS APIs.
  // 64: "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-_"
}

export function baseEncode(buffer, base) {
  const baseNum = typeof base === "number" ? base : (/\d+/).exec(base)[0]
  const encodeTable = baseEncodeTables[baseNum]
  if (!encodeTable) {
    throw new Error(`Unknown base encoding ${base}!`)
  }

  const length = buffer.length

  BigInt.DP = 0
  BigInt.RM = 0

  let current = new BigInt(0)

  for (let i = length - 1; i >= 0; i--) {
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

function computeDigest(bufferOrString, { encoding, maxLength } = {}) {
  let output = ""

  const isString = typeof bufferOrString === "string"

  if (isString && encoding === "hex") {
    output = bufferOrString
  } else {
    const buffer = isString
      ? Buffer.from(bufferOrString, "hex")
      : bufferOrString

    if (encoding === "hex" || encoding === "base64" || encoding === "utf8") {
      output = buffer.toString(encoding)
    } else {
      output = baseEncode(buffer, encoding)
    }
  }

  return maxLength == null || output.length <= maxLength
    ? output
    : output.slice(0, maxLength)
}

export class Hasher {
  constructor(options = {}) {
    this._hasher = createHasher(options.hash || DEFAULT_HASH)
    this._encoding = options.encoding || DEFAULT_ENCODING
    this._maxLength = options.maxLength || null
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
  let hasher

  if (hash === "xxhash32") {
    if (!XXHash32) {
      throw new Error("Install xxhash module to use xxhash32 hasher")
    }
    hasher = new XXHash32(XXHASH_CONSTRUCT)
  } else if (hash === "xxhash64") {
    if (!XXHash64) {
      throw new Error("Install xxhash module to use xxhash64 hasher")
    }
    hasher = new XXHash64(XXHASH_CONSTRUCT)
  } else if (hash === "metrohash64") {
    hasher = new MetroHash64()
  } else if (hash === "metrohash128") {
    hasher = new MetroHash128()
  } else {
    hasher = createHash(hash)
  }

  return hasher
}

export function getHash(fileName, options) {
  const { hash, encoding, maxLength } = options || {}
  return new Promise((resolve, reject) => {
    try {
      const hasher = createHasher(hash || DEFAULT_HASH)

      createReadStream(fileName)
        .on("data", (data) => {
          hasher.update(data)
        })
        .on("error", (error) => {
          reject(error)
        })
        .on("end", () => {
          try {
            const digest = computeDigest(hasher.digest("buffer"), {
              encoding: encoding || DEFAULT_ENCODING,
              maxLength: maxLength || DEFAULT_MAX_LENGTH
            })

            resolve(digest)
          } catch (error) {
            reject(error)
          }
        })
    } catch (error) {
      reject(error)
    }
  })
}

export async function getHashedName(fileName, options) {
  const hashed = await getHash(fileName, options)
  const extension = extname(fileName)

  return hashed + extension
}
