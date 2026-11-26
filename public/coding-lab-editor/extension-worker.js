(function webpackUniversalModuleDefinition(root, factory) {
	if(typeof exports === 'object' && typeof module === 'object')
		module.exports = factory();
	else if(typeof define === 'function' && define.amd)
		define([], factory);
	else if(typeof exports === 'object')
		exports["VirtualMachine"] = factory();
	else
		root["VirtualMachine"] = factory();
})(globalThis, () => {
return /******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ 2589
(module, __unused_webpack_exports, __webpack_require__) {

const log = __webpack_require__(3707);

/**
 * @typedef {object} DispatchCallMessage - a message to the dispatch system representing a service method call
 * @property {*} responseId - send a response message with this response ID. See {@link DispatchResponseMessage}
 * @property {string} service - the name of the service to be called
 * @property {string} method - the name of the method to be called
 * @property {Array|undefined} args - the arguments to be passed to the method
 */

/**
 * @typedef {object} DispatchResponseMessage - a message to the dispatch system representing the results of a call
 * @property {*} responseId - a copy of the response ID from the call which generated this response
 * @property {*|undefined} error - if this is truthy, then it contains results from a failed call (such as an exception)
 * @property {*|undefined} result - if error is not truthy, then this contains the return value of the call (if any)
 */

/**
 * @typedef {DispatchCallMessage|DispatchResponseMessage} DispatchMessage
 * Any message to the dispatch system.
 */

/**
 * The SharedDispatch class is responsible for dispatch features shared by
 * {@link CentralDispatch} and {@link WorkerDispatch}.
 */
class SharedDispatch {
  constructor() {
    /**
     * List of callback registrations for promises waiting for a response from a call to a service on another
     * worker. A callback registration is an array of [resolve,reject] Promise functions.
     * Calls to local services don't enter this list.
     * @type {Array.<Function[]>}
     */
    this.callbacks = [];

    /**
     * The next response ID to be used.
     * @type {int}
     */
    this.nextResponseId = 0;
  }

  /**
   * Call a particular method on a particular service, regardless of whether that service is provided locally or on
   * a worker. If the service is provided by a worker, the `args` will be copied using the Structured Clone
   * algorithm, except for any items which are also in the `transfer` list. Ownership of those items will be
   * transferred to the worker, and they should not be used after this call.
   * @example
   *      dispatcher.call('vm', 'setData', 'cat', 42);
   *      // this finds the worker for the 'vm' service, then on that worker calls:
   *      vm.setData('cat', 42);
   * @param {string} service - the name of the service.
   * @param {string} method - the name of the method.
   * @param {*} [args] - the arguments to be copied to the method, if any.
   * @returns {Promise} - a promise for the return value of the service method.
   */
  call(service, method, ...args) {
    return this.transferCall(service, method, null, ...args);
  }

  /**
   * Call a particular method on a particular service, regardless of whether that service is provided locally or on
   * a worker. If the service is provided by a worker, the `args` will be copied using the Structured Clone
   * algorithm, except for any items which are also in the `transfer` list. Ownership of those items will be
   * transferred to the worker, and they should not be used after this call.
   * @example
   *      dispatcher.transferCall('vm', 'setData', [myArrayBuffer], 'cat', myArrayBuffer);
   *      // this finds the worker for the 'vm' service, transfers `myArrayBuffer` to it, then on that worker calls:
   *      vm.setData('cat', myArrayBuffer);
   * @param {string} service - the name of the service.
   * @param {string} method - the name of the method.
   * @param {Array} [transfer] - objects to be transferred instead of copied. Must be present in `args` to be useful.
   * @param {*} [args] - the arguments to be copied to the method, if any.
   * @returns {Promise} - a promise for the return value of the service method.
   */
  transferCall(service, method, transfer, ...args) {
    try {
      const {
        provider,
        isRemote
      } = this._getServiceProvider(service);
      if (provider) {
        if (isRemote) {
          return this._remoteTransferCall(provider, service, method, transfer, ...args);
        }

        // TODO: verify correct `this` after switching from apply to spread
        // eslint-disable-next-line prefer-spread
        const result = provider[method].apply(provider, args);
        return Promise.resolve(result);
      }
      return Promise.reject(new Error(`Service not found: ${service}`));
    } catch (e) {
      return Promise.reject(e);
    }
  }

  /**
   * Check if a particular service lives on another worker.
   * @param {string} service - the service to check.
   * @returns {boolean} - true if the service is remote (calls must cross a Worker boundary), false otherwise.
   * @private
   */
  _isRemoteService(service) {
    return this._getServiceProvider(service).isRemote;
  }

  /**
   * Like {@link call}, but force the call to be posted through a particular communication channel.
   * @param {object} provider - send the call through this object's `postMessage` function.
   * @param {string} service - the name of the service.
   * @param {string} method - the name of the method.
   * @param {*} [args] - the arguments to be copied to the method, if any.
   * @returns {Promise} - a promise for the return value of the service method.
   */
  _remoteCall(provider, service, method, ...args) {
    return this._remoteTransferCall(provider, service, method, null, ...args);
  }

  /**
   * Like {@link transferCall}, but force the call to be posted through a particular communication channel.
   * @param {object} provider - send the call through this object's `postMessage` function.
   * @param {string} service - the name of the service.
   * @param {string} method - the name of the method.
   * @param {Array} [transfer] - objects to be transferred instead of copied. Must be present in `args` to be useful.
   * @param {*} [args] - the arguments to be copied to the method, if any.
   * @returns {Promise} - a promise for the return value of the service method.
   */
  _remoteTransferCall(provider, service, method, transfer, ...args) {
    return new Promise((resolve, reject) => {
      const responseId = this._storeCallbacks(resolve, reject);

      /** @TODO: remove this hack! this is just here so we don't try to send `util` to a worker */
      if (args.length > 0 && typeof args[args.length - 1].yield === 'function') {
        args.pop();
      }
      if (transfer) {
        provider.postMessage({
          service,
          method,
          responseId,
          args
        }, transfer);
      } else {
        provider.postMessage({
          service,
          method,
          responseId,
          args
        });
      }
    });
  }

  /**
   * Store callback functions pending a response message.
   * @param {Function} resolve - function to call if the service method returns.
   * @param {Function} reject - function to call if the service method throws.
   * @returns {*} - a unique response ID for this set of callbacks. See {@link _deliverResponse}.
   * @protected
   */
  _storeCallbacks(resolve, reject) {
    const responseId = this.nextResponseId++;
    this.callbacks[responseId] = [resolve, reject];
    return responseId;
  }

  /**
   * Deliver call response from a worker. This should only be called as the result of a message from a worker.
   * @param {int} responseId - the response ID of the callback set to call.
   * @param {DispatchResponseMessage} message - the message containing the response value(s).
   * @protected
   */
  _deliverResponse(responseId, message) {
    try {
      const [resolve, reject] = this.callbacks[responseId];
      delete this.callbacks[responseId];
      if (message.error) {
        reject(message.error);
      } else {
        resolve(message.result);
      }
    } catch (e) {
      log.error(`Dispatch callback failed: ${JSON.stringify(e)}`);
    }
  }

  /**
   * Handle a message event received from a connected worker.
   * @param {Worker} worker - the worker which sent the message, or the global object if running in a worker.
   * @param {MessageEvent} event - the message event to be handled.
   * @protected
   */
  _onMessage(worker, event) {
    /** @type {DispatchMessage} */
    const message = event.data;
    message.args = message.args || [];
    let promise;
    if (message.service) {
      if (message.service === 'dispatch') {
        promise = this._onDispatchMessage(worker, message);
      } else {
        promise = this.call(message.service, message.method, ...message.args);
      }
    } else if (typeof message.responseId === 'undefined') {
      log.error(`Dispatch caught malformed message from a worker: ${JSON.stringify(event)}`);
    } else {
      this._deliverResponse(message.responseId, message);
    }
    if (promise) {
      if (typeof message.responseId === 'undefined') {
        log.error(`Dispatch message missing required response ID: ${JSON.stringify(event)}`);
      } else {
        promise.then(result => worker.postMessage({
          responseId: message.responseId,
          result
        }), error => worker.postMessage({
          responseId: message.responseId,
          error
        }));
      }
    }
  }

  /**
   * Fetch the service provider object for a particular service name.
   * @abstract
   * @param {string} service - the name of the service to look up
   * @returns {{provider:(object|Worker), isRemote:boolean}} - the means to contact the service, if found
   * @protected
   */
  _getServiceProvider(service) {
    throw new Error(`Could not get provider for ${service}: _getServiceProvider not implemented`);
  }

  /**
   * Handle a call message sent to the dispatch service itself
   * @abstract
   * @param {Worker} worker - the worker which sent the message.
   * @param {DispatchCallMessage} message - the message to be handled.
   * @returns {Promise|undefined} - a promise for the results of this operation, if appropriate
   * @private
   */
  _onDispatchMessage(worker, message) {
    throw new Error(`Unimplemented dispatch message handler cannot handle ${message.method} method`);
  }
}
module.exports = SharedDispatch;

/***/ },

/***/ 3260
(module, __unused_webpack_exports, __webpack_require__) {

const SharedDispatch = __webpack_require__(2589);
const log = __webpack_require__(3707);

/**
 * This class provides a Worker with the means to participate in the message dispatch system managed by CentralDispatch.
 * From any context in the messaging system, the dispatcher's "call" method can call any method on any "service"
 * provided in any participating context. The dispatch system will forward function arguments and return values across
 * worker boundaries as needed.
 * @see {CentralDispatch}
 */
class WorkerDispatch extends SharedDispatch {
  constructor() {
    super();

    /**
     * This promise will be resolved when we have successfully connected to central dispatch.
     * @type {Promise}
     * @see {waitForConnection}
     * @private
     */
    this._connectionPromise = new Promise(resolve => {
      this._onConnect = resolve;
    });

    /**
     * Map of service name to local service provider.
     * If a service is not listed here, it is assumed to be provided by another context (another Worker or the main
     * thread).
     * @see {setService}
     * @type {object}
     */
    this.services = {};
    this._onMessage = this._onMessage.bind(this, self);
    if (typeof self !== 'undefined') {
      self.onmessage = this._onMessage;
    }
  }

  /**
   * @returns {Promise} a promise which will resolve upon connection to central dispatch. If you need to make a call
   * immediately on "startup" you can attach a 'then' to this promise.
   * @example
   *      dispatch.waitForConnection.then(() => {
   *          dispatch.call('myService', 'hello');
   *      })
   */
  get waitForConnection() {
    return this._connectionPromise;
  }

  /**
   * Set a local object as the global provider of the specified service.
   * WARNING: Any method on the provider can be called from any worker within the dispatch system.
   * @param {string} service - a globally unique string identifying this service. Examples: 'vm', 'gui', 'extension9'.
   * @param {object} provider - a local object which provides this service.
   * @returns {Promise} - a promise which will resolve once the service is registered.
   */
  setService(service, provider) {
    if (Object.prototype.hasOwnProperty.call(this.services, service)) {
      log.warn(`Worker dispatch replacing existing service provider for ${service}`);
    }
    this.services[service] = provider;
    return this.waitForConnection.then(() => this._remoteCall(self, 'dispatch', 'setService', service));
  }

  /**
   * Fetch the service provider object for a particular service name.
   * @override
   * @param {string} service - the name of the service to look up
   * @returns {{provider:(object|Worker), isRemote:boolean}} - the means to contact the service, if found
   * @protected
   */
  _getServiceProvider(service) {
    // if we don't have a local service by this name, contact central dispatch by calling `postMessage` on self
    const provider = this.services[service];
    return {
      provider: provider || self,
      isRemote: !provider
    };
  }

  /**
   * Handle a call message sent to the dispatch service itself
   * @override
   * @param {Worker} worker - the worker which sent the message.
   * @param {DispatchCallMessage} message - the message to be handled.
   * @returns {Promise|undefined} - a promise for the results of this operation, if appropriate
   * @protected
   */
  _onDispatchMessage(worker, message) {
    let promise;
    switch (message.method) {
      case 'handshake':
        promise = this._onConnect();
        break;
      case 'terminate':
        // Don't close until next tick, after sending confirmation back
        setTimeout(() => self.close(), 0);
        promise = Promise.resolve();
        break;
      default:
        log.error(`Worker dispatch received message for unknown method: ${message.method}`);
    }
    return promise;
  }
}
module.exports = new WorkerDispatch();

/***/ },

/***/ 6342
(module) {

/**
 * Block argument types
 * @enum {string}
 */
const ArgumentType = {
  /**
   * Numeric value with angle picker
   */
  ANGLE: 'angle',
  /**
   * Boolean value with hexagonal placeholder
   */
  BOOLEAN: 'Boolean',
  /**
   * Numeric value with color picker
   */
  COLOR: 'color',
  /**
   * Numeric value with text field
   */
  NUMBER: 'number',
  /**
   * String value with text field
   */
  STRING: 'string',
  /**
   * String value with matrix field
   */
  MATRIX: 'matrix',
  /**
   * MIDI note number with note picker (piano) field
   */
  NOTE: 'note',
  /**
   * Inline image on block (as part of the label)
   */
  IMAGE: 'image'
};
module.exports = ArgumentType;

/***/ },

/***/ 9274
(module) {

/**
 * Types of block
 * @enum {string}
 */
const BlockType = {
  /**
   * Boolean reporter with hexagonal shape
   */
  BOOLEAN: 'Boolean',
  /**
   * A button (not an actual block) for some special action, like making a variable
   */
  BUTTON: 'button',
  /**
   * Command block
   */
  COMMAND: 'command',
  /**
   * Specialized command block which may or may not run a child branch
   * The thread continues with the next block whether or not a child branch ran.
   */
  CONDITIONAL: 'conditional',
  /**
   * Specialized hat block with no implementation function
   * This stack only runs if the corresponding event is emitted by other code.
   */
  EVENT: 'event',
  /**
   * Hat block which conditionally starts a block stack
   */
  HAT: 'hat',
  /**
   * Specialized command block which may or may not run a child branch
   * If a child branch runs, the thread evaluates the loop block again.
   */
  LOOP: 'loop',
  /**
   * General reporter with numeric or string value
   */
  REPORTER: 'reporter'
};
module.exports = BlockType;

/***/ },

/***/ 9432
(module) {

/**
 * Default types of Target supported by the VM
 * @enum {string}
 */
const TargetType = {
  /**
   * Rendered target which can move, change costumes, etc.
   */
  SPRITE: 'sprite',
  /**
   * Rendered target which cannot move but can change backdrops
   */
  STAGE: 'stage'
};
module.exports = TargetType;

/***/ },

/***/ 3707
(module, __unused_webpack_exports, __webpack_require__) {

const {
  Logger
} = __webpack_require__(7039);
module.exports = new Logger({
  name: 'scratch-vm'
});

/***/ },

/***/ 7991
(__unused_webpack_module, exports) {

"use strict";
var __webpack_unused_export__;


__webpack_unused_export__ = byteLength
exports.toByteArray = toByteArray
exports.fromByteArray = fromByteArray

var lookup = []
var revLookup = []
var Arr = typeof Uint8Array !== 'undefined' ? Uint8Array : Array

var code = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
for (var i = 0, len = code.length; i < len; ++i) {
  lookup[i] = code[i]
  revLookup[code.charCodeAt(i)] = i
}

// Support decoding URL-safe base64 strings, as Node.js does.
// See: https://en.wikipedia.org/wiki/Base64#URL_applications
revLookup['-'.charCodeAt(0)] = 62
revLookup['_'.charCodeAt(0)] = 63

function getLens (b64) {
  var len = b64.length

  if (len % 4 > 0) {
    throw new Error('Invalid string. Length must be a multiple of 4')
  }

  // Trim off extra bytes after placeholder bytes are found
  // See: https://github.com/beatgammit/base64-js/issues/42
  var validLen = b64.indexOf('=')
  if (validLen === -1) validLen = len

  var placeHoldersLen = validLen === len
    ? 0
    : 4 - (validLen % 4)

  return [validLen, placeHoldersLen]
}

// base64 is 4/3 + up to two characters of the original data
function byteLength (b64) {
  var lens = getLens(b64)
  var validLen = lens[0]
  var placeHoldersLen = lens[1]
  return ((validLen + placeHoldersLen) * 3 / 4) - placeHoldersLen
}

function _byteLength (b64, validLen, placeHoldersLen) {
  return ((validLen + placeHoldersLen) * 3 / 4) - placeHoldersLen
}

function toByteArray (b64) {
  var tmp
  var lens = getLens(b64)
  var validLen = lens[0]
  var placeHoldersLen = lens[1]

  var arr = new Arr(_byteLength(b64, validLen, placeHoldersLen))

  var curByte = 0

  // if there are placeholders, only get up to the last complete 4 chars
  var len = placeHoldersLen > 0
    ? validLen - 4
    : validLen

  var i
  for (i = 0; i < len; i += 4) {
    tmp =
      (revLookup[b64.charCodeAt(i)] << 18) |
      (revLookup[b64.charCodeAt(i + 1)] << 12) |
      (revLookup[b64.charCodeAt(i + 2)] << 6) |
      revLookup[b64.charCodeAt(i + 3)]
    arr[curByte++] = (tmp >> 16) & 0xFF
    arr[curByte++] = (tmp >> 8) & 0xFF
    arr[curByte++] = tmp & 0xFF
  }

  if (placeHoldersLen === 2) {
    tmp =
      (revLookup[b64.charCodeAt(i)] << 2) |
      (revLookup[b64.charCodeAt(i + 1)] >> 4)
    arr[curByte++] = tmp & 0xFF
  }

  if (placeHoldersLen === 1) {
    tmp =
      (revLookup[b64.charCodeAt(i)] << 10) |
      (revLookup[b64.charCodeAt(i + 1)] << 4) |
      (revLookup[b64.charCodeAt(i + 2)] >> 2)
    arr[curByte++] = (tmp >> 8) & 0xFF
    arr[curByte++] = tmp & 0xFF
  }

  return arr
}

function tripletToBase64 (num) {
  return lookup[num >> 18 & 0x3F] +
    lookup[num >> 12 & 0x3F] +
    lookup[num >> 6 & 0x3F] +
    lookup[num & 0x3F]
}

function encodeChunk (uint8, start, end) {
  var tmp
  var output = []
  for (var i = start; i < end; i += 3) {
    tmp =
      ((uint8[i] << 16) & 0xFF0000) +
      ((uint8[i + 1] << 8) & 0xFF00) +
      (uint8[i + 2] & 0xFF)
    output.push(tripletToBase64(tmp))
  }
  return output.join('')
}

function fromByteArray (uint8) {
  var tmp
  var len = uint8.length
  var extraBytes = len % 3 // if we have 1 byte left, pad 2 bytes
  var parts = []
  var maxChunkLength = 16383 // must be multiple of 3

  // go through the array every three bytes, we'll deal with trailing stuff later
  for (var i = 0, len2 = len - extraBytes; i < len2; i += maxChunkLength) {
    parts.push(encodeChunk(uint8, i, (i + maxChunkLength) > len2 ? len2 : (i + maxChunkLength)))
  }

  // pad the end with zeros, but make sure to not forget the extra bytes
  if (extraBytes === 1) {
    tmp = uint8[len - 1]
    parts.push(
      lookup[tmp >> 2] +
      lookup[(tmp << 4) & 0x3F] +
      '=='
    )
  } else if (extraBytes === 2) {
    tmp = (uint8[len - 2] << 8) + uint8[len - 1]
    parts.push(
      lookup[tmp >> 10] +
      lookup[(tmp >> 4) & 0x3F] +
      lookup[(tmp << 2) & 0x3F] +
      '='
    )
  }

  return parts.join('')
}


/***/ },

/***/ 1048
(__unused_webpack_module, exports, __webpack_require__) {

"use strict";
var __webpack_unused_export__;
/*!
 * The buffer module from node.js, for the browser.
 *
 * @author   Feross Aboukhadijeh <https://feross.org>
 * @license  MIT
 */
/* eslint-disable no-proto */



const base64 = __webpack_require__(7991)
const ieee754 = __webpack_require__(9318)
const customInspectSymbol =
  (typeof Symbol === 'function' && typeof Symbol['for'] === 'function') // eslint-disable-line dot-notation
    ? Symbol['for']('nodejs.util.inspect.custom') // eslint-disable-line dot-notation
    : null

exports.Buffer = Buffer
__webpack_unused_export__ = SlowBuffer
exports.INSPECT_MAX_BYTES = 50

const K_MAX_LENGTH = 0x7fffffff
__webpack_unused_export__ = K_MAX_LENGTH

/**
 * If `Buffer.TYPED_ARRAY_SUPPORT`:
 *   === true    Use Uint8Array implementation (fastest)
 *   === false   Print warning and recommend using `buffer` v4.x which has an Object
 *               implementation (most compatible, even IE6)
 *
 * Browsers that support typed arrays are IE 10+, Firefox 4+, Chrome 7+, Safari 5.1+,
 * Opera 11.6+, iOS 4.2+.
 *
 * We report that the browser does not support typed arrays if the are not subclassable
 * using __proto__. Firefox 4-29 lacks support for adding new properties to `Uint8Array`
 * (See: https://bugzilla.mozilla.org/show_bug.cgi?id=695438). IE 10 lacks support
 * for __proto__ and has a buggy typed array implementation.
 */
Buffer.TYPED_ARRAY_SUPPORT = typedArraySupport()

if (!Buffer.TYPED_ARRAY_SUPPORT && typeof console !== 'undefined' &&
    typeof console.error === 'function') {
  console.error(
    'This browser lacks typed array (Uint8Array) support which is required by ' +
    '`buffer` v5.x. Use `buffer` v4.x if you require old browser support.'
  )
}

function typedArraySupport () {
  // Can typed array instances can be augmented?
  try {
    const arr = new Uint8Array(1)
    const proto = { foo: function () { return 42 } }
    Object.setPrototypeOf(proto, Uint8Array.prototype)
    Object.setPrototypeOf(arr, proto)
    return arr.foo() === 42
  } catch (e) {
    return false
  }
}

Object.defineProperty(Buffer.prototype, 'parent', {
  enumerable: true,
  get: function () {
    if (!Buffer.isBuffer(this)) return undefined
    return this.buffer
  }
})

Object.defineProperty(Buffer.prototype, 'offset', {
  enumerable: true,
  get: function () {
    if (!Buffer.isBuffer(this)) return undefined
    return this.byteOffset
  }
})

function createBuffer (length) {
  if (length > K_MAX_LENGTH) {
    throw new RangeError('The value "' + length + '" is invalid for option "size"')
  }
  // Return an augmented `Uint8Array` instance
  const buf = new Uint8Array(length)
  Object.setPrototypeOf(buf, Buffer.prototype)
  return buf
}

/**
 * The Buffer constructor returns instances of `Uint8Array` that have their
 * prototype changed to `Buffer.prototype`. Furthermore, `Buffer` is a subclass of
 * `Uint8Array`, so the returned instances will have all the node `Buffer` methods
 * and the `Uint8Array` methods. Square bracket notation works as expected -- it
 * returns a single octet.
 *
 * The `Uint8Array` prototype remains unmodified.
 */

function Buffer (arg, encodingOrOffset, length) {
  // Common case.
  if (typeof arg === 'number') {
    if (typeof encodingOrOffset === 'string') {
      throw new TypeError(
        'The "string" argument must be of type string. Received type number'
      )
    }
    return allocUnsafe(arg)
  }
  return from(arg, encodingOrOffset, length)
}

Buffer.poolSize = 8192 // not used by this implementation

function from (value, encodingOrOffset, length) {
  if (typeof value === 'string') {
    return fromString(value, encodingOrOffset)
  }

  if (ArrayBuffer.isView(value)) {
    return fromArrayView(value)
  }

  if (value == null) {
    throw new TypeError(
      'The first argument must be one of type string, Buffer, ArrayBuffer, Array, ' +
      'or Array-like Object. Received type ' + (typeof value)
    )
  }

  if (isInstance(value, ArrayBuffer) ||
      (value && isInstance(value.buffer, ArrayBuffer))) {
    return fromArrayBuffer(value, encodingOrOffset, length)
  }

  if (typeof SharedArrayBuffer !== 'undefined' &&
      (isInstance(value, SharedArrayBuffer) ||
      (value && isInstance(value.buffer, SharedArrayBuffer)))) {
    return fromArrayBuffer(value, encodingOrOffset, length)
  }

  if (typeof value === 'number') {
    throw new TypeError(
      'The "value" argument must not be of type number. Received type number'
    )
  }

  const valueOf = value.valueOf && value.valueOf()
  if (valueOf != null && valueOf !== value) {
    return Buffer.from(valueOf, encodingOrOffset, length)
  }

  const b = fromObject(value)
  if (b) return b

  if (typeof Symbol !== 'undefined' && Symbol.toPrimitive != null &&
      typeof value[Symbol.toPrimitive] === 'function') {
    return Buffer.from(value[Symbol.toPrimitive]('string'), encodingOrOffset, length)
  }

  throw new TypeError(
    'The first argument must be one of type string, Buffer, ArrayBuffer, Array, ' +
    'or Array-like Object. Received type ' + (typeof value)
  )
}

/**
 * Functionally equivalent to Buffer(arg, encoding) but throws a TypeError
 * if value is a number.
 * Buffer.from(str[, encoding])
 * Buffer.from(array)
 * Buffer.from(buffer)
 * Buffer.from(arrayBuffer[, byteOffset[, length]])
 **/
Buffer.from = function (value, encodingOrOffset, length) {
  return from(value, encodingOrOffset, length)
}

// Note: Change prototype *after* Buffer.from is defined to workaround Chrome bug:
// https://github.com/feross/buffer/pull/148
Object.setPrototypeOf(Buffer.prototype, Uint8Array.prototype)
Object.setPrototypeOf(Buffer, Uint8Array)

function assertSize (size) {
  if (typeof size !== 'number') {
    throw new TypeError('"size" argument must be of type number')
  } else if (size < 0) {
    throw new RangeError('The value "' + size + '" is invalid for option "size"')
  }
}

function alloc (size, fill, encoding) {
  assertSize(size)
  if (size <= 0) {
    return createBuffer(size)
  }
  if (fill !== undefined) {
    // Only pay attention to encoding if it's a string. This
    // prevents accidentally sending in a number that would
    // be interpreted as a start offset.
    return typeof encoding === 'string'
      ? createBuffer(size).fill(fill, encoding)
      : createBuffer(size).fill(fill)
  }
  return createBuffer(size)
}

/**
 * Creates a new filled Buffer instance.
 * alloc(size[, fill[, encoding]])
 **/
Buffer.alloc = function (size, fill, encoding) {
  return alloc(size, fill, encoding)
}

function allocUnsafe (size) {
  assertSize(size)
  return createBuffer(size < 0 ? 0 : checked(size) | 0)
}

/**
 * Equivalent to Buffer(num), by default creates a non-zero-filled Buffer instance.
 * */
Buffer.allocUnsafe = function (size) {
  return allocUnsafe(size)
}
/**
 * Equivalent to SlowBuffer(num), by default creates a non-zero-filled Buffer instance.
 */
Buffer.allocUnsafeSlow = function (size) {
  return allocUnsafe(size)
}

function fromString (string, encoding) {
  if (typeof encoding !== 'string' || encoding === '') {
    encoding = 'utf8'
  }

  if (!Buffer.isEncoding(encoding)) {
    throw new TypeError('Unknown encoding: ' + encoding)
  }

  const length = byteLength(string, encoding) | 0
  let buf = createBuffer(length)

  const actual = buf.write(string, encoding)

  if (actual !== length) {
    // Writing a hex string, for example, that contains invalid characters will
    // cause everything after the first invalid character to be ignored. (e.g.
    // 'abxxcd' will be treated as 'ab')
    buf = buf.slice(0, actual)
  }

  return buf
}

function fromArrayLike (array) {
  const length = array.length < 0 ? 0 : checked(array.length) | 0
  const buf = createBuffer(length)
  for (let i = 0; i < length; i += 1) {
    buf[i] = array[i] & 255
  }
  return buf
}

function fromArrayView (arrayView) {
  if (isInstance(arrayView, Uint8Array)) {
    const copy = new Uint8Array(arrayView)
    return fromArrayBuffer(copy.buffer, copy.byteOffset, copy.byteLength)
  }
  return fromArrayLike(arrayView)
}

function fromArrayBuffer (array, byteOffset, length) {
  if (byteOffset < 0 || array.byteLength < byteOffset) {
    throw new RangeError('"offset" is outside of buffer bounds')
  }

  if (array.byteLength < byteOffset + (length || 0)) {
    throw new RangeError('"length" is outside of buffer bounds')
  }

  let buf
  if (byteOffset === undefined && length === undefined) {
    buf = new Uint8Array(array)
  } else if (length === undefined) {
    buf = new Uint8Array(array, byteOffset)
  } else {
    buf = new Uint8Array(array, byteOffset, length)
  }

  // Return an augmented `Uint8Array` instance
  Object.setPrototypeOf(buf, Buffer.prototype)

  return buf
}

function fromObject (obj) {
  if (Buffer.isBuffer(obj)) {
    const len = checked(obj.length) | 0
    const buf = createBuffer(len)

    if (buf.length === 0) {
      return buf
    }

    obj.copy(buf, 0, 0, len)
    return buf
  }

  if (obj.length !== undefined) {
    if (typeof obj.length !== 'number' || numberIsNaN(obj.length)) {
      return createBuffer(0)
    }
    return fromArrayLike(obj)
  }

  if (obj.type === 'Buffer' && Array.isArray(obj.data)) {
    return fromArrayLike(obj.data)
  }
}

function checked (length) {
  // Note: cannot use `length < K_MAX_LENGTH` here because that fails when
  // length is NaN (which is otherwise coerced to zero.)
  if (length >= K_MAX_LENGTH) {
    throw new RangeError('Attempt to allocate Buffer larger than maximum ' +
                         'size: 0x' + K_MAX_LENGTH.toString(16) + ' bytes')
  }
  return length | 0
}

function SlowBuffer (length) {
  if (+length != length) { // eslint-disable-line eqeqeq
    length = 0
  }
  return Buffer.alloc(+length)
}

Buffer.isBuffer = function isBuffer (b) {
  return b != null && b._isBuffer === true &&
    b !== Buffer.prototype // so Buffer.isBuffer(Buffer.prototype) will be false
}

Buffer.compare = function compare (a, b) {
  if (isInstance(a, Uint8Array)) a = Buffer.from(a, a.offset, a.byteLength)
  if (isInstance(b, Uint8Array)) b = Buffer.from(b, b.offset, b.byteLength)
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b)) {
    throw new TypeError(
      'The "buf1", "buf2" arguments must be one of type Buffer or Uint8Array'
    )
  }

  if (a === b) return 0

  let x = a.length
  let y = b.length

  for (let i = 0, len = Math.min(x, y); i < len; ++i) {
    if (a[i] !== b[i]) {
      x = a[i]
      y = b[i]
      break
    }
  }

  if (x < y) return -1
  if (y < x) return 1
  return 0
}

Buffer.isEncoding = function isEncoding (encoding) {
  switch (String(encoding).toLowerCase()) {
    case 'hex':
    case 'utf8':
    case 'utf-8':
    case 'ascii':
    case 'latin1':
    case 'binary':
    case 'base64':
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return true
    default:
      return false
  }
}

Buffer.concat = function concat (list, length) {
  if (!Array.isArray(list)) {
    throw new TypeError('"list" argument must be an Array of Buffers')
  }

  if (list.length === 0) {
    return Buffer.alloc(0)
  }

  let i
  if (length === undefined) {
    length = 0
    for (i = 0; i < list.length; ++i) {
      length += list[i].length
    }
  }

  const buffer = Buffer.allocUnsafe(length)
  let pos = 0
  for (i = 0; i < list.length; ++i) {
    let buf = list[i]
    if (isInstance(buf, Uint8Array)) {
      if (pos + buf.length > buffer.length) {
        if (!Buffer.isBuffer(buf)) buf = Buffer.from(buf)
        buf.copy(buffer, pos)
      } else {
        Uint8Array.prototype.set.call(
          buffer,
          buf,
          pos
        )
      }
    } else if (!Buffer.isBuffer(buf)) {
      throw new TypeError('"list" argument must be an Array of Buffers')
    } else {
      buf.copy(buffer, pos)
    }
    pos += buf.length
  }
  return buffer
}

function byteLength (string, encoding) {
  if (Buffer.isBuffer(string)) {
    return string.length
  }
  if (ArrayBuffer.isView(string) || isInstance(string, ArrayBuffer)) {
    return string.byteLength
  }
  if (typeof string !== 'string') {
    throw new TypeError(
      'The "string" argument must be one of type string, Buffer, or ArrayBuffer. ' +
      'Received type ' + typeof string
    )
  }

  const len = string.length
  const mustMatch = (arguments.length > 2 && arguments[2] === true)
  if (!mustMatch && len === 0) return 0

  // Use a for loop to avoid recursion
  let loweredCase = false
  for (;;) {
    switch (encoding) {
      case 'ascii':
      case 'latin1':
      case 'binary':
        return len
      case 'utf8':
      case 'utf-8':
        return utf8ToBytes(string).length
      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return len * 2
      case 'hex':
        return len >>> 1
      case 'base64':
        return base64ToBytes(string).length
      default:
        if (loweredCase) {
          return mustMatch ? -1 : utf8ToBytes(string).length // assume utf8
        }
        encoding = ('' + encoding).toLowerCase()
        loweredCase = true
    }
  }
}
Buffer.byteLength = byteLength

function slowToString (encoding, start, end) {
  let loweredCase = false

  // No need to verify that "this.length <= MAX_UINT32" since it's a read-only
  // property of a typed array.

  // This behaves neither like String nor Uint8Array in that we set start/end
  // to their upper/lower bounds if the value passed is out of range.
  // undefined is handled specially as per ECMA-262 6th Edition,
  // Section 13.3.3.7 Runtime Semantics: KeyedBindingInitialization.
  if (start === undefined || start < 0) {
    start = 0
  }
  // Return early if start > this.length. Done here to prevent potential uint32
  // coercion fail below.
  if (start > this.length) {
    return ''
  }

  if (end === undefined || end > this.length) {
    end = this.length
  }

  if (end <= 0) {
    return ''
  }

  // Force coercion to uint32. This will also coerce falsey/NaN values to 0.
  end >>>= 0
  start >>>= 0

  if (end <= start) {
    return ''
  }

  if (!encoding) encoding = 'utf8'

  while (true) {
    switch (encoding) {
      case 'hex':
        return hexSlice(this, start, end)

      case 'utf8':
      case 'utf-8':
        return utf8Slice(this, start, end)

      case 'ascii':
        return asciiSlice(this, start, end)

      case 'latin1':
      case 'binary':
        return latin1Slice(this, start, end)

      case 'base64':
        return base64Slice(this, start, end)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return utf16leSlice(this, start, end)

      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
        encoding = (encoding + '').toLowerCase()
        loweredCase = true
    }
  }
}

// This property is used by `Buffer.isBuffer` (and the `is-buffer` npm package)
// to detect a Buffer instance. It's not possible to use `instanceof Buffer`
// reliably in a browserify context because there could be multiple different
// copies of the 'buffer' package in use. This method works even for Buffer
// instances that were created from another copy of the `buffer` package.
// See: https://github.com/feross/buffer/issues/154
Buffer.prototype._isBuffer = true

function swap (b, n, m) {
  const i = b[n]
  b[n] = b[m]
  b[m] = i
}

Buffer.prototype.swap16 = function swap16 () {
  const len = this.length
  if (len % 2 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 16-bits')
  }
  for (let i = 0; i < len; i += 2) {
    swap(this, i, i + 1)
  }
  return this
}

Buffer.prototype.swap32 = function swap32 () {
  const len = this.length
  if (len % 4 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 32-bits')
  }
  for (let i = 0; i < len; i += 4) {
    swap(this, i, i + 3)
    swap(this, i + 1, i + 2)
  }
  return this
}

Buffer.prototype.swap64 = function swap64 () {
  const len = this.length
  if (len % 8 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 64-bits')
  }
  for (let i = 0; i < len; i += 8) {
    swap(this, i, i + 7)
    swap(this, i + 1, i + 6)
    swap(this, i + 2, i + 5)
    swap(this, i + 3, i + 4)
  }
  return this
}

Buffer.prototype.toString = function toString () {
  const length = this.length
  if (length === 0) return ''
  if (arguments.length === 0) return utf8Slice(this, 0, length)
  return slowToString.apply(this, arguments)
}

Buffer.prototype.toLocaleString = Buffer.prototype.toString

Buffer.prototype.equals = function equals (b) {
  if (!Buffer.isBuffer(b)) throw new TypeError('Argument must be a Buffer')
  if (this === b) return true
  return Buffer.compare(this, b) === 0
}

Buffer.prototype.inspect = function inspect () {
  let str = ''
  const max = exports.INSPECT_MAX_BYTES
  str = this.toString('hex', 0, max).replace(/(.{2})/g, '$1 ').trim()
  if (this.length > max) str += ' ... '
  return '<Buffer ' + str + '>'
}
if (customInspectSymbol) {
  Buffer.prototype[customInspectSymbol] = Buffer.prototype.inspect
}

Buffer.prototype.compare = function compare (target, start, end, thisStart, thisEnd) {
  if (isInstance(target, Uint8Array)) {
    target = Buffer.from(target, target.offset, target.byteLength)
  }
  if (!Buffer.isBuffer(target)) {
    throw new TypeError(
      'The "target" argument must be one of type Buffer or Uint8Array. ' +
      'Received type ' + (typeof target)
    )
  }

  if (start === undefined) {
    start = 0
  }
  if (end === undefined) {
    end = target ? target.length : 0
  }
  if (thisStart === undefined) {
    thisStart = 0
  }
  if (thisEnd === undefined) {
    thisEnd = this.length
  }

  if (start < 0 || end > target.length || thisStart < 0 || thisEnd > this.length) {
    throw new RangeError('out of range index')
  }

  if (thisStart >= thisEnd && start >= end) {
    return 0
  }
  if (thisStart >= thisEnd) {
    return -1
  }
  if (start >= end) {
    return 1
  }

  start >>>= 0
  end >>>= 0
  thisStart >>>= 0
  thisEnd >>>= 0

  if (this === target) return 0

  let x = thisEnd - thisStart
  let y = end - start
  const len = Math.min(x, y)

  const thisCopy = this.slice(thisStart, thisEnd)
  const targetCopy = target.slice(start, end)

  for (let i = 0; i < len; ++i) {
    if (thisCopy[i] !== targetCopy[i]) {
      x = thisCopy[i]
      y = targetCopy[i]
      break
    }
  }

  if (x < y) return -1
  if (y < x) return 1
  return 0
}

// Finds either the first index of `val` in `buffer` at offset >= `byteOffset`,
// OR the last index of `val` in `buffer` at offset <= `byteOffset`.
//
// Arguments:
// - buffer - a Buffer to search
// - val - a string, Buffer, or number
// - byteOffset - an index into `buffer`; will be clamped to an int32
// - encoding - an optional encoding, relevant is val is a string
// - dir - true for indexOf, false for lastIndexOf
function bidirectionalIndexOf (buffer, val, byteOffset, encoding, dir) {
  // Empty buffer means no match
  if (buffer.length === 0) return -1

  // Normalize byteOffset
  if (typeof byteOffset === 'string') {
    encoding = byteOffset
    byteOffset = 0
  } else if (byteOffset > 0x7fffffff) {
    byteOffset = 0x7fffffff
  } else if (byteOffset < -0x80000000) {
    byteOffset = -0x80000000
  }
  byteOffset = +byteOffset // Coerce to Number.
  if (numberIsNaN(byteOffset)) {
    // byteOffset: it it's undefined, null, NaN, "foo", etc, search whole buffer
    byteOffset = dir ? 0 : (buffer.length - 1)
  }

  // Normalize byteOffset: negative offsets start from the end of the buffer
  if (byteOffset < 0) byteOffset = buffer.length + byteOffset
  if (byteOffset >= buffer.length) {
    if (dir) return -1
    else byteOffset = buffer.length - 1
  } else if (byteOffset < 0) {
    if (dir) byteOffset = 0
    else return -1
  }

  // Normalize val
  if (typeof val === 'string') {
    val = Buffer.from(val, encoding)
  }

  // Finally, search either indexOf (if dir is true) or lastIndexOf
  if (Buffer.isBuffer(val)) {
    // Special case: looking for empty string/buffer always fails
    if (val.length === 0) {
      return -1
    }
    return arrayIndexOf(buffer, val, byteOffset, encoding, dir)
  } else if (typeof val === 'number') {
    val = val & 0xFF // Search for a byte value [0-255]
    if (typeof Uint8Array.prototype.indexOf === 'function') {
      if (dir) {
        return Uint8Array.prototype.indexOf.call(buffer, val, byteOffset)
      } else {
        return Uint8Array.prototype.lastIndexOf.call(buffer, val, byteOffset)
      }
    }
    return arrayIndexOf(buffer, [val], byteOffset, encoding, dir)
  }

  throw new TypeError('val must be string, number or Buffer')
}

function arrayIndexOf (arr, val, byteOffset, encoding, dir) {
  let indexSize = 1
  let arrLength = arr.length
  let valLength = val.length

  if (encoding !== undefined) {
    encoding = String(encoding).toLowerCase()
    if (encoding === 'ucs2' || encoding === 'ucs-2' ||
        encoding === 'utf16le' || encoding === 'utf-16le') {
      if (arr.length < 2 || val.length < 2) {
        return -1
      }
      indexSize = 2
      arrLength /= 2
      valLength /= 2
      byteOffset /= 2
    }
  }

  function read (buf, i) {
    if (indexSize === 1) {
      return buf[i]
    } else {
      return buf.readUInt16BE(i * indexSize)
    }
  }

  let i
  if (dir) {
    let foundIndex = -1
    for (i = byteOffset; i < arrLength; i++) {
      if (read(arr, i) === read(val, foundIndex === -1 ? 0 : i - foundIndex)) {
        if (foundIndex === -1) foundIndex = i
        if (i - foundIndex + 1 === valLength) return foundIndex * indexSize
      } else {
        if (foundIndex !== -1) i -= i - foundIndex
        foundIndex = -1
      }
    }
  } else {
    if (byteOffset + valLength > arrLength) byteOffset = arrLength - valLength
    for (i = byteOffset; i >= 0; i--) {
      let found = true
      for (let j = 0; j < valLength; j++) {
        if (read(arr, i + j) !== read(val, j)) {
          found = false
          break
        }
      }
      if (found) return i
    }
  }

  return -1
}

Buffer.prototype.includes = function includes (val, byteOffset, encoding) {
  return this.indexOf(val, byteOffset, encoding) !== -1
}

Buffer.prototype.indexOf = function indexOf (val, byteOffset, encoding) {
  return bidirectionalIndexOf(this, val, byteOffset, encoding, true)
}

Buffer.prototype.lastIndexOf = function lastIndexOf (val, byteOffset, encoding) {
  return bidirectionalIndexOf(this, val, byteOffset, encoding, false)
}

function hexWrite (buf, string, offset, length) {
  offset = Number(offset) || 0
  const remaining = buf.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }

  const strLen = string.length

  if (length > strLen / 2) {
    length = strLen / 2
  }
  let i
  for (i = 0; i < length; ++i) {
    const parsed = parseInt(string.substr(i * 2, 2), 16)
    if (numberIsNaN(parsed)) return i
    buf[offset + i] = parsed
  }
  return i
}

function utf8Write (buf, string, offset, length) {
  return blitBuffer(utf8ToBytes(string, buf.length - offset), buf, offset, length)
}

function asciiWrite (buf, string, offset, length) {
  return blitBuffer(asciiToBytes(string), buf, offset, length)
}

function base64Write (buf, string, offset, length) {
  return blitBuffer(base64ToBytes(string), buf, offset, length)
}

function ucs2Write (buf, string, offset, length) {
  return blitBuffer(utf16leToBytes(string, buf.length - offset), buf, offset, length)
}

Buffer.prototype.write = function write (string, offset, length, encoding) {
  // Buffer#write(string)
  if (offset === undefined) {
    encoding = 'utf8'
    length = this.length
    offset = 0
  // Buffer#write(string, encoding)
  } else if (length === undefined && typeof offset === 'string') {
    encoding = offset
    length = this.length
    offset = 0
  // Buffer#write(string, offset[, length][, encoding])
  } else if (isFinite(offset)) {
    offset = offset >>> 0
    if (isFinite(length)) {
      length = length >>> 0
      if (encoding === undefined) encoding = 'utf8'
    } else {
      encoding = length
      length = undefined
    }
  } else {
    throw new Error(
      'Buffer.write(string, encoding, offset[, length]) is no longer supported'
    )
  }

  const remaining = this.length - offset
  if (length === undefined || length > remaining) length = remaining

  if ((string.length > 0 && (length < 0 || offset < 0)) || offset > this.length) {
    throw new RangeError('Attempt to write outside buffer bounds')
  }

  if (!encoding) encoding = 'utf8'

  let loweredCase = false
  for (;;) {
    switch (encoding) {
      case 'hex':
        return hexWrite(this, string, offset, length)

      case 'utf8':
      case 'utf-8':
        return utf8Write(this, string, offset, length)

      case 'ascii':
      case 'latin1':
      case 'binary':
        return asciiWrite(this, string, offset, length)

      case 'base64':
        // Warning: maxLength not taken into account in base64Write
        return base64Write(this, string, offset, length)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return ucs2Write(this, string, offset, length)

      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
        encoding = ('' + encoding).toLowerCase()
        loweredCase = true
    }
  }
}

Buffer.prototype.toJSON = function toJSON () {
  return {
    type: 'Buffer',
    data: Array.prototype.slice.call(this._arr || this, 0)
  }
}

function base64Slice (buf, start, end) {
  if (start === 0 && end === buf.length) {
    return base64.fromByteArray(buf)
  } else {
    return base64.fromByteArray(buf.slice(start, end))
  }
}

function utf8Slice (buf, start, end) {
  end = Math.min(buf.length, end)
  const res = []

  let i = start
  while (i < end) {
    const firstByte = buf[i]
    let codePoint = null
    let bytesPerSequence = (firstByte > 0xEF)
      ? 4
      : (firstByte > 0xDF)
          ? 3
          : (firstByte > 0xBF)
              ? 2
              : 1

    if (i + bytesPerSequence <= end) {
      let secondByte, thirdByte, fourthByte, tempCodePoint

      switch (bytesPerSequence) {
        case 1:
          if (firstByte < 0x80) {
            codePoint = firstByte
          }
          break
        case 2:
          secondByte = buf[i + 1]
          if ((secondByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0x1F) << 0x6 | (secondByte & 0x3F)
            if (tempCodePoint > 0x7F) {
              codePoint = tempCodePoint
            }
          }
          break
        case 3:
          secondByte = buf[i + 1]
          thirdByte = buf[i + 2]
          if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0xF) << 0xC | (secondByte & 0x3F) << 0x6 | (thirdByte & 0x3F)
            if (tempCodePoint > 0x7FF && (tempCodePoint < 0xD800 || tempCodePoint > 0xDFFF)) {
              codePoint = tempCodePoint
            }
          }
          break
        case 4:
          secondByte = buf[i + 1]
          thirdByte = buf[i + 2]
          fourthByte = buf[i + 3]
          if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80 && (fourthByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0xF) << 0x12 | (secondByte & 0x3F) << 0xC | (thirdByte & 0x3F) << 0x6 | (fourthByte & 0x3F)
            if (tempCodePoint > 0xFFFF && tempCodePoint < 0x110000) {
              codePoint = tempCodePoint
            }
          }
      }
    }

    if (codePoint === null) {
      // we did not generate a valid codePoint so insert a
      // replacement char (U+FFFD) and advance only 1 byte
      codePoint = 0xFFFD
      bytesPerSequence = 1
    } else if (codePoint > 0xFFFF) {
      // encode to utf16 (surrogate pair dance)
      codePoint -= 0x10000
      res.push(codePoint >>> 10 & 0x3FF | 0xD800)
      codePoint = 0xDC00 | codePoint & 0x3FF
    }

    res.push(codePoint)
    i += bytesPerSequence
  }

  return decodeCodePointsArray(res)
}

// Based on http://stackoverflow.com/a/22747272/680742, the browser with
// the lowest limit is Chrome, with 0x10000 args.
// We go 1 magnitude less, for safety
const MAX_ARGUMENTS_LENGTH = 0x1000

function decodeCodePointsArray (codePoints) {
  const len = codePoints.length
  if (len <= MAX_ARGUMENTS_LENGTH) {
    return String.fromCharCode.apply(String, codePoints) // avoid extra slice()
  }

  // Decode in chunks to avoid "call stack size exceeded".
  let res = ''
  let i = 0
  while (i < len) {
    res += String.fromCharCode.apply(
      String,
      codePoints.slice(i, i += MAX_ARGUMENTS_LENGTH)
    )
  }
  return res
}

function asciiSlice (buf, start, end) {
  let ret = ''
  end = Math.min(buf.length, end)

  for (let i = start; i < end; ++i) {
    ret += String.fromCharCode(buf[i] & 0x7F)
  }
  return ret
}

function latin1Slice (buf, start, end) {
  let ret = ''
  end = Math.min(buf.length, end)

  for (let i = start; i < end; ++i) {
    ret += String.fromCharCode(buf[i])
  }
  return ret
}

function hexSlice (buf, start, end) {
  const len = buf.length

  if (!start || start < 0) start = 0
  if (!end || end < 0 || end > len) end = len

  let out = ''
  for (let i = start; i < end; ++i) {
    out += hexSliceLookupTable[buf[i]]
  }
  return out
}

function utf16leSlice (buf, start, end) {
  const bytes = buf.slice(start, end)
  let res = ''
  // If bytes.length is odd, the last 8 bits must be ignored (same as node.js)
  for (let i = 0; i < bytes.length - 1; i += 2) {
    res += String.fromCharCode(bytes[i] + (bytes[i + 1] * 256))
  }
  return res
}

Buffer.prototype.slice = function slice (start, end) {
  const len = this.length
  start = ~~start
  end = end === undefined ? len : ~~end

  if (start < 0) {
    start += len
    if (start < 0) start = 0
  } else if (start > len) {
    start = len
  }

  if (end < 0) {
    end += len
    if (end < 0) end = 0
  } else if (end > len) {
    end = len
  }

  if (end < start) end = start

  const newBuf = this.subarray(start, end)
  // Return an augmented `Uint8Array` instance
  Object.setPrototypeOf(newBuf, Buffer.prototype)

  return newBuf
}

/*
 * Need to make sure that buffer isn't trying to write out of bounds.
 */
function checkOffset (offset, ext, length) {
  if ((offset % 1) !== 0 || offset < 0) throw new RangeError('offset is not uint')
  if (offset + ext > length) throw new RangeError('Trying to access beyond buffer length')
}

Buffer.prototype.readUintLE =
Buffer.prototype.readUIntLE = function readUIntLE (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  let val = this[offset]
  let mul = 1
  let i = 0
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul
  }

  return val
}

Buffer.prototype.readUintBE =
Buffer.prototype.readUIntBE = function readUIntBE (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) {
    checkOffset(offset, byteLength, this.length)
  }

  let val = this[offset + --byteLength]
  let mul = 1
  while (byteLength > 0 && (mul *= 0x100)) {
    val += this[offset + --byteLength] * mul
  }

  return val
}

Buffer.prototype.readUint8 =
Buffer.prototype.readUInt8 = function readUInt8 (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 1, this.length)
  return this[offset]
}

Buffer.prototype.readUint16LE =
Buffer.prototype.readUInt16LE = function readUInt16LE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 2, this.length)
  return this[offset] | (this[offset + 1] << 8)
}

Buffer.prototype.readUint16BE =
Buffer.prototype.readUInt16BE = function readUInt16BE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 2, this.length)
  return (this[offset] << 8) | this[offset + 1]
}

Buffer.prototype.readUint32LE =
Buffer.prototype.readUInt32LE = function readUInt32LE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)

  return ((this[offset]) |
      (this[offset + 1] << 8) |
      (this[offset + 2] << 16)) +
      (this[offset + 3] * 0x1000000)
}

Buffer.prototype.readUint32BE =
Buffer.prototype.readUInt32BE = function readUInt32BE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset] * 0x1000000) +
    ((this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    this[offset + 3])
}

Buffer.prototype.readBigUInt64LE = defineBigIntMethod(function readBigUInt64LE (offset) {
  offset = offset >>> 0
  validateNumber(offset, 'offset')
  const first = this[offset]
  const last = this[offset + 7]
  if (first === undefined || last === undefined) {
    boundsError(offset, this.length - 8)
  }

  const lo = first +
    this[++offset] * 2 ** 8 +
    this[++offset] * 2 ** 16 +
    this[++offset] * 2 ** 24

  const hi = this[++offset] +
    this[++offset] * 2 ** 8 +
    this[++offset] * 2 ** 16 +
    last * 2 ** 24

  return BigInt(lo) + (BigInt(hi) << BigInt(32))
})

Buffer.prototype.readBigUInt64BE = defineBigIntMethod(function readBigUInt64BE (offset) {
  offset = offset >>> 0
  validateNumber(offset, 'offset')
  const first = this[offset]
  const last = this[offset + 7]
  if (first === undefined || last === undefined) {
    boundsError(offset, this.length - 8)
  }

  const hi = first * 2 ** 24 +
    this[++offset] * 2 ** 16 +
    this[++offset] * 2 ** 8 +
    this[++offset]

  const lo = this[++offset] * 2 ** 24 +
    this[++offset] * 2 ** 16 +
    this[++offset] * 2 ** 8 +
    last

  return (BigInt(hi) << BigInt(32)) + BigInt(lo)
})

Buffer.prototype.readIntLE = function readIntLE (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  let val = this[offset]
  let mul = 1
  let i = 0
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul
  }
  mul *= 0x80

  if (val >= mul) val -= Math.pow(2, 8 * byteLength)

  return val
}

Buffer.prototype.readIntBE = function readIntBE (offset, byteLength, noAssert) {
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  let i = byteLength
  let mul = 1
  let val = this[offset + --i]
  while (i > 0 && (mul *= 0x100)) {
    val += this[offset + --i] * mul
  }
  mul *= 0x80

  if (val >= mul) val -= Math.pow(2, 8 * byteLength)

  return val
}

Buffer.prototype.readInt8 = function readInt8 (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 1, this.length)
  if (!(this[offset] & 0x80)) return (this[offset])
  return ((0xff - this[offset] + 1) * -1)
}

Buffer.prototype.readInt16LE = function readInt16LE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 2, this.length)
  const val = this[offset] | (this[offset + 1] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt16BE = function readInt16BE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 2, this.length)
  const val = this[offset + 1] | (this[offset] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt32LE = function readInt32LE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset]) |
    (this[offset + 1] << 8) |
    (this[offset + 2] << 16) |
    (this[offset + 3] << 24)
}

Buffer.prototype.readInt32BE = function readInt32BE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset] << 24) |
    (this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    (this[offset + 3])
}

Buffer.prototype.readBigInt64LE = defineBigIntMethod(function readBigInt64LE (offset) {
  offset = offset >>> 0
  validateNumber(offset, 'offset')
  const first = this[offset]
  const last = this[offset + 7]
  if (first === undefined || last === undefined) {
    boundsError(offset, this.length - 8)
  }

  const val = this[offset + 4] +
    this[offset + 5] * 2 ** 8 +
    this[offset + 6] * 2 ** 16 +
    (last << 24) // Overflow

  return (BigInt(val) << BigInt(32)) +
    BigInt(first +
    this[++offset] * 2 ** 8 +
    this[++offset] * 2 ** 16 +
    this[++offset] * 2 ** 24)
})

Buffer.prototype.readBigInt64BE = defineBigIntMethod(function readBigInt64BE (offset) {
  offset = offset >>> 0
  validateNumber(offset, 'offset')
  const first = this[offset]
  const last = this[offset + 7]
  if (first === undefined || last === undefined) {
    boundsError(offset, this.length - 8)
  }

  const val = (first << 24) + // Overflow
    this[++offset] * 2 ** 16 +
    this[++offset] * 2 ** 8 +
    this[++offset]

  return (BigInt(val) << BigInt(32)) +
    BigInt(this[++offset] * 2 ** 24 +
    this[++offset] * 2 ** 16 +
    this[++offset] * 2 ** 8 +
    last)
})

Buffer.prototype.readFloatLE = function readFloatLE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, true, 23, 4)
}

Buffer.prototype.readFloatBE = function readFloatBE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, false, 23, 4)
}

Buffer.prototype.readDoubleLE = function readDoubleLE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, true, 52, 8)
}

Buffer.prototype.readDoubleBE = function readDoubleBE (offset, noAssert) {
  offset = offset >>> 0
  if (!noAssert) checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, false, 52, 8)
}

function checkInt (buf, value, offset, ext, max, min) {
  if (!Buffer.isBuffer(buf)) throw new TypeError('"buffer" argument must be a Buffer instance')
  if (value > max || value < min) throw new RangeError('"value" argument is out of bounds')
  if (offset + ext > buf.length) throw new RangeError('Index out of range')
}

Buffer.prototype.writeUintLE =
Buffer.prototype.writeUIntLE = function writeUIntLE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) {
    const maxBytes = Math.pow(2, 8 * byteLength) - 1
    checkInt(this, value, offset, byteLength, maxBytes, 0)
  }

  let mul = 1
  let i = 0
  this[offset] = value & 0xFF
  while (++i < byteLength && (mul *= 0x100)) {
    this[offset + i] = (value / mul) & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeUintBE =
Buffer.prototype.writeUIntBE = function writeUIntBE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  byteLength = byteLength >>> 0
  if (!noAssert) {
    const maxBytes = Math.pow(2, 8 * byteLength) - 1
    checkInt(this, value, offset, byteLength, maxBytes, 0)
  }

  let i = byteLength - 1
  let mul = 1
  this[offset + i] = value & 0xFF
  while (--i >= 0 && (mul *= 0x100)) {
    this[offset + i] = (value / mul) & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeUint8 =
Buffer.prototype.writeUInt8 = function writeUInt8 (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 1, 0xff, 0)
  this[offset] = (value & 0xff)
  return offset + 1
}

Buffer.prototype.writeUint16LE =
Buffer.prototype.writeUInt16LE = function writeUInt16LE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0)
  this[offset] = (value & 0xff)
  this[offset + 1] = (value >>> 8)
  return offset + 2
}

Buffer.prototype.writeUint16BE =
Buffer.prototype.writeUInt16BE = function writeUInt16BE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0)
  this[offset] = (value >>> 8)
  this[offset + 1] = (value & 0xff)
  return offset + 2
}

Buffer.prototype.writeUint32LE =
Buffer.prototype.writeUInt32LE = function writeUInt32LE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0)
  this[offset + 3] = (value >>> 24)
  this[offset + 2] = (value >>> 16)
  this[offset + 1] = (value >>> 8)
  this[offset] = (value & 0xff)
  return offset + 4
}

Buffer.prototype.writeUint32BE =
Buffer.prototype.writeUInt32BE = function writeUInt32BE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0)
  this[offset] = (value >>> 24)
  this[offset + 1] = (value >>> 16)
  this[offset + 2] = (value >>> 8)
  this[offset + 3] = (value & 0xff)
  return offset + 4
}

function wrtBigUInt64LE (buf, value, offset, min, max) {
  checkIntBI(value, min, max, buf, offset, 7)

  let lo = Number(value & BigInt(0xffffffff))
  buf[offset++] = lo
  lo = lo >> 8
  buf[offset++] = lo
  lo = lo >> 8
  buf[offset++] = lo
  lo = lo >> 8
  buf[offset++] = lo
  let hi = Number(value >> BigInt(32) & BigInt(0xffffffff))
  buf[offset++] = hi
  hi = hi >> 8
  buf[offset++] = hi
  hi = hi >> 8
  buf[offset++] = hi
  hi = hi >> 8
  buf[offset++] = hi
  return offset
}

function wrtBigUInt64BE (buf, value, offset, min, max) {
  checkIntBI(value, min, max, buf, offset, 7)

  let lo = Number(value & BigInt(0xffffffff))
  buf[offset + 7] = lo
  lo = lo >> 8
  buf[offset + 6] = lo
  lo = lo >> 8
  buf[offset + 5] = lo
  lo = lo >> 8
  buf[offset + 4] = lo
  let hi = Number(value >> BigInt(32) & BigInt(0xffffffff))
  buf[offset + 3] = hi
  hi = hi >> 8
  buf[offset + 2] = hi
  hi = hi >> 8
  buf[offset + 1] = hi
  hi = hi >> 8
  buf[offset] = hi
  return offset + 8
}

Buffer.prototype.writeBigUInt64LE = defineBigIntMethod(function writeBigUInt64LE (value, offset = 0) {
  return wrtBigUInt64LE(this, value, offset, BigInt(0), BigInt('0xffffffffffffffff'))
})

Buffer.prototype.writeBigUInt64BE = defineBigIntMethod(function writeBigUInt64BE (value, offset = 0) {
  return wrtBigUInt64BE(this, value, offset, BigInt(0), BigInt('0xffffffffffffffff'))
})

Buffer.prototype.writeIntLE = function writeIntLE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) {
    const limit = Math.pow(2, (8 * byteLength) - 1)

    checkInt(this, value, offset, byteLength, limit - 1, -limit)
  }

  let i = 0
  let mul = 1
  let sub = 0
  this[offset] = value & 0xFF
  while (++i < byteLength && (mul *= 0x100)) {
    if (value < 0 && sub === 0 && this[offset + i - 1] !== 0) {
      sub = 1
    }
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeIntBE = function writeIntBE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) {
    const limit = Math.pow(2, (8 * byteLength) - 1)

    checkInt(this, value, offset, byteLength, limit - 1, -limit)
  }

  let i = byteLength - 1
  let mul = 1
  let sub = 0
  this[offset + i] = value & 0xFF
  while (--i >= 0 && (mul *= 0x100)) {
    if (value < 0 && sub === 0 && this[offset + i + 1] !== 0) {
      sub = 1
    }
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeInt8 = function writeInt8 (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 1, 0x7f, -0x80)
  if (value < 0) value = 0xff + value + 1
  this[offset] = (value & 0xff)
  return offset + 1
}

Buffer.prototype.writeInt16LE = function writeInt16LE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  this[offset] = (value & 0xff)
  this[offset + 1] = (value >>> 8)
  return offset + 2
}

Buffer.prototype.writeInt16BE = function writeInt16BE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  this[offset] = (value >>> 8)
  this[offset + 1] = (value & 0xff)
  return offset + 2
}

Buffer.prototype.writeInt32LE = function writeInt32LE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  this[offset] = (value & 0xff)
  this[offset + 1] = (value >>> 8)
  this[offset + 2] = (value >>> 16)
  this[offset + 3] = (value >>> 24)
  return offset + 4
}

Buffer.prototype.writeInt32BE = function writeInt32BE (value, offset, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  if (value < 0) value = 0xffffffff + value + 1
  this[offset] = (value >>> 24)
  this[offset + 1] = (value >>> 16)
  this[offset + 2] = (value >>> 8)
  this[offset + 3] = (value & 0xff)
  return offset + 4
}

Buffer.prototype.writeBigInt64LE = defineBigIntMethod(function writeBigInt64LE (value, offset = 0) {
  return wrtBigUInt64LE(this, value, offset, -BigInt('0x8000000000000000'), BigInt('0x7fffffffffffffff'))
})

Buffer.prototype.writeBigInt64BE = defineBigIntMethod(function writeBigInt64BE (value, offset = 0) {
  return wrtBigUInt64BE(this, value, offset, -BigInt('0x8000000000000000'), BigInt('0x7fffffffffffffff'))
})

function checkIEEE754 (buf, value, offset, ext, max, min) {
  if (offset + ext > buf.length) throw new RangeError('Index out of range')
  if (offset < 0) throw new RangeError('Index out of range')
}

function writeFloat (buf, value, offset, littleEndian, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 4, 3.4028234663852886e+38, -3.4028234663852886e+38)
  }
  ieee754.write(buf, value, offset, littleEndian, 23, 4)
  return offset + 4
}

Buffer.prototype.writeFloatLE = function writeFloatLE (value, offset, noAssert) {
  return writeFloat(this, value, offset, true, noAssert)
}

Buffer.prototype.writeFloatBE = function writeFloatBE (value, offset, noAssert) {
  return writeFloat(this, value, offset, false, noAssert)
}

function writeDouble (buf, value, offset, littleEndian, noAssert) {
  value = +value
  offset = offset >>> 0
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 8, 1.7976931348623157E+308, -1.7976931348623157E+308)
  }
  ieee754.write(buf, value, offset, littleEndian, 52, 8)
  return offset + 8
}

Buffer.prototype.writeDoubleLE = function writeDoubleLE (value, offset, noAssert) {
  return writeDouble(this, value, offset, true, noAssert)
}

Buffer.prototype.writeDoubleBE = function writeDoubleBE (value, offset, noAssert) {
  return writeDouble(this, value, offset, false, noAssert)
}

// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
Buffer.prototype.copy = function copy (target, targetStart, start, end) {
  if (!Buffer.isBuffer(target)) throw new TypeError('argument should be a Buffer')
  if (!start) start = 0
  if (!end && end !== 0) end = this.length
  if (targetStart >= target.length) targetStart = target.length
  if (!targetStart) targetStart = 0
  if (end > 0 && end < start) end = start

  // Copy 0 bytes; we're done
  if (end === start) return 0
  if (target.length === 0 || this.length === 0) return 0

  // Fatal error conditions
  if (targetStart < 0) {
    throw new RangeError('targetStart out of bounds')
  }
  if (start < 0 || start >= this.length) throw new RangeError('Index out of range')
  if (end < 0) throw new RangeError('sourceEnd out of bounds')

  // Are we oob?
  if (end > this.length) end = this.length
  if (target.length - targetStart < end - start) {
    end = target.length - targetStart + start
  }

  const len = end - start

  if (this === target && typeof Uint8Array.prototype.copyWithin === 'function') {
    // Use built-in when available, missing from IE11
    this.copyWithin(targetStart, start, end)
  } else {
    Uint8Array.prototype.set.call(
      target,
      this.subarray(start, end),
      targetStart
    )
  }

  return len
}

// Usage:
//    buffer.fill(number[, offset[, end]])
//    buffer.fill(buffer[, offset[, end]])
//    buffer.fill(string[, offset[, end]][, encoding])
Buffer.prototype.fill = function fill (val, start, end, encoding) {
  // Handle string cases:
  if (typeof val === 'string') {
    if (typeof start === 'string') {
      encoding = start
      start = 0
      end = this.length
    } else if (typeof end === 'string') {
      encoding = end
      end = this.length
    }
    if (encoding !== undefined && typeof encoding !== 'string') {
      throw new TypeError('encoding must be a string')
    }
    if (typeof encoding === 'string' && !Buffer.isEncoding(encoding)) {
      throw new TypeError('Unknown encoding: ' + encoding)
    }
    if (val.length === 1) {
      const code = val.charCodeAt(0)
      if ((encoding === 'utf8' && code < 128) ||
          encoding === 'latin1') {
        // Fast path: If `val` fits into a single byte, use that numeric value.
        val = code
      }
    }
  } else if (typeof val === 'number') {
    val = val & 255
  } else if (typeof val === 'boolean') {
    val = Number(val)
  }

  // Invalid ranges are not set to a default, so can range check early.
  if (start < 0 || this.length < start || this.length < end) {
    throw new RangeError('Out of range index')
  }

  if (end <= start) {
    return this
  }

  start = start >>> 0
  end = end === undefined ? this.length : end >>> 0

  if (!val) val = 0

  let i
  if (typeof val === 'number') {
    for (i = start; i < end; ++i) {
      this[i] = val
    }
  } else {
    const bytes = Buffer.isBuffer(val)
      ? val
      : Buffer.from(val, encoding)
    const len = bytes.length
    if (len === 0) {
      throw new TypeError('The value "' + val +
        '" is invalid for argument "value"')
    }
    for (i = 0; i < end - start; ++i) {
      this[i + start] = bytes[i % len]
    }
  }

  return this
}

// CUSTOM ERRORS
// =============

// Simplified versions from Node, changed for Buffer-only usage
const errors = {}
function E (sym, getMessage, Base) {
  errors[sym] = class NodeError extends Base {
    constructor () {
      super()

      Object.defineProperty(this, 'message', {
        value: getMessage.apply(this, arguments),
        writable: true,
        configurable: true
      })

      // Add the error code to the name to include it in the stack trace.
      this.name = `${this.name} [${sym}]`
      // Access the stack to generate the error message including the error code
      // from the name.
      this.stack // eslint-disable-line no-unused-expressions
      // Reset the name to the actual name.
      delete this.name
    }

    get code () {
      return sym
    }

    set code (value) {
      Object.defineProperty(this, 'code', {
        configurable: true,
        enumerable: true,
        value,
        writable: true
      })
    }

    toString () {
      return `${this.name} [${sym}]: ${this.message}`
    }
  }
}

E('ERR_BUFFER_OUT_OF_BOUNDS',
  function (name) {
    if (name) {
      return `${name} is outside of buffer bounds`
    }

    return 'Attempt to access memory outside buffer bounds'
  }, RangeError)
E('ERR_INVALID_ARG_TYPE',
  function (name, actual) {
    return `The "${name}" argument must be of type number. Received type ${typeof actual}`
  }, TypeError)
E('ERR_OUT_OF_RANGE',
  function (str, range, input) {
    let msg = `The value of "${str}" is out of range.`
    let received = input
    if (Number.isInteger(input) && Math.abs(input) > 2 ** 32) {
      received = addNumericalSeparator(String(input))
    } else if (typeof input === 'bigint') {
      received = String(input)
      if (input > BigInt(2) ** BigInt(32) || input < -(BigInt(2) ** BigInt(32))) {
        received = addNumericalSeparator(received)
      }
      received += 'n'
    }
    msg += ` It must be ${range}. Received ${received}`
    return msg
  }, RangeError)

function addNumericalSeparator (val) {
  let res = ''
  let i = val.length
  const start = val[0] === '-' ? 1 : 0
  for (; i >= start + 4; i -= 3) {
    res = `_${val.slice(i - 3, i)}${res}`
  }
  return `${val.slice(0, i)}${res}`
}

// CHECK FUNCTIONS
// ===============

function checkBounds (buf, offset, byteLength) {
  validateNumber(offset, 'offset')
  if (buf[offset] === undefined || buf[offset + byteLength] === undefined) {
    boundsError(offset, buf.length - (byteLength + 1))
  }
}

function checkIntBI (value, min, max, buf, offset, byteLength) {
  if (value > max || value < min) {
    const n = typeof min === 'bigint' ? 'n' : ''
    let range
    if (byteLength > 3) {
      if (min === 0 || min === BigInt(0)) {
        range = `>= 0${n} and < 2${n} ** ${(byteLength + 1) * 8}${n}`
      } else {
        range = `>= -(2${n} ** ${(byteLength + 1) * 8 - 1}${n}) and < 2 ** ` +
                `${(byteLength + 1) * 8 - 1}${n}`
      }
    } else {
      range = `>= ${min}${n} and <= ${max}${n}`
    }
    throw new errors.ERR_OUT_OF_RANGE('value', range, value)
  }
  checkBounds(buf, offset, byteLength)
}

function validateNumber (value, name) {
  if (typeof value !== 'number') {
    throw new errors.ERR_INVALID_ARG_TYPE(name, 'number', value)
  }
}

function boundsError (value, length, type) {
  if (Math.floor(value) !== value) {
    validateNumber(value, type)
    throw new errors.ERR_OUT_OF_RANGE(type || 'offset', 'an integer', value)
  }

  if (length < 0) {
    throw new errors.ERR_BUFFER_OUT_OF_BOUNDS()
  }

  throw new errors.ERR_OUT_OF_RANGE(type || 'offset',
                                    `>= ${type ? 1 : 0} and <= ${length}`,
                                    value)
}

// HELPER FUNCTIONS
// ================

const INVALID_BASE64_RE = /[^+/0-9A-Za-z-_]/g

function base64clean (str) {
  // Node takes equal signs as end of the Base64 encoding
  str = str.split('=')[0]
  // Node strips out invalid characters like \n and \t from the string, base64-js does not
  str = str.trim().replace(INVALID_BASE64_RE, '')
  // Node converts strings with length < 2 to ''
  if (str.length < 2) return ''
  // Node allows for non-padded base64 strings (missing trailing ===), base64-js does not
  while (str.length % 4 !== 0) {
    str = str + '='
  }
  return str
}

function utf8ToBytes (string, units) {
  units = units || Infinity
  let codePoint
  const length = string.length
  let leadSurrogate = null
  const bytes = []

  for (let i = 0; i < length; ++i) {
    codePoint = string.charCodeAt(i)

    // is surrogate component
    if (codePoint > 0xD7FF && codePoint < 0xE000) {
      // last char was a lead
      if (!leadSurrogate) {
        // no lead yet
        if (codePoint > 0xDBFF) {
          // unexpected trail
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          continue
        } else if (i + 1 === length) {
          // unpaired lead
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          continue
        }

        // valid lead
        leadSurrogate = codePoint

        continue
      }

      // 2 leads in a row
      if (codePoint < 0xDC00) {
        if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
        leadSurrogate = codePoint
        continue
      }

      // valid surrogate pair
      codePoint = (leadSurrogate - 0xD800 << 10 | codePoint - 0xDC00) + 0x10000
    } else if (leadSurrogate) {
      // valid bmp char, but last char was a lead
      if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
    }

    leadSurrogate = null

    // encode utf8
    if (codePoint < 0x80) {
      if ((units -= 1) < 0) break
      bytes.push(codePoint)
    } else if (codePoint < 0x800) {
      if ((units -= 2) < 0) break
      bytes.push(
        codePoint >> 0x6 | 0xC0,
        codePoint & 0x3F | 0x80
      )
    } else if (codePoint < 0x10000) {
      if ((units -= 3) < 0) break
      bytes.push(
        codePoint >> 0xC | 0xE0,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      )
    } else if (codePoint < 0x110000) {
      if ((units -= 4) < 0) break
      bytes.push(
        codePoint >> 0x12 | 0xF0,
        codePoint >> 0xC & 0x3F | 0x80,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      )
    } else {
      throw new Error('Invalid code point')
    }
  }

  return bytes
}

function asciiToBytes (str) {
  const byteArray = []
  for (let i = 0; i < str.length; ++i) {
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push(str.charCodeAt(i) & 0xFF)
  }
  return byteArray
}

function utf16leToBytes (str, units) {
  let c, hi, lo
  const byteArray = []
  for (let i = 0; i < str.length; ++i) {
    if ((units -= 2) < 0) break

    c = str.charCodeAt(i)
    hi = c >> 8
    lo = c % 256
    byteArray.push(lo)
    byteArray.push(hi)
  }

  return byteArray
}

function base64ToBytes (str) {
  return base64.toByteArray(base64clean(str))
}

function blitBuffer (src, dst, offset, length) {
  let i
  for (i = 0; i < length; ++i) {
    if ((i + offset >= dst.length) || (i >= src.length)) break
    dst[i + offset] = src[i]
  }
  return i
}

// ArrayBuffer or Uint8Array objects from other contexts (i.e. iframes) do not pass
// the `instanceof` check but they should be treated as of that type.
// See: https://github.com/feross/buffer/issues/166
function isInstance (obj, type) {
  return obj instanceof type ||
    (obj != null && obj.constructor != null && obj.constructor.name != null &&
      obj.constructor.name === type.name)
}
function numberIsNaN (obj) {
  // For IE11 support
  return obj !== obj // eslint-disable-line no-self-compare
}

// Create lookup table for `toString('hex')`
// See: https://github.com/feross/buffer/issues/219
const hexSliceLookupTable = (function () {
  const alphabet = '0123456789abcdef'
  const table = new Array(256)
  for (let i = 0; i < 16; ++i) {
    const i16 = i * 16
    for (let j = 0; j < 16; ++j) {
      table[i16 + j] = alphabet[i] + alphabet[j]
    }
  }
  return table
})()

// Return not function with Error if BigInt not supported
function defineBigIntMethod (fn) {
  return typeof BigInt === 'undefined' ? BufferBigIntNotDefined : fn
}

function BufferBigIntNotDefined () {
  throw new Error('BigInt not supported')
}


/***/ },

/***/ 9318
(__unused_webpack_module, exports) {

/*! ieee754. BSD-3-Clause License. Feross Aboukhadijeh <https://feross.org/opensource> */
exports.read = function (buffer, offset, isLE, mLen, nBytes) {
  var e, m
  var eLen = (nBytes * 8) - mLen - 1
  var eMax = (1 << eLen) - 1
  var eBias = eMax >> 1
  var nBits = -7
  var i = isLE ? (nBytes - 1) : 0
  var d = isLE ? -1 : 1
  var s = buffer[offset + i]

  i += d

  e = s & ((1 << (-nBits)) - 1)
  s >>= (-nBits)
  nBits += eLen
  for (; nBits > 0; e = (e * 256) + buffer[offset + i], i += d, nBits -= 8) {}

  m = e & ((1 << (-nBits)) - 1)
  e >>= (-nBits)
  nBits += mLen
  for (; nBits > 0; m = (m * 256) + buffer[offset + i], i += d, nBits -= 8) {}

  if (e === 0) {
    e = 1 - eBias
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity)
  } else {
    m = m + Math.pow(2, mLen)
    e = e - eBias
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen)
}

exports.write = function (buffer, value, offset, isLE, mLen, nBytes) {
  var e, m, c
  var eLen = (nBytes * 8) - mLen - 1
  var eMax = (1 << eLen) - 1
  var eBias = eMax >> 1
  var rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0)
  var i = isLE ? 0 : (nBytes - 1)
  var d = isLE ? 1 : -1
  var s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0

  value = Math.abs(value)

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0
    e = eMax
  } else {
    e = Math.floor(Math.log(value) / Math.LN2)
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--
      c *= 2
    }
    if (e + eBias >= 1) {
      value += rt / c
    } else {
      value += rt * Math.pow(2, 1 - eBias)
    }
    if (value * c >= 2) {
      e++
      c /= 2
    }

    if (e + eBias >= eMax) {
      m = 0
      e = eMax
    } else if (e + eBias >= 1) {
      m = ((value * c) - 1) * Math.pow(2, mLen)
      e = e + eBias
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen)
      e = 0
    }
  }

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8) {}

  e = (e << mLen) | m
  eLen += mLen
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8) {}

  buffer[offset + i - d] |= s * 128
}


/***/ },

/***/ 6386
(__unused_webpack_module, exports, __webpack_require__) {

"use strict";
/* provided dependency */ var Buffer = __webpack_require__(1048).Buffer;

var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.BaseLogger = exports.loggerEnvironment = void 0;
exports.createLoggerEnvironment = createLoggerEnvironment;
const formatTemplate_js_1 = __webpack_require__(6710);
const interfaces_js_1 = __webpack_require__(299);
const environment_js_1 = __webpack_require__(19);
const errorUtils_js_1 = __webpack_require__(8078);
const jsonStringifyRecursive_js_1 = __webpack_require__(6008);
const metaFormatting_js_1 = __webpack_require__(8799);
const stackTrace_js_1 = __webpack_require__(5456);
const util_inspect_polyfill_js_1 = __webpack_require__(6198);
const urlToObj_js_1 = __webpack_require__(9634);
function createLoggerEnvironment() {
    const runtimeInfo = detectRuntimeInfo();
    const meta = createRuntimeMeta(runtimeInfo);
    const usesBrowserStack = runtimeInfo.name === "browser" || runtimeInfo.name === "worker";
    const callerIgnorePatterns = usesBrowserStack
        ? [...(0, stackTrace_js_1.getDefaultIgnorePatterns)(), /node_modules[\\/].*tslog/i]
        : [...(0, stackTrace_js_1.getDefaultIgnorePatterns)(), /node:(?:internal|vm)/i, /\binternal[\\/]/i];
    let cachedCwd;
    const environment = {
        getMeta(logLevelId, logLevelName, stackDepthLevel, hideLogPositionForPerformance, name, parentNames, extraIgnorePatterns) {
            return Object.assign({}, meta, {
                name,
                parentNames,
                date: new Date(),
                logLevelId,
                logLevelName,
                path: !hideLogPositionForPerformance ? environment.getCallerStackFrame(stackDepthLevel, new Error(), extraIgnorePatterns) : undefined,
            });
        },
        getCallerStackFrame(stackDepthLevel, error = new Error(), extraIgnorePatterns) {
            const frames = (0, stackTrace_js_1.buildStackTrace)(error, (line) => parseStackLine(line));
            if (frames.length === 0) {
                return {};
            }
            const ignorePatterns = extraIgnorePatterns != null && extraIgnorePatterns.length > 0 ? [...callerIgnorePatterns, ...extraIgnorePatterns] : callerIgnorePatterns;
            const autoIndex = (0, stackTrace_js_1.findFirstExternalFrameIndex)(frames, ignorePatterns);
            const useManualIndex = Number.isFinite(stackDepthLevel) && stackDepthLevel >= 0;
            const resolvedIndex = useManualIndex ? (0, stackTrace_js_1.clampIndex)(stackDepthLevel, frames.length) : (0, stackTrace_js_1.clampIndex)(autoIndex, frames.length);
            return frames[resolvedIndex] ?? {};
        },
        getErrorTrace(error) {
            return (0, stackTrace_js_1.buildStackTrace)(error, (line) => parseStackLine(line));
        },
        isError(value) {
            return isNativeError(value);
        },
        isBuffer(value) {
            return typeof Buffer !== "undefined" && typeof Buffer.isBuffer === "function" ? Buffer.isBuffer(value) : false;
        },
        prettyFormatLogObj(maskedArgs, settings) {
            return maskedArgs.reduce((result, arg) => {
                if (environment.isError(arg)) {
                    result.errors.push(environment.prettyFormatErrorObj(arg, settings));
                }
                else {
                    result.args.push(arg);
                }
                return result;
            }, { args: [], errors: [] });
        },
        prettyFormatErrorObj(error, settings) {
            const stackLines = formatStackFrames(environment.getErrorTrace(error), settings);
            const causeSections = (0, errorUtils_js_1.collectErrorCauses)(error).map((cause, index) => {
                const header = `Caused by (${index + 1}): ${cause.name ?? "Error"}${cause.message ? `: ${cause.message}` : ""}`;
                const frames = formatStackFrames((0, stackTrace_js_1.buildStackTrace)(cause, (line) => parseStackLine(line)), settings);
                return [header, ...frames].join("\n");
            });
            const placeholderValuesError = {
                errorName: ` ${error.name} `,
                errorMessage: formatErrorMessage(error),
                errorStack: [...stackLines, ...causeSections].join("\n"),
            };
            return (0, formatTemplate_js_1.formatTemplate)(settings, settings.prettyErrorTemplate, placeholderValuesError);
        },
        transportFormatted(logMetaMarkup, logArgs, logErrors, logMeta, settings) {
            const prettyLogs = settings.stylePrettyLogs !== false;
            const logErrorsStr = (logErrors.length > 0 && logArgs.length > 0 ? "\n" : "") + logErrors.join("\n");
            const sanitizedMetaMarkup = stripAnsi(logMetaMarkup);
            const metaMarkupForText = prettyLogs ? logMetaMarkup : sanitizedMetaMarkup;
            const log = getPrettyLogMethod(logMeta?.logLevelName, settings.prettyLogLevelMethod);
            if (shouldUseCss(prettyLogs)) {
                settings.prettyInspectOptions.colors = false;
                const formattedArgs = formatWithOptionsSafe(settings.prettyInspectOptions, logArgs);
                const cssMeta = logMeta != null ? buildCssMetaOutput(settings, logMeta) : { text: sanitizedMetaMarkup, styles: [] };
                const hasCssMeta = cssMeta.text.length > 0 && cssMeta.styles.length > 0;
                const metaOutput = hasCssMeta ? cssMeta.text : sanitizedMetaMarkup;
                const output = metaOutput + formattedArgs + logErrorsStr;
                if (hasCssMeta) {
                    log(output, ...cssMeta.styles);
                }
                else {
                    log(output);
                }
                return;
            }
            settings.prettyInspectOptions.colors = prettyLogs;
            const formattedArgs = formatWithOptionsSafe(settings.prettyInspectOptions, logArgs);
            log(metaMarkupForText + formattedArgs + logErrorsStr);
        },
        transportJSON(json) {
            console.log((0, jsonStringifyRecursive_js_1.jsonStringifyRecursive)(json));
        },
    };
    if (getNodeEnv() === "test") {
        environment.__resetWorkingDirectoryCacheForTests = () => {
            cachedCwd = undefined;
        };
    }
    return environment;
    function parseStackLine(line) {
        return usesBrowserStack ? parseBrowserStackLine(line) : parseServerStackLine(line);
    }
    function parseServerStackLine(rawLine) {
        if (typeof rawLine !== "string" || rawLine.length === 0) {
            return undefined;
        }
        const trimmedLine = rawLine.trim();
        if (!trimmedLine.includes(" at ") && !trimmedLine.startsWith("at ")) {
            return undefined;
        }
        const line = trimmedLine.replace(/^at\s+/, "");
        let method;
        let location = line;
        const methodMatch = line.match(/^(.*?)\s+\((.*)\)$/);
        if (methodMatch) {
            method = methodMatch[1];
            location = methodMatch[2];
        }
        const sanitizedLocation = location.replace(/^\(/, "").replace(/\)$/, "");
        const withoutQuery = sanitizedLocation.replace(/\?.*$/, "");
        let fileLine;
        let fileColumn;
        let filePathCandidate = withoutQuery;
        const segments = withoutQuery.split(":");
        if (segments.length >= 3 && /^\d+$/.test(segments[segments.length - 1])) {
            fileColumn = segments.pop();
            fileLine = segments.pop();
            filePathCandidate = segments.join(":");
        }
        else if (segments.length >= 2 && /^\d+$/.test(segments[segments.length - 1])) {
            fileLine = segments.pop();
            filePathCandidate = segments.join(":");
        }
        let normalizedPath = filePathCandidate.replace(/^file:\/\//, "");
        const cwd = getWorkingDirectory();
        if (cwd != null && normalizedPath.startsWith(cwd)) {
            normalizedPath = normalizedPath.slice(cwd.length);
            normalizedPath = normalizedPath.replace(/^[\\/]/, "");
        }
        if (normalizedPath.length === 0) {
            normalizedPath = filePathCandidate;
        }
        const normalizedPathWithoutLine = normalizeFilePath(normalizedPath);
        const effectivePath = normalizedPathWithoutLine.length > 0 ? normalizedPathWithoutLine : normalizedPath;
        const pathSegments = effectivePath.split(/\\|\//);
        const fileName = pathSegments[pathSegments.length - 1];
        const fileNameWithLine = fileName && fileLine ? `${fileName}:${fileLine}` : undefined;
        const filePathWithLine = effectivePath && fileLine ? `${effectivePath}:${fileLine}` : undefined;
        return {
            fullFilePath: sanitizedLocation,
            fileName,
            fileNameWithLine,
            fileColumn,
            fileLine,
            filePath: effectivePath,
            filePathWithLine,
            method,
        };
    }
    function parseBrowserStackLine(line) {
        const href = globalThis.location?.origin;
        if (line == null) {
            return undefined;
        }
        const match = line.match(BROWSER_PATH_REGEX);
        if (!match) {
            return undefined;
        }
        const filePath = match[1]?.replace(/\?.*$/, "");
        if (filePath == null) {
            return undefined;
        }
        const pathParts = filePath.split("/");
        const fileLine = match[2];
        const fileColumn = match[3];
        const fileName = pathParts[pathParts.length - 1];
        return {
            fullFilePath: href ? `${href}${filePath}` : filePath,
            fileName,
            fileNameWithLine: fileName && fileLine ? `${fileName}:${fileLine}` : undefined,
            fileColumn,
            fileLine,
            filePath,
            filePathWithLine: fileLine ? `${filePath}:${fileLine}` : undefined,
            method: undefined,
        };
    }
    function formatStackFrames(frames, settings) {
        return frames.map((stackFrame) => (0, formatTemplate_js_1.formatTemplate)(settings, settings.prettyErrorStackTemplate, { ...stackFrame }, true));
    }
    function formatErrorMessage(error) {
        return Object.getOwnPropertyNames(error)
            .filter((key) => key !== "stack" && key !== "cause")
            .reduce((result, key) => {
            const value = error[key];
            if (typeof value === "function") {
                return result;
            }
            result.push(stringifyFallback(value));
            return result;
        }, [])
            .join(", ");
    }
    function shouldUseCss(prettyLogs) {
        return prettyLogs && (runtimeInfo.name === "browser" || runtimeInfo.name === "worker") && (0, environment_js_1.consoleSupportsCssStyling)();
    }
    function stripAnsi(value) {
        return value.replace(ANSI_REGEX, "");
    }
    function getPrettyLogMethod(logLevelName, prettyLogLevelMethod) {
        if (logLevelName && prettyLogLevelMethod?.[logLevelName]) {
            return prettyLogLevelMethod[logLevelName];
        }
        if (prettyLogLevelMethod?.["*"]) {
            return prettyLogLevelMethod["*"];
        }
        return console.log;
    }
    function buildCssMetaOutput(settings, metaValue) {
        if (metaValue == null) {
            return { text: "", styles: [] };
        }
        const { template, placeholders } = (0, metaFormatting_js_1.buildPrettyMeta)(settings, metaValue);
        const parts = [];
        const styles = [];
        let lastIndex = 0;
        const placeholderRegex = /{{(.+?)}}/g;
        let match;
        while ((match = placeholderRegex.exec(template)) != null) {
            if (match.index > lastIndex) {
                parts.push(template.slice(lastIndex, match.index));
            }
            const key = match[1];
            const rawValue = placeholders[key] != null ? String(placeholders[key]) : "";
            const tokens = collectStyleTokens(settings.prettyLogStyles?.[key], rawValue);
            const css = tokensToCss(tokens);
            if (css.length > 0) {
                parts.push(`%c${rawValue}%c`);
                styles.push(css, "");
            }
            else {
                parts.push(rawValue);
            }
            lastIndex = placeholderRegex.lastIndex;
        }
        if (lastIndex < template.length) {
            parts.push(template.slice(lastIndex));
        }
        return {
            text: parts.join(""),
            styles,
        };
    }
    function collectStyleTokens(style, value) {
        if (style == null) {
            return [];
        }
        if (typeof style === "string") {
            return [style];
        }
        if (Array.isArray(style)) {
            return style.flatMap((token) => collectStyleTokens(token, value));
        }
        if (typeof style === "object") {
            const normalizedValue = value.trim();
            const nextStyle = style[normalizedValue] ?? style["*"];
            if (nextStyle == null) {
                return [];
            }
            return collectStyleTokens(nextStyle, value);
        }
        return [];
    }
    function tokensToCss(tokens) {
        const seen = new Set();
        const cssParts = [];
        for (const token of tokens) {
            const css = styleTokenToCss(token);
            if (css != null && css.length > 0 && !seen.has(css)) {
                seen.add(css);
                cssParts.push(css);
            }
        }
        return cssParts.join("; ");
    }
    function styleTokenToCss(token) {
        const color = COLOR_TOKENS[token];
        if (color != null) {
            return `color: ${color}`;
        }
        const background = BACKGROUND_TOKENS[token];
        if (background != null) {
            return `background-color: ${background}`;
        }
        switch (token) {
            case "bold":
                return "font-weight: bold";
            case "dim":
                return "opacity: 0.75";
            case "italic":
                return "font-style: italic";
            case "underline":
                return "text-decoration: underline";
            case "overline":
                return "text-decoration: overline";
            case "inverse":
                return "filter: invert(1)";
            case "hidden":
                return "visibility: hidden";
            case "strikethrough":
                return "text-decoration: line-through";
            default:
                return undefined;
        }
    }
    function getWorkingDirectory() {
        if (cachedCwd === undefined) {
            cachedCwd = (0, environment_js_1.safeGetCwd)() ?? null;
        }
        return cachedCwd ?? undefined;
    }
    function shouldCaptureHostname() {
        return runtimeInfo.name === "node" || runtimeInfo.name === "deno" || runtimeInfo.name === "bun";
    }
    function shouldCaptureRuntimeVersion() {
        return runtimeInfo.name === "node" || runtimeInfo.name === "deno" || runtimeInfo.name === "bun";
    }
    function createRuntimeMeta(info) {
        if (info.name === "browser" || info.name === "worker") {
            return {
                runtime: info.name,
                browser: info.userAgent,
            };
        }
        const metaStatic = {
            runtime: info.name,
        };
        if (shouldCaptureRuntimeVersion()) {
            metaStatic.runtimeVersion = info.version ?? "unknown";
        }
        if (shouldCaptureHostname()) {
            metaStatic.hostname = info.hostname ?? "unknown";
        }
        return metaStatic;
    }
    function formatWithOptionsSafe(options, args) {
        try {
            return (0, util_inspect_polyfill_js_1.formatWithOptions)(options, ...args);
        }
        catch {
            return args.map(stringifyFallback).join(" ");
        }
    }
    function stringifyFallback(value) {
        if (typeof value === "string") {
            return value;
        }
        try {
            return JSON.stringify(value);
        }
        catch {
            return String(value);
        }
    }
    function normalizeFilePath(value) {
        if (typeof value !== "string" || value.length === 0) {
            return value;
        }
        const replaced = value.replace(/\\+/g, "\\").replace(/\\/g, "/");
        const hasRootDoubleSlash = replaced.startsWith("//");
        const hasLeadingSlash = replaced.startsWith("/") && !hasRootDoubleSlash;
        const driveMatch = replaced.match(/^[A-Za-z]:/);
        const drivePrefix = driveMatch ? driveMatch[0] : "";
        const withoutDrive = drivePrefix ? replaced.slice(drivePrefix.length) : replaced;
        const segments = withoutDrive.split("/");
        const normalizedSegments = [];
        for (const segment of segments) {
            if (segment === "" || segment === ".") {
                continue;
            }
            if (segment === "..") {
                if (normalizedSegments.length > 0) {
                    normalizedSegments.pop();
                }
                continue;
            }
            normalizedSegments.push(segment);
        }
        let normalized = normalizedSegments.join("/");
        if (hasRootDoubleSlash) {
            normalized = `//${normalized}`;
        }
        else if (hasLeadingSlash) {
            normalized = `/${normalized}`;
        }
        else if (drivePrefix !== "") {
            normalized = `${drivePrefix}${normalized.length > 0 ? `/${normalized}` : ""}`;
        }
        if (normalized.length === 0) {
            return value;
        }
        return normalized;
    }
    function detectRuntimeInfo() {
        if ((0, environment_js_1.isBrowserEnvironment)()) {
            const navigatorObj = globalThis.navigator;
            return {
                name: "browser",
                userAgent: navigatorObj?.userAgent,
            };
        }
        const globalScope = globalThis;
        if (typeof globalScope.importScripts === "function") {
            return {
                name: "worker",
                userAgent: globalScope.navigator?.userAgent,
            };
        }
        const globalAny = globalThis;
        if (globalAny.Bun != null) {
            const bunVersion = globalAny.Bun.version;
            return {
                name: "bun",
                version: bunVersion != null ? `bun/${bunVersion}` : undefined,
                hostname: getEnvironmentHostname(globalAny.process, globalAny.Deno, globalAny.Bun, globalAny.location),
            };
        }
        if (globalAny.Deno != null) {
            const denoHostname = resolveDenoHostname(globalAny.Deno);
            const denoVersion = globalAny.Deno?.version?.deno;
            return {
                name: "deno",
                version: denoVersion != null ? `deno/${denoVersion}` : undefined,
                hostname: denoHostname ?? getEnvironmentHostname(globalAny.process, globalAny.Deno, globalAny.Bun, globalAny.location),
            };
        }
        if (globalAny.process?.versions?.node != null || globalAny.process?.version != null) {
            return {
                name: "node",
                version: globalAny.process?.versions?.node ?? globalAny.process?.version,
                hostname: getEnvironmentHostname(globalAny.process, globalAny.Deno, globalAny.Bun, globalAny.location),
            };
        }
        if (globalAny.process != null) {
            return {
                name: "node",
                version: "unknown",
                hostname: getEnvironmentHostname(globalAny.process, globalAny.Deno, globalAny.Bun, globalAny.location),
            };
        }
        return {
            name: "unknown",
        };
    }
    function getEnvironmentHostname(nodeProcess, deno, bun, location) {
        const processHostname = nodeProcess?.env?.HOSTNAME ?? nodeProcess?.env?.HOST ?? nodeProcess?.env?.COMPUTERNAME;
        if (processHostname != null && processHostname.length > 0) {
            return processHostname;
        }
        const bunHostname = bun?.env?.HOSTNAME ?? bun?.env?.HOST ?? bun?.env?.COMPUTERNAME;
        if (bunHostname != null && bunHostname.length > 0) {
            return bunHostname;
        }
        try {
            const denoEnvGet = deno?.env?.get;
            if (typeof denoEnvGet === "function") {
                const value = denoEnvGet("HOSTNAME");
                if (value != null && value.length > 0) {
                    return value;
                }
            }
        }
        catch {
        }
        if (location?.hostname != null && location.hostname.length > 0) {
            return location.hostname;
        }
        return undefined;
    }
    function resolveDenoHostname(deno) {
        try {
            if (typeof deno?.hostname === "function") {
                const value = deno.hostname();
                if (value != null && value.length > 0) {
                    return value;
                }
            }
        }
        catch {
        }
        const locationHostname = globalThis.location?.hostname;
        if (locationHostname != null && locationHostname.length > 0) {
            return locationHostname;
        }
        return undefined;
    }
    function getNodeEnv() {
        const globalProcess = globalThis?.process;
        return globalProcess?.env?.NODE_ENV;
    }
    function isNativeError(value) {
        if (value instanceof Error) {
            return true;
        }
        if (value != null && typeof value === "object") {
            const objectTag = Object.prototype.toString.call(value);
            if (/\[object .*Error\]/.test(objectTag)) {
                return true;
            }
            const name = value.name;
            if (typeof name === "string" && name.endsWith("Error")) {
                return true;
            }
        }
        return false;
    }
}
const ANSI_REGEX = /\u001b\[[0-9;]*m/g;
const COLOR_TOKENS = {
    black: "#000000",
    red: "#ef5350",
    green: "#66bb6a",
    yellow: "#fdd835",
    blue: "#42a5f5",
    magenta: "#ab47bc",
    cyan: "#26c6da",
    white: "#fafafa",
    blackBright: "#424242",
    redBright: "#ff7043",
    greenBright: "#81c784",
    yellowBright: "#ffe082",
    blueBright: "#64b5f6",
    magentaBright: "#ce93d8",
    cyanBright: "#4dd0e1",
    whiteBright: "#ffffff",
};
const BACKGROUND_TOKENS = {
    bgBlack: "#000000",
    bgRed: "#ef5350",
    bgGreen: "#66bb6a",
    bgYellow: "#fdd835",
    bgBlue: "#42a5f5",
    bgMagenta: "#ab47bc",
    bgCyan: "#26c6da",
    bgWhite: "#fafafa",
    bgBlackBright: "#424242",
    bgRedBright: "#ff7043",
    bgGreenBright: "#81c784",
    bgYellowBright: "#ffe082",
    bgBlueBright: "#64b5f6",
    bgMagentaBright: "#ce93d8",
    bgCyanBright: "#4dd0e1",
    bgWhiteBright: "#ffffff",
};
const BROWSER_PATH_REGEX = /(?:(?:file|https?|global code|[^@]+)@)?(?:file:)?((?:\/[^:/]+){2,})(?::(\d+))?(?::(\d+))?/;
const runtime = createLoggerEnvironment();
exports.loggerEnvironment = runtime;
__exportStar(__webpack_require__(299), exports);
function resolveLogLevelId(level) {
    if (level == null) {
        return undefined;
    }
    if (typeof level === "number") {
        return level;
    }
    const mapped = interfaces_js_1.DefaultLogLevels[level];
    return typeof mapped === "number" ? mapped : undefined;
}
function devWarningsEnabled() {
    const env = globalThis?.process?.env;
    if (env?.TSLOG_DISABLE_WARNINGS != null) {
        return false;
    }
    return env?.NODE_ENV !== "production";
}
function emitConfigWarning(message) {
    try {
        console.warn(`tslog: ${message}`);
    }
    catch {
    }
}
const KNOWN_PRETTY_PLACEHOLDERS = new Set([
    "yyyy",
    "mm",
    "dd",
    "hh",
    "MM",
    "ss",
    "ms",
    "dateIsoStr",
    "rawIsoStr",
    "logLevelName",
    "name",
    "nameWithDelimiterPrefix",
    "nameWithDelimiterSuffix",
    "fullFilePath",
    "filePathWithLine",
    "fileNameWithLine",
    "fileName",
    "filePath",
    "fileLine",
    "fileColumn",
]);
function validateSettingsParam(settings) {
    if (settings == null || !devWarningsEnabled()) {
        return;
    }
    if (settings.minLevel != null) {
        const resolved = resolveLogLevelId(settings.minLevel);
        if (resolved == null) {
            emitConfigWarning(`unknown minLevel ${JSON.stringify(settings.minLevel)}; expected a number 0-6 or a level name like "WARN".`);
        }
        else if (typeof settings.minLevel === "number" && (resolved < 0 || resolved > 6)) {
            emitConfigWarning(`minLevel ${resolved} is outside the default range 0-6; no default log method will be filtered as you might expect.`);
        }
    }
    if (typeof settings.prettyLogTemplate === "string") {
        const placeholderRegex = /{{\s*(.+?)\s*}}/g;
        let match;
        while ((match = placeholderRegex.exec(settings.prettyLogTemplate)) != null) {
            const key = match[1];
            if (!KNOWN_PRETTY_PLACEHOLDERS.has(key)) {
                emitConfigWarning(`prettyLogTemplate references unknown placeholder "{{${key}}}"; check the spelling (e.g. "{{logLevelName}}") or add it via overwrite.addPlaceholders.`);
            }
        }
    }
}
class BaseLogger {
    constructor(settings, logObj, stackDepthLevel = Number.NaN) {
        this.logObj = logObj;
        this.stackDepthLevel = stackDepthLevel;
        this.runtime = runtime;
        this.maxErrorCauseDepth = 5;
        validateSettingsParam(settings);
        this.settings = {
            type: settings?.type ?? "pretty",
            name: settings?.name,
            parentNames: settings?.parentNames,
            minLevel: resolveLogLevelId(settings?.minLevel) ?? 0,
            argumentsArrayName: settings?.argumentsArrayName,
            internalFramePatterns: settings?.internalFramePatterns,
            hideLogPositionForProduction: settings?.hideLogPositionForProduction ?? false,
            prettyLogTemplate: settings?.prettyLogTemplate ??
                "{{yyyy}}.{{mm}}.{{dd}} {{hh}}:{{MM}}:{{ss}}:{{ms}}\t{{logLevelName}}\t{{filePathWithLine}}{{nameWithDelimiterPrefix}}\t",
            prettyErrorTemplate: settings?.prettyErrorTemplate ?? "\n{{errorName}} {{errorMessage}}\nerror stack:\n{{errorStack}}",
            prettyErrorStackTemplate: settings?.prettyErrorStackTemplate ?? "  • {{fileName}}\t{{method}}\n\t{{filePathWithLine}}",
            prettyErrorParentNamesSeparator: settings?.prettyErrorParentNamesSeparator ?? ":",
            prettyErrorLoggerNameDelimiter: settings?.prettyErrorLoggerNameDelimiter ?? "\t",
            stylePrettyLogs: settings?.stylePrettyLogs ?? true,
            prettyLogTimeZone: settings?.prettyLogTimeZone ?? "UTC",
            prettyLogStyles: settings?.prettyLogStyles ?? {
                logLevelName: {
                    "*": ["bold", "black", "bgWhiteBright", "dim"],
                    SILLY: ["bold", "white"],
                    TRACE: ["bold", "whiteBright"],
                    DEBUG: ["bold", "green"],
                    INFO: ["bold", "blue"],
                    WARN: ["bold", "yellow"],
                    ERROR: ["bold", "red"],
                    FATAL: ["bold", "redBright"],
                },
                dateIsoStr: "white",
                filePathWithLine: "white",
                name: ["white", "bold"],
                nameWithDelimiterPrefix: ["white", "bold"],
                nameWithDelimiterSuffix: ["white", "bold"],
                errorName: ["bold", "bgRedBright", "whiteBright"],
                fileName: ["yellow"],
                fileNameWithLine: "white",
            },
            prettyLogLevelMethod: settings?.prettyLogLevelMethod ?? {},
            prettyInspectOptions: settings?.prettyInspectOptions ?? {
                colors: true,
                compact: false,
                depth: Infinity,
            },
            metaProperty: settings?.metaProperty ?? "_meta",
            maskPlaceholder: settings?.maskPlaceholder ?? "[***]",
            maskValuesOfKeys: settings?.maskValuesOfKeys ?? ["password"],
            maskValuesOfKeysCaseInsensitive: settings?.maskValuesOfKeysCaseInsensitive ?? false,
            maskValuesRegEx: settings?.maskValuesRegEx,
            prefix: [...(settings?.prefix ?? [])],
            attachedTransports: [...(settings?.attachedTransports ?? [])],
            overwrite: {
                mask: settings?.overwrite?.mask,
                toLogObj: settings?.overwrite?.toLogObj,
                addMeta: settings?.overwrite?.addMeta,
                includeDefaultMetaInAddMeta: settings?.overwrite?.includeDefaultMetaInAddMeta ?? false,
                addPlaceholders: settings?.overwrite?.addPlaceholders,
                formatMeta: settings?.overwrite?.formatMeta,
                formatLogObj: settings?.overwrite?.formatLogObj,
                transportFormatted: settings?.overwrite?.transportFormatted,
                transportJSON: settings?.overwrite?.transportJSON,
            },
        };
        this.captureStackForMeta = this._shouldCaptureStack();
    }
    log(logLevelId, logLevelName, ...args) {
        if (logLevelId < this.settings.minLevel) {
            return;
        }
        const resolvedArgs = this._resolveLogArguments(args);
        const logArgs = [...this.settings.prefix, ...resolvedArgs];
        const maskedArgs = this.settings.overwrite?.mask != null
            ? this.settings.overwrite?.mask(logArgs)
            : this.settings.maskValuesOfKeys != null && this.settings.maskValuesOfKeys.length > 0
                ? this._mask(logArgs)
                : logArgs;
        const thisLogObj = this.logObj != null ? this._recursiveCloneAndExecuteFunctions(this.logObj) : undefined;
        const logObj = this.settings.overwrite?.toLogObj != null ? this.settings.overwrite?.toLogObj(maskedArgs, thisLogObj) : this._toLogObj(maskedArgs, thisLogObj);
        const logObjWithMeta = this.settings.overwrite?.addMeta != null
            ? this.settings.overwrite.addMeta(logObj, logLevelId, logLevelName, this.settings.overwrite.includeDefaultMetaInAddMeta
                ? this.runtime.getMeta(logLevelId, logLevelName, this.stackDepthLevel, !this.captureStackForMeta, this.settings.name, this.settings.parentNames, this.settings.internalFramePatterns)
                : undefined)
            : this._addMetaToLogObj(logObj, logLevelId, logLevelName);
        const logMeta = logObjWithMeta?.[this.settings.metaProperty];
        let logMetaMarkup;
        let logArgsAndErrorsMarkup;
        if (this.settings.overwrite?.formatMeta != null) {
            logMetaMarkup = this.settings.overwrite?.formatMeta(logObjWithMeta?.[this.settings.metaProperty]);
        }
        if (this.settings.overwrite?.formatLogObj != null) {
            logArgsAndErrorsMarkup = this.settings.overwrite?.formatLogObj(maskedArgs, this.settings);
        }
        if (this.settings.type === "pretty") {
            logMetaMarkup = logMetaMarkup ?? this._prettyFormatLogObjMeta(logObjWithMeta?.[this.settings.metaProperty]);
            logArgsAndErrorsMarkup = logArgsAndErrorsMarkup ?? runtime.prettyFormatLogObj(maskedArgs, this.settings);
        }
        if (logMetaMarkup != null && logArgsAndErrorsMarkup != null) {
            if (this.settings.overwrite?.transportFormatted != null) {
                const transport = this.settings.overwrite.transportFormatted;
                const declaredParams = transport.length;
                if (declaredParams < 4) {
                    transport(logMetaMarkup, logArgsAndErrorsMarkup.args, logArgsAndErrorsMarkup.errors);
                }
                else if (declaredParams === 4) {
                    transport(logMetaMarkup, logArgsAndErrorsMarkup.args, logArgsAndErrorsMarkup.errors, logMeta);
                }
                else {
                    transport(logMetaMarkup, logArgsAndErrorsMarkup.args, logArgsAndErrorsMarkup.errors, logMeta, this.settings);
                }
            }
            else {
                runtime.transportFormatted(logMetaMarkup, logArgsAndErrorsMarkup.args, logArgsAndErrorsMarkup.errors, logMeta, this.settings);
            }
        }
        else {
            if (this.settings.overwrite?.transportJSON != null) {
                this.settings.overwrite.transportJSON(logObjWithMeta);
            }
            else if (this.settings.type !== "hidden") {
                runtime.transportJSON(logObjWithMeta);
            }
        }
        if (this.settings.attachedTransports != null && this.settings.attachedTransports.length > 0) {
            this.settings.attachedTransports.forEach((transportLogger) => {
                try {
                    transportLogger(logObjWithMeta);
                }
                catch (transportError) {
                    try {
                        console.error("tslog: attached transport threw an error", transportError);
                    }
                    catch {
                    }
                }
            });
        }
        return logObjWithMeta;
    }
    attachTransport(transportLogger) {
        this.settings.attachedTransports.push(transportLogger);
    }
    getSubLogger(settings, logObj) {
        const subLoggerSettings = {
            ...this.settings,
            ...settings,
            minLevel: resolveLogLevelId(settings?.minLevel) ?? this.settings.minLevel,
            parentNames: this.settings?.parentNames != null && this.settings?.name != null
                ? [...this.settings.parentNames, this.settings.name]
                : this.settings?.name != null
                    ? [this.settings.name]
                    : undefined,
            prefix: [...this.settings.prefix, ...(settings?.prefix ?? [])],
        };
        const subLogger = new this.constructor(subLoggerSettings, logObj ?? this.logObj, this.stackDepthLevel);
        return subLogger;
    }
    _mask(args) {
        const maskKeys = this._getMaskKeys();
        return args?.map((arg) => {
            return this._recursiveCloneAndMaskValuesOfKeys(arg, maskKeys);
        });
    }
    _getMaskKeys() {
        const maskKeys = this.settings.maskValuesOfKeys ?? [];
        const signature = maskKeys.map(String).join("|");
        if (this.settings.maskValuesOfKeysCaseInsensitive === true) {
            if (this.maskKeysCache?.source === maskKeys && this.maskKeysCache.caseInsensitive === true && this.maskKeysCache.signature === signature) {
                return this.maskKeysCache.normalized;
            }
            const normalized = maskKeys.map((key) => (typeof key === "string" ? key.toLowerCase() : String(key).toLowerCase()));
            this.maskKeysCache = {
                source: maskKeys,
                caseInsensitive: true,
                normalized,
                signature,
            };
            return normalized;
        }
        if (this.maskKeysCache?.source === maskKeys && this.maskKeysCache.caseInsensitive === false && this.maskKeysCache.signature === signature) {
            return this.maskKeysCache.normalized;
        }
        const normalized = maskKeys.map((key) => (typeof key === "string" ? key : String(key)));
        this.maskKeysCache = {
            source: maskKeys,
            caseInsensitive: false,
            normalized,
            signature,
        };
        return normalized;
    }
    _resolveLogArguments(args) {
        if (args.length === 1 && typeof args[0] === "function") {
            const candidate = args[0];
            if (candidate.length === 0) {
                const result = candidate();
                return Array.isArray(result) ? result : [result];
            }
        }
        return args;
    }
    _recursiveCloneAndMaskValuesOfKeys(source, keys, seen = []) {
        if (seen.includes(source)) {
            return { ...source };
        }
        if (typeof source === "object" && source !== null) {
            seen.push(source);
        }
        if (runtime.isError(source) || runtime.isBuffer(source)) {
            return source;
        }
        else if (source instanceof Map) {
            return new Map(source);
        }
        else if (source instanceof Set) {
            return new Set(source);
        }
        else if (Array.isArray(source)) {
            return source.map((item) => this._recursiveCloneAndMaskValuesOfKeys(item, keys, seen));
        }
        else if (source instanceof Date) {
            return new Date(source.getTime());
        }
        else if (source instanceof URL) {
            return (0, urlToObj_js_1.urlToObject)(source);
        }
        else if (source !== null && typeof source === "object") {
            const baseObject = runtime.isError(source) ? this._cloneError(source) : Object.create(Object.getPrototypeOf(source));
            return Object.getOwnPropertyNames(source).reduce((o, prop) => {
                const lookupKey = this.settings?.maskValuesOfKeysCaseInsensitive !== true
                    ? prop
                    : typeof prop === "string"
                        ? prop.toLowerCase()
                        : String(prop).toLowerCase();
                o[prop] = keys.includes(lookupKey)
                    ? this.settings.maskPlaceholder
                    : (() => {
                        try {
                            return this._recursiveCloneAndMaskValuesOfKeys(source[prop], keys, seen);
                        }
                        catch {
                            return null;
                        }
                    })();
                return o;
            }, baseObject);
        }
        else {
            if (typeof source === "string") {
                let modifiedSource = source;
                const placeholder = (this.settings?.maskPlaceholder || "").replace(/\$/g, "$$$$");
                for (const regEx of this.settings?.maskValuesRegEx || []) {
                    modifiedSource = modifiedSource.replace(regEx, placeholder);
                }
                return modifiedSource;
            }
            return source;
        }
    }
    _recursiveCloneAndExecuteFunctions(source, seen = []) {
        if (this.isObjectOrArray(source) && seen.includes(source)) {
            return this.shallowCopy(source);
        }
        if (this.isObjectOrArray(source)) {
            seen.push(source);
        }
        if (Array.isArray(source)) {
            return source.map((item) => this._recursiveCloneAndExecuteFunctions(item, seen));
        }
        else if (source instanceof Date) {
            return new Date(source.getTime());
        }
        else if (this.isObject(source)) {
            return Object.getOwnPropertyNames(source).reduce((o, prop) => {
                const descriptor = Object.getOwnPropertyDescriptor(source, prop);
                if (descriptor) {
                    Object.defineProperty(o, prop, descriptor);
                    const value = source[prop];
                    o[prop] = typeof value === "function" ? value() : this._recursiveCloneAndExecuteFunctions(value, seen);
                }
                return o;
            }, Object.create(Object.getPrototypeOf(source)));
        }
        else {
            return source;
        }
    }
    isObjectOrArray(value) {
        return typeof value === "object" && value !== null;
    }
    isObject(value) {
        return typeof value === "object" && !Array.isArray(value) && value !== null;
    }
    shallowCopy(source) {
        if (Array.isArray(source)) {
            return [...source];
        }
        else {
            return { ...source };
        }
    }
    _toLogObj(args, clonedLogObj = {}) {
        args = args?.map((arg) => (runtime.isError(arg) ? this._toErrorObject(arg) : arg));
        if (this.settings.argumentsArrayName == null) {
            if (args.length === 1 && !Array.isArray(args[0]) && runtime.isBuffer(args[0]) !== true && !(args[0] instanceof Date)) {
                clonedLogObj = typeof args[0] === "object" && args[0] != null ? { ...args[0], ...clonedLogObj } : { 0: args[0], ...clonedLogObj };
            }
            else {
                clonedLogObj = { ...clonedLogObj, ...args };
            }
        }
        else {
            clonedLogObj = {
                ...clonedLogObj,
                [this.settings.argumentsArrayName]: args,
            };
        }
        return clonedLogObj;
    }
    _cloneError(error) {
        const cloned = new error.constructor();
        Object.getOwnPropertyNames(error).forEach((key) => {
            cloned[key] = error[key];
        });
        return cloned;
    }
    _toErrorObject(error, depth = 0, seen = new Set()) {
        if (!seen.has(error)) {
            seen.add(error);
        }
        const errorObject = {
            nativeError: error,
            name: error.name ?? "Error",
            message: error.message,
            stack: runtime.getErrorTrace(error),
        };
        if (depth >= this.maxErrorCauseDepth) {
            return errorObject;
        }
        const causeValue = error.cause;
        if (causeValue != null) {
            const normalizedCause = (0, errorUtils_js_1.toError)(causeValue);
            if (!seen.has(normalizedCause)) {
                errorObject.cause = this._toErrorObject(normalizedCause, depth + 1, seen);
            }
        }
        return errorObject;
    }
    _addMetaToLogObj(logObj, logLevelId, logLevelName) {
        return {
            ...logObj,
            [this.settings.metaProperty]: runtime.getMeta(logLevelId, logLevelName, this.stackDepthLevel, !this.captureStackForMeta, this.settings.name, this.settings.parentNames, this.settings.internalFramePatterns),
        };
    }
    _shouldCaptureStack() {
        if (this.settings.hideLogPositionForProduction) {
            return false;
        }
        if (this.settings.type === "json") {
            return true;
        }
        const template = this.settings.prettyLogTemplate ?? "";
        const stackPlaceholders = /{{\s*(file(Name|Path|Line|PathWithLine|NameWithLine)|fullFilePath)\s*}}/;
        if (stackPlaceholders.test(template)) {
            return true;
        }
        return false;
    }
    _prettyFormatLogObjMeta(logObjMeta) {
        return (0, metaFormatting_js_1.buildPrettyMeta)(this.settings, logObjMeta).text;
    }
}
exports.BaseLogger = BaseLogger;


/***/ },

/***/ 6447
(__unused_webpack_module, exports) {

"use strict";
var __webpack_unused_export__;

__webpack_unused_export__ = ({ value: true });
exports.formatNumberAddZeros = formatNumberAddZeros;
function formatNumberAddZeros(value, digits = 2, addNumber = 0) {
    if (value != null && isNaN(value)) {
        return "";
    }
    value = value != null ? value + addNumber : value;
    return digits === 2
        ? value == null
            ? "--"
            : value < 10
                ? `0${value}`
                : value.toString()
        : value == null
            ? "---"
            : value < 10
                ? `00${value}`
                : value < 100
                    ? `0${value}`
                    : value.toString();
}


/***/ },

/***/ 6710
(__unused_webpack_module, exports, __webpack_require__) {

"use strict";
var __webpack_unused_export__;

__webpack_unused_export__ = ({ value: true });
exports.formatTemplate = formatTemplate;
const prettyLogStyles_js_1 = __webpack_require__(1135);
function formatTemplate(settings, template, values, hideUnsetPlaceholder = false) {
    const templateString = String(template);
    const ansiColorWrap = (placeholderValue, code) => `\u001b[${code[0]}m${placeholderValue}\u001b[${code[1]}m`;
    const styleWrap = (value, style) => {
        if (style != null && typeof style === "string") {
            return ansiColorWrap(value, prettyLogStyles_js_1.prettyLogStyles[style]);
        }
        else if (style != null && Array.isArray(style)) {
            return style.reduce((prevValue, thisStyle) => styleWrap(prevValue, thisStyle), value);
        }
        else {
            if (style != null && style[value.trim()] != null) {
                return styleWrap(value, style[value.trim()]);
            }
            else if (style != null && style["*"] != null) {
                return styleWrap(value, style["*"]);
            }
            else {
                return value;
            }
        }
    };
    const defaultStyle = null;
    return templateString.replace(/{{(.+?)}}/g, (_, placeholder) => {
        const value = values[placeholder] != null ? String(values[placeholder]) : hideUnsetPlaceholder ? "" : _;
        return settings.stylePrettyLogs
            ? styleWrap(value, settings?.prettyLogStyles?.[placeholder] ?? defaultStyle) + ansiColorWrap("", prettyLogStyles_js_1.prettyLogStyles.reset)
            : value;
    });
}


/***/ },

/***/ 7039
(__unused_webpack_module, exports, __webpack_require__) {

"use strict";

var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.log = exports.Logger = void 0;
const BaseLogger_js_1 = __webpack_require__(6386);
const interfaces_js_1 = __webpack_require__(299);
__exportStar(__webpack_require__(6386), exports);
__exportStar(__webpack_require__(299), exports);
class Logger extends BaseLogger_js_1.BaseLogger {
    constructor(settings, logObj) {
        const isBrowser = typeof window !== "undefined" && typeof document !== "undefined";
        const normalizedSettings = { ...(settings ?? {}) };
        if (isBrowser) {
            normalizedSettings.stylePrettyLogs = settings?.stylePrettyLogs ?? true;
        }
        super(normalizedSettings, logObj, Number.NaN);
    }
    log(logLevelId, logLevelName, ...args) {
        return super.log(logLevelId, logLevelName, ...args);
    }
    silly(...args) {
        return super.log(interfaces_js_1.DefaultLogLevels.SILLY, "SILLY", ...args);
    }
    trace(...args) {
        return super.log(interfaces_js_1.DefaultLogLevels.TRACE, "TRACE", ...args);
    }
    debug(...args) {
        return super.log(interfaces_js_1.DefaultLogLevels.DEBUG, "DEBUG", ...args);
    }
    info(...args) {
        return super.log(interfaces_js_1.DefaultLogLevels.INFO, "INFO", ...args);
    }
    warn(...args) {
        return super.log(interfaces_js_1.DefaultLogLevels.WARN, "WARN", ...args);
    }
    error(...args) {
        return super.log(interfaces_js_1.DefaultLogLevels.ERROR, "ERROR", ...args);
    }
    fatal(...args) {
        return super.log(interfaces_js_1.DefaultLogLevels.FATAL, "FATAL", ...args);
    }
    getSubLogger(settings, logObj) {
        return super.getSubLogger(settings, logObj);
    }
}
exports.Logger = Logger;
exports.log = new Logger();


/***/ },

/***/ 299
(__unused_webpack_module, exports) {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.DefaultLogLevels = void 0;
var DefaultLogLevels;
(function (DefaultLogLevels) {
    DefaultLogLevels[DefaultLogLevels["SILLY"] = 0] = "SILLY";
    DefaultLogLevels[DefaultLogLevels["TRACE"] = 1] = "TRACE";
    DefaultLogLevels[DefaultLogLevels["DEBUG"] = 2] = "DEBUG";
    DefaultLogLevels[DefaultLogLevels["INFO"] = 3] = "INFO";
    DefaultLogLevels[DefaultLogLevels["WARN"] = 4] = "WARN";
    DefaultLogLevels[DefaultLogLevels["ERROR"] = 5] = "ERROR";
    DefaultLogLevels[DefaultLogLevels["FATAL"] = 6] = "FATAL";
})(DefaultLogLevels || (exports.DefaultLogLevels = DefaultLogLevels = {}));


/***/ },

/***/ 19
(__unused_webpack_module, exports) {

"use strict";
var __webpack_unused_export__;

__webpack_unused_export__ = ({ value: true });
exports.safeGetCwd = safeGetCwd;
exports.isBrowserEnvironment = isBrowserEnvironment;
__webpack_unused_export__ = isWorkerEnvironment;
exports.consoleSupportsCssStyling = consoleSupportsCssStyling;
function safeGetCwd() {
    try {
        const nodeProcess = globalThis?.process;
        if (typeof nodeProcess?.cwd === "function") {
            return nodeProcess.cwd();
        }
    }
    catch {
    }
    try {
        const deno = globalThis?.Deno;
        if (typeof deno?.cwd === "function") {
            return deno.cwd();
        }
    }
    catch {
    }
    return undefined;
}
function isBrowserEnvironment() {
    return typeof window !== "undefined" && typeof document !== "undefined";
}
function isWorkerEnvironment() {
    return typeof globalThis.importScripts === "function";
}
function consoleSupportsCssStyling() {
    if (!isBrowserEnvironment() && !isWorkerEnvironment()) {
        return false;
    }
    const navigatorObj = globalThis?.navigator;
    const userAgent = navigatorObj?.userAgent ?? "";
    if (/firefox/i.test(userAgent)) {
        return true;
    }
    const windowObj = globalThis;
    if (windowObj?.CSS?.supports?.("color", "#000")) {
        return true;
    }
    return /safari/i.test(userAgent) && !/chrome/i.test(userAgent);
}


/***/ },

/***/ 8078
(__unused_webpack_module, exports, __webpack_require__) {

"use strict";
var __webpack_unused_export__;

__webpack_unused_export__ = ({ value: true });
exports.collectErrorCauses = collectErrorCauses;
exports.toError = toError;
__webpack_unused_export__ = toErrorObject;
const stackTrace_js_1 = __webpack_require__(5456);
const DEFAULT_CAUSE_DEPTH = 5;
function collectErrorCauses(error, options = {}) {
    const maxDepth = options.maxDepth ?? DEFAULT_CAUSE_DEPTH;
    const causes = [];
    const visited = new Set();
    let current = error;
    let depth = 0;
    while (current != null && depth < maxDepth) {
        const cause = current?.cause;
        if (cause == null || visited.has(cause)) {
            break;
        }
        visited.add(cause);
        causes.push(toError(cause));
        current = cause;
        depth += 1;
    }
    return causes;
}
function toError(value) {
    if (value instanceof Error) {
        return value;
    }
    const error = new Error(typeof value === "string" ? value : JSON.stringify(value));
    if (typeof value === "object" && value != null) {
        Object.assign(error, value);
    }
    return error;
}
function toErrorObject(error, parseLine) {
    return {
        nativeError: error,
        name: error.name ?? "Error",
        message: error.message ?? "",
        stack: (0, stackTrace_js_1.buildStackTrace)(error, parseLine),
    };
}


/***/ },

/***/ 6008
(__unused_webpack_module, exports) {

"use strict";
var __webpack_unused_export__;

__webpack_unused_export__ = ({ value: true });
exports.jsonStringifyRecursive = jsonStringifyRecursive;
function jsonStringifyRecursive(obj) {
    const cache = new Set();
    return JSON.stringify(obj, (_key, value) => {
        if (typeof value === "object" && value !== null) {
            if (cache.has(value)) {
                return "[Circular]";
            }
            cache.add(value);
        }
        if (typeof value === "bigint") {
            return `${value}`;
        }
        if (typeof value === "undefined") {
            return "[undefined]";
        }
        return value;
    });
}


/***/ },

/***/ 8799
(__unused_webpack_module, exports, __webpack_require__) {

"use strict";
var __webpack_unused_export__;

__webpack_unused_export__ = ({ value: true });
exports.buildPrettyMeta = buildPrettyMeta;
const formatNumberAddZeros_js_1 = __webpack_require__(6447);
const formatTemplate_js_1 = __webpack_require__(6710);
function buildPrettyMeta(settings, meta) {
    if (meta == null) {
        return {
            text: "",
            template: settings.prettyLogTemplate,
            placeholders: {},
        };
    }
    let template = settings.prettyLogTemplate;
    const placeholderValues = {};
    if (template.includes("{{yyyy}}.{{mm}}.{{dd}} {{hh}}:{{MM}}:{{ss}}:{{ms}}")) {
        template = template.replace("{{yyyy}}.{{mm}}.{{dd}} {{hh}}:{{MM}}:{{ss}}:{{ms}}", "{{dateIsoStr}}");
    }
    else {
        if (settings.prettyLogTimeZone === "UTC") {
            placeholderValues.yyyy = meta.date?.getUTCFullYear() ?? "----";
            placeholderValues.mm = (0, formatNumberAddZeros_js_1.formatNumberAddZeros)(meta.date?.getUTCMonth(), 2, 1);
            placeholderValues.dd = (0, formatNumberAddZeros_js_1.formatNumberAddZeros)(meta.date?.getUTCDate(), 2);
            placeholderValues.hh = (0, formatNumberAddZeros_js_1.formatNumberAddZeros)(meta.date?.getUTCHours(), 2);
            placeholderValues.MM = (0, formatNumberAddZeros_js_1.formatNumberAddZeros)(meta.date?.getUTCMinutes(), 2);
            placeholderValues.ss = (0, formatNumberAddZeros_js_1.formatNumberAddZeros)(meta.date?.getUTCSeconds(), 2);
            placeholderValues.ms = (0, formatNumberAddZeros_js_1.formatNumberAddZeros)(meta.date?.getUTCMilliseconds(), 3);
        }
        else {
            placeholderValues.yyyy = meta.date?.getFullYear() ?? "----";
            placeholderValues.mm = (0, formatNumberAddZeros_js_1.formatNumberAddZeros)(meta.date?.getMonth(), 2, 1);
            placeholderValues.dd = (0, formatNumberAddZeros_js_1.formatNumberAddZeros)(meta.date?.getDate(), 2);
            placeholderValues.hh = (0, formatNumberAddZeros_js_1.formatNumberAddZeros)(meta.date?.getHours(), 2);
            placeholderValues.MM = (0, formatNumberAddZeros_js_1.formatNumberAddZeros)(meta.date?.getMinutes(), 2);
            placeholderValues.ss = (0, formatNumberAddZeros_js_1.formatNumberAddZeros)(meta.date?.getSeconds(), 2);
            placeholderValues.ms = (0, formatNumberAddZeros_js_1.formatNumberAddZeros)(meta.date?.getMilliseconds(), 3);
        }
    }
    const isUtc = settings.prettyLogTimeZone === "UTC";
    const dateInSettingsTimeZone = isUtc ? meta.date : meta.date != null ? new Date(meta.date.getTime() - meta.date.getTimezoneOffset() * 60000) : undefined;
    placeholderValues.rawIsoStr =
        dateInSettingsTimeZone == null ? "" : isUtc ? dateInSettingsTimeZone.toISOString() : localIsoString(dateInSettingsTimeZone, meta.date);
    placeholderValues.dateIsoStr = dateInSettingsTimeZone?.toISOString().replace("T", " ").replace("Z", "") ?? "";
    placeholderValues.logLevelName = meta.logLevelName;
    placeholderValues.fileNameWithLine = meta.path?.fileNameWithLine ?? "";
    placeholderValues.filePathWithLine = meta.path?.filePathWithLine ?? "";
    placeholderValues.fullFilePath = meta.path?.fullFilePath ?? "";
    let parentNamesString = settings.parentNames?.join(settings.prettyErrorParentNamesSeparator);
    parentNamesString = parentNamesString != null && meta.name != null ? parentNamesString + settings.prettyErrorParentNamesSeparator : undefined;
    const combinedName = meta.name != null || parentNamesString != null ? `${parentNamesString ?? ""}${meta.name ?? ""}` : "";
    placeholderValues.name = combinedName;
    placeholderValues.nameWithDelimiterPrefix = combinedName.length > 0 ? settings.prettyErrorLoggerNameDelimiter + combinedName : "";
    placeholderValues.nameWithDelimiterSuffix = combinedName.length > 0 ? combinedName + settings.prettyErrorLoggerNameDelimiter : "";
    if (settings.overwrite?.addPlaceholders != null) {
        settings.overwrite.addPlaceholders(meta, placeholderValues);
    }
    return {
        text: (0, formatTemplate_js_1.formatTemplate)(settings, template, placeholderValues),
        template,
        placeholders: placeholderValues,
    };
}
function localIsoString(shifted, original) {
    const base = shifted.toISOString().replace("Z", "");
    const offsetMinutes = -original.getTimezoneOffset();
    const sign = offsetMinutes >= 0 ? "+" : "-";
    const abs = Math.abs(offsetMinutes);
    const hh = String(Math.floor(abs / 60)).padStart(2, "0");
    const mm = String(abs % 60).padStart(2, "0");
    return `${base}${sign}${hh}:${mm}`;
}


/***/ },

/***/ 5456
(__unused_webpack_module, exports) {

"use strict";
var __webpack_unused_export__;

__webpack_unused_export__ = ({ value: true });
__webpack_unused_export__ = splitStackLines;
__webpack_unused_export__ = sanitizeStackLines;
__webpack_unused_export__ = toStackFrames;
exports.findFirstExternalFrameIndex = findFirstExternalFrameIndex;
__webpack_unused_export__ = getFrameAt;
__webpack_unused_export__ = getCleanStackLines;
exports.buildStackTrace = buildStackTrace;
__webpack_unused_export__ = isIgnorableFrame;
exports.clampIndex = clampIndex;
__webpack_unused_export__ = pickCallerStackFrame;
exports.getDefaultIgnorePatterns = getDefaultIgnorePatterns;
const DEFAULT_IGNORE_PATTERNS = [
    /(?:^|[\\/])node_modules[\\/].*tslog/i,
    /(?:^|[\\/])deps[\\/].*tslog/i,
    /tslog[\\/]+src[\\/]+internal[\\/]/i,
    /tslog[\\/]+src[\\/]BaseLogger/i,
    /tslog[\\/]+src[\\/]index/i,
];
function splitStackLines(error) {
    const stack = typeof error?.stack === "string" ? error.stack : undefined;
    if (stack == null || stack.length === 0) {
        return [];
    }
    return stack.split("\n").map((line) => line.trimEnd());
}
function sanitizeStackLines(lines) {
    return lines.filter((line) => line.length > 0 && !/^\s*Error\b/.test(line));
}
function toStackFrames(lines, parseLine) {
    const frames = [];
    for (const line of lines) {
        const frame = parseLine(line);
        if (frame != null) {
            frames.push(frame);
        }
    }
    return frames;
}
function findFirstExternalFrameIndex(frames, ignorePatterns = DEFAULT_IGNORE_PATTERNS) {
    for (let index = 0; index < frames.length; index += 1) {
        const frame = frames[index];
        const filePathCandidate = frame.filePath ?? "";
        const fullPathCandidate = frame.fullFilePath ?? "";
        if (!ignorePatterns.some((pattern) => pattern.test(filePathCandidate) || pattern.test(fullPathCandidate))) {
            return index;
        }
    }
    return 0;
}
function getFrameAt(frames, index) {
    if (index < 0 || index >= frames.length) {
        return undefined;
    }
    return frames[index];
}
function getCleanStackLines(error) {
    return sanitizeStackLines(splitStackLines(error));
}
function buildStackTrace(error, parseLine) {
    return toStackFrames(getCleanStackLines(error), parseLine);
}
function isIgnorableFrame(frame, ignorePatterns) {
    const filePathCandidate = frame.filePath ?? "";
    const fullPathCandidate = frame.fullFilePath ?? "";
    return ignorePatterns.some((pattern) => pattern.test(filePathCandidate) || pattern.test(fullPathCandidate));
}
function clampIndex(index, maxExclusive) {
    if (index < 0) {
        return 0;
    }
    if (index >= maxExclusive) {
        return Math.max(0, maxExclusive - 1);
    }
    return index;
}
function pickCallerStackFrame(error, parseLine, options = {}) {
    const lines = getCleanStackLines(error);
    const frames = toStackFrames(lines, parseLine);
    if (frames.length === 0) {
        return undefined;
    }
    const ignorePatterns = options.ignorePatterns ?? DEFAULT_IGNORE_PATTERNS;
    const autoIndex = findFirstExternalFrameIndex(frames, ignorePatterns);
    const resolvedIndex = options.stackDepthLevel != null ? options.stackDepthLevel : autoIndex;
    return getFrameAt(frames, clampIndex(resolvedIndex, frames.length));
}
function getDefaultIgnorePatterns() {
    return [...DEFAULT_IGNORE_PATTERNS];
}


/***/ },

/***/ 6198
(__unused_webpack_module, exports, __webpack_require__) {

"use strict";
var __webpack_unused_export__;

__webpack_unused_export__ = ({ value: true });
__webpack_unused_export__ = inspect;
__webpack_unused_export__ = formatValue;
exports.formatWithOptions = formatWithOptions;
const prettyLogStyles_js_1 = __webpack_require__(1135);
const jsonStringifyRecursive_js_1 = __webpack_require__(6008);
function inspect(obj, opts) {
    const ctx = {
        seen: [],
        stylize: stylizeNoColor,
    };
    if (opts != null) {
        _extend(ctx, opts);
    }
    if (isUndefined(ctx.showHidden))
        ctx.showHidden = false;
    if (isUndefined(ctx.depth))
        ctx.depth = 2;
    if (isUndefined(ctx.colors))
        ctx.colors = true;
    if (isUndefined(ctx.customInspect))
        ctx.customInspect = true;
    if (ctx.colors)
        ctx.stylize = stylizeWithColor;
    return formatValue(ctx, obj, ctx.depth);
}
inspect.colors = prettyLogStyles_js_1.prettyLogStyles;
inspect.styles = {
    special: "cyan",
    number: "yellow",
    boolean: "yellow",
    undefined: "grey",
    null: "bold",
    string: "green",
    date: "magenta",
    regexp: "red",
};
function isBoolean(arg) {
    return typeof arg === "boolean";
}
function isUndefined(arg) {
    return arg === undefined;
}
function stylizeNoColor(str) {
    return str;
}
function stylizeWithColor(str, styleType) {
    const style = inspect.styles[styleType];
    if (style != null && inspect?.colors?.[style]?.[0] != null && inspect?.colors?.[style]?.[1] != null) {
        return `\u001b[${inspect.colors[style][0]}m${str}\u001b[${inspect.colors[style][1]}m`;
    }
    else {
        return str;
    }
}
function isFunction(arg) {
    return typeof arg === "function";
}
function isString(arg) {
    return typeof arg === "string";
}
function isNumber(arg) {
    return typeof arg === "number";
}
function isNull(arg) {
    return arg === null;
}
function isBigInt(arg) {
    return typeof arg === "bigint";
}
function hasOwn(obj, prop) {
    return Object.prototype.hasOwnProperty.call(obj, prop);
}
function isRegExp(re) {
    return isObject(re) && objectToString(re) === "[object RegExp]";
}
function isObject(arg) {
    return typeof arg === "object" && arg !== null;
}
function isError(e) {
    return isObject(e) && (objectToString(e) === "[object Error]" || e instanceof Error);
}
function isDate(d) {
    return isObject(d) && objectToString(d) === "[object Date]";
}
function objectToString(o) {
    return Object.prototype.toString.call(o);
}
function arrayToHash(array) {
    const hash = {};
    array.forEach((val) => {
        hash[val] = true;
    });
    return hash;
}
function formatArray(ctx, value, recurseTimes, visibleKeys, keys) {
    const output = [];
    for (let i = 0, l = value.length; i < l; ++i) {
        if (hasOwn(value, String(i))) {
            output.push(formatProperty(ctx, value, recurseTimes, visibleKeys, String(i), true));
        }
        else {
            output.push("");
        }
    }
    keys.forEach((key) => {
        if (!key.match(/^\d+$/)) {
            output.push(formatProperty(ctx, value, recurseTimes, visibleKeys, key, true));
        }
    });
    return output;
}
function formatError(value) {
    return `[${Error.prototype.toString.call(value)}]`;
}
function formatDate(value) {
    return Number.isNaN(value.valueOf()) ? "Invalid Date" : Date.prototype.toISOString.call(value);
}
function formatValue(ctx, value, recurseTimes = 0) {
    if (ctx.customInspect &&
        value != null &&
        isFunction(value) &&
        value?.inspect !== inspect &&
        !(value?.constructor && value?.constructor.prototype === value)) {
        if (typeof value.inspect !== "function" && value.toString != null) {
            return value.toString();
        }
        let ret = value?.inspect(recurseTimes, ctx);
        if (!isString(ret)) {
            ret = formatValue(ctx, ret, recurseTimes);
        }
        return ret;
    }
    const primitive = formatPrimitive(ctx, value);
    if (primitive) {
        return primitive;
    }
    let keys = Object.keys(value);
    const visibleKeys = arrayToHash(keys);
    try {
        if (ctx.showHidden && Object.getOwnPropertyNames) {
            keys = Object.getOwnPropertyNames(value);
        }
    }
    catch {
    }
    if (isError(value) && (keys.indexOf("message") >= 0 || keys.indexOf("description") >= 0)) {
        return formatError(value);
    }
    if (keys.length === 0) {
        if (isFunction(ctx.stylize)) {
            if (isFunction(value)) {
                const name = value.name ? `: ${value.name}` : "";
                return ctx.stylize(`[Function${name}]`, "special");
            }
            if (isRegExp(value)) {
                return ctx.stylize(RegExp.prototype.toString.call(value), "regexp");
            }
            if (isDate(value)) {
                return ctx.stylize(formatDate(value), "date");
            }
            if (isError(value)) {
                return formatError(value);
            }
        }
        else {
            return value;
        }
    }
    let base = "";
    let array = false;
    let braces = ["{\n", "\n}"];
    if (Array.isArray(value)) {
        array = true;
        braces = ["[\n", "\n]"];
    }
    if (isFunction(value)) {
        const n = value.name ? `: ${value.name}` : "";
        base = ` [Function${n}]`;
    }
    if (isRegExp(value)) {
        base = ` ${RegExp.prototype.toString.call(value)}`;
    }
    if (isDate(value)) {
        base = ` ${Number.isNaN(value.valueOf()) ? "Invalid Date" : Date.prototype.toUTCString.call(value)}`;
    }
    if (isError(value)) {
        base = ` ${formatError(value)}`;
    }
    if (keys.length === 0 && (!array || value.length === 0)) {
        return braces[0] + base + braces[1];
    }
    if (recurseTimes < 0) {
        if (isRegExp(value)) {
            return ctx.stylize(RegExp.prototype.toString.call(value), "regexp");
        }
        else {
            return ctx.stylize("[Object]", "special");
        }
    }
    ctx.seen.push(value);
    let output;
    if (array) {
        output = formatArray(ctx, value, recurseTimes, visibleKeys, keys);
    }
    else {
        output = keys.map((key) => {
            return formatProperty(ctx, value, recurseTimes, visibleKeys, key, array);
        });
    }
    ctx.seen.pop();
    return reduceToSingleString(output, base, braces);
}
function formatProperty(ctx, value, recurseTimes, visibleKeys, key, array) {
    let name;
    let str;
    let desc = { value: void 0 };
    try {
        desc.value = value[key];
    }
    catch {
    }
    try {
        if (Object.getOwnPropertyDescriptor) {
            desc = Object.getOwnPropertyDescriptor(value, key) || desc;
        }
    }
    catch {
    }
    if (desc.get) {
        if (desc.set) {
            str = ctx.stylize("[Getter/Setter]", "special");
        }
        else {
            str = ctx.stylize("[Getter]", "special");
        }
    }
    else {
        if (desc.set) {
            str = ctx.stylize("[Setter]", "special");
        }
    }
    if (!hasOwn(visibleKeys, key)) {
        name = `[${key}]`;
    }
    if (!str) {
        if (ctx.seen.indexOf(desc.value) < 0) {
            if (isNull(recurseTimes)) {
                str = formatValue(ctx, desc.value, undefined);
            }
            else {
                str = formatValue(ctx, desc.value, recurseTimes - 1);
            }
            if (str.indexOf("\n") > -1) {
                if (array) {
                    str = str
                        .split("\n")
                        .map((line) => {
                        return `  ${line}`;
                    })
                        .join("\n")
                        .substr(2);
                }
                else {
                    str =
                        "\n" +
                            str
                                .split("\n")
                                .map((line) => {
                                return `   ${line}`;
                            })
                                .join("\n");
                }
            }
        }
        else {
            str = ctx.stylize("[Circular]", "special");
        }
    }
    if (isUndefined(name)) {
        if (array && key.match(/^\d+$/)) {
            return str;
        }
        name = JSON.stringify(`${key}`);
        if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
            name = name.substr(1, name.length - 2);
            name = ctx.stylize(name, "name");
        }
        else {
            name = name
                .replace(/'/g, "\\'")
                .replace(/\\"/g, "\\'")
                .replace(/(^"|"$)/g, "'");
            name = ctx.stylize(name, "string");
        }
    }
    return `${name}: ${str}`;
}
function formatPrimitive(ctx, value) {
    if (isUndefined(value))
        return ctx.stylize("undefined", "undefined");
    if (isString(value)) {
        const simple = `'${JSON.stringify(value).replace(/^"|"$/g, "").replace(/'/g, "\\'").replace(/\\"/g, "\\'")}'`;
        return ctx.stylize(simple, "string");
    }
    if (isNumber(value))
        return ctx.stylize(`${value}`, "number");
    if (isBigInt(value))
        return ctx.stylize(`${value}n`, "number");
    if (isBoolean(value))
        return ctx.stylize(`${value}`, "boolean");
    if (isNull(value))
        return ctx.stylize("null", "null");
}
function reduceToSingleString(output, base, braces) {
    return `${braces[0] + (base === "" ? "" : `${base}\n`)}  ${output.join(",\n  ")} ${braces[1]}`;
}
function _extend(origin, add) {
    const typedOrigin = origin;
    if (!add || !isObject(add))
        return origin;
    const clonedAdd = { ...add };
    const keys = Object.keys(add);
    let i = keys.length;
    while (i--) {
        typedOrigin[keys[i]] = clonedAdd[keys[i]];
    }
    return typedOrigin;
}
function formatWithOptions(inspectOptions, ...args) {
    const ctx = {
        seen: [],
        stylize: stylizeNoColor,
    };
    if (inspectOptions != null) {
        _extend(ctx, inspectOptions);
    }
    const first = args[0];
    let a = 0;
    let str = "";
    let join = "";
    if (typeof first === "string") {
        if (args.length === 1) {
            return first;
        }
        let tempStr;
        let lastPos = 0;
        for (let i = 0; i < first.length - 1; i++) {
            if (first.charCodeAt(i) === 37) {
                const nextChar = first.charCodeAt(++i);
                if (a + 1 !== args.length) {
                    switch (nextChar) {
                        case 115: {
                            const tempArg = args[++a];
                            if (typeof tempArg === "number") {
                                tempStr = formatPrimitive(ctx, tempArg);
                            }
                            else if (typeof tempArg === "bigint") {
                                tempStr = formatPrimitive(ctx, tempArg);
                            }
                            else if (typeof tempArg !== "object" || tempArg === null) {
                                tempStr = String(tempArg);
                            }
                            else {
                                tempStr = inspect(tempArg, {
                                    ...inspectOptions,
                                    compact: 3,
                                    colors: false,
                                    depth: 0,
                                });
                            }
                            break;
                        }
                        case 106:
                            tempStr = (0, jsonStringifyRecursive_js_1.jsonStringifyRecursive)(args[++a]);
                            break;
                        case 100: {
                            const tempNum = args[++a];
                            if (typeof tempNum === "bigint") {
                                tempStr = formatPrimitive(ctx, tempNum);
                            }
                            else if (typeof tempNum === "symbol") {
                                tempStr = "NaN";
                            }
                            else {
                                tempStr = formatPrimitive(ctx, tempNum);
                            }
                            break;
                        }
                        case 79:
                            tempStr = inspect(args[++a], inspectOptions);
                            break;
                        case 111:
                            tempStr = inspect(args[++a], {
                                ...inspectOptions,
                                showHidden: true,
                                showProxy: true,
                                depth: 4,
                            });
                            break;
                        case 105: {
                            const tempInteger = args[++a];
                            if (typeof tempInteger === "bigint") {
                                tempStr = formatPrimitive(ctx, tempInteger);
                            }
                            else if (typeof tempInteger === "symbol") {
                                tempStr = "NaN";
                            }
                            else {
                                tempStr = formatPrimitive(ctx, parseInt(tempStr, 10));
                            }
                            break;
                        }
                        case 102: {
                            const tempFloat = args[++a];
                            if (typeof tempFloat === "symbol") {
                                tempStr = "NaN";
                            }
                            else {
                                tempStr = formatPrimitive(ctx, parseInt(tempFloat, 10));
                            }
                            break;
                        }
                        case 99:
                            a += 1;
                            tempStr = "";
                            break;
                        case 37:
                            str += first.slice(lastPos, i);
                            lastPos = i + 1;
                            continue;
                        default:
                            continue;
                    }
                    if (lastPos !== i - 1) {
                        str += first.slice(lastPos, i - 1);
                    }
                    str += tempStr;
                    lastPos = i + 1;
                }
                else if (nextChar === 37) {
                    str += first.slice(lastPos, i);
                    lastPos = i + 1;
                }
            }
        }
        if (lastPos !== 0) {
            a++;
            join = " ";
            if (lastPos < first.length) {
                str += first.slice(lastPos);
            }
        }
    }
    while (a < args.length) {
        const value = args[a];
        str += join;
        str += typeof value !== "string" ? inspect(value, inspectOptions) : value;
        join = " ";
        a++;
    }
    return str;
}


/***/ },

/***/ 1135
(__unused_webpack_module, exports) {

"use strict";
var __webpack_unused_export__;

__webpack_unused_export__ = ({ value: true });
exports.prettyLogStyles = void 0;
exports.prettyLogStyles = {
    reset: [0, 0],
    bold: [1, 22],
    dim: [2, 22],
    italic: [3, 23],
    underline: [4, 24],
    overline: [53, 55],
    inverse: [7, 27],
    hidden: [8, 28],
    strikethrough: [9, 29],
    black: [30, 39],
    red: [31, 39],
    green: [32, 39],
    yellow: [33, 39],
    blue: [34, 39],
    magenta: [35, 39],
    cyan: [36, 39],
    white: [37, 39],
    blackBright: [90, 39],
    redBright: [91, 39],
    greenBright: [92, 39],
    yellowBright: [93, 39],
    blueBright: [94, 39],
    magentaBright: [95, 39],
    cyanBright: [96, 39],
    whiteBright: [97, 39],
    bgBlack: [40, 49],
    bgRed: [41, 49],
    bgGreen: [42, 49],
    bgYellow: [43, 49],
    bgBlue: [44, 49],
    bgMagenta: [45, 49],
    bgCyan: [46, 49],
    bgWhite: [47, 49],
    bgBlackBright: [100, 49],
    bgRedBright: [101, 49],
    bgGreenBright: [102, 49],
    bgYellowBright: [103, 49],
    bgBlueBright: [104, 49],
    bgMagentaBright: [105, 49],
    bgCyanBright: [106, 49],
    bgWhiteBright: [107, 49],
};


/***/ },

/***/ 9634
(__unused_webpack_module, exports) {

"use strict";
var __webpack_unused_export__;

__webpack_unused_export__ = ({ value: true });
exports.urlToObject = urlToObject;
function urlToObject(url) {
    return {
        href: url.href,
        protocol: url.protocol,
        username: url.username,
        password: url.password,
        host: url.host,
        hostname: url.hostname,
        port: url.port,
        pathname: url.pathname,
        search: url.search,
        searchParams: [...url.searchParams].map(([key, value]) => ({ key, value })),
        hash: url.hash,
        origin: url.origin,
    };
}


/***/ }

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	const __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		const cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		const module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
let __webpack_exports__ = {};
/* eslint-env worker */

const ArgumentType = __webpack_require__(6342);
const BlockType = __webpack_require__(9274);
const dispatch = __webpack_require__(3260);
const TargetType = __webpack_require__(9432);
class ExtensionWorker {
  constructor() {
    this.nextExtensionId = 0;
    this.initialRegistrations = [];
    dispatch.waitForConnection.then(() => {
      dispatch.call('extensions', 'allocateWorker').then(x => {
        const [id, extension] = x;
        this.workerId = id;
        try {
          importScripts(extension);
          const initialRegistrations = this.initialRegistrations;
          this.initialRegistrations = null;
          Promise.all(initialRegistrations).then(() => dispatch.call('extensions', 'onWorkerInit', id));
        } catch (e) {
          dispatch.call('extensions', 'onWorkerInit', id, e);
        }
      });
    });
    this.extensions = [];
  }
  register(extensionObject) {
    const extensionId = this.nextExtensionId++;
    this.extensions.push(extensionObject);
    const serviceName = `extension.${this.workerId}.${extensionId}`;
    const promise = dispatch.setService(serviceName, extensionObject).then(() => dispatch.call('extensions', 'registerExtensionService', serviceName));
    if (this.initialRegistrations) {
      this.initialRegistrations.push(promise);
    }
    return promise;
  }
}
globalThis.Scratch = globalThis.Scratch || {};
globalThis.Scratch.ArgumentType = ArgumentType;
globalThis.Scratch.BlockType = BlockType;
globalThis.Scratch.TargetType = TargetType;

/**
 * Expose only specific parts of the worker to extensions.
 */
const extensionWorker = new ExtensionWorker();
globalThis.Scratch.extensions = {
  register: extensionWorker.register.bind(extensionWorker)
};
/******/ 	return __webpack_exports__;
/******/ })()
;
});