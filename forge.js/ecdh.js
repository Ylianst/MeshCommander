/**
 * ECDH (Elliptic Curve Diffie-Hellman) implementation for Forge TLS.
 */
(function() {
/* ########## Begin module implementation ########## */
function initModule(forge) {

var tls = forge.tls;

// Basic ECDH implementation for secp256r1 (P-256) and secp384r1
tls.ecdh = {};

tls.ecdh.curves = {
  'secp256r1': {
    p: new forge.jsbn.BigInteger('FFFFFFFF00000001000000000000000000000000FFFFFFFFFFFFFFFFFFFFFFFF', 16),
    a: new forge.jsbn.BigInteger('FFFFFFFF00000001000000000000000000000000FFFFFFFFFFFFFFFFFFFFFFFC', 16),
    b: new forge.jsbn.BigInteger('5AC635D8AA3A93E7B3EBBD55769886BC651D06B0CC53B0F63BCE3C3E27D2604B', 16),
    gx: new forge.jsbn.BigInteger('6B17D1F2E12C4247F8BCE6E563A440F277037D812DEB33A0F4A13945D898C296', 16),
    gy: new forge.jsbn.BigInteger('4FE342E2FE1A7F9B8EE7EB4A7C0F9E162BCE33576B315ECECBB6406837BF51F5', 16),
    n: new forge.jsbn.BigInteger('FFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551', 16),
    fieldSize: 32
  },
  'secp384r1': {
    p: new forge.jsbn.BigInteger('FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFFFF0000000000000000FFFFFFFF', 16),
    a: new forge.jsbn.BigInteger('FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFFFF0000000000000000FFFFFFFC', 16),
    b: new forge.jsbn.BigInteger('B3312FA7E23EE7E4988E056BE3F82D19181D9C6EFE8141120314088F5013875AC656398D8A2ED19D2A85C8EDD3EC2AEF', 16),
    gx: new forge.jsbn.BigInteger('AA87CA22BE8B05378EB1C71EF320AD746E1D3B628BA79B9859F741E082542A385502F25DBF55296C3A545E3872760AB7', 16),
    gy: new forge.jsbn.BigInteger('3617DE4A96262C6F5D9E98BF9292DC29F8F41DBD289A147CE9DA3113B5F0B8C00A60B1CE1D7E819D7A431D7C90EA0E5F', 16),
    n: new forge.jsbn.BigInteger('FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFC7634D81F4372DDF581A0DB248B0A77AECEC196ACCC52973', 16),
    fieldSize: 48
  }
};

// Simple elliptic curve point implementation
tls.ecdh.ECPoint = function(curve, x, y) {
  this.curve = curve;
  this.x = x;
  this.y = y;
  this.isInfinity = (x === null && y === null);
};

tls.ecdh.ECPoint.prototype.add = function(other) {
  if(this.isInfinity) return other;
  if(other.isInfinity) return this;
  
  var p = this.curve.p;
  
  if(this.x.equals(other.x)) {
    if(this.y.equals(other.y)) {
      // Point doubling
      var s = this.x.multiply(this.x).multiply(new forge.jsbn.BigInteger('3')).add(this.curve.a)
               .multiply(this.y.multiply(new forge.jsbn.BigInteger('2')).modInverse(p)).mod(p);
      var x3 = s.multiply(s).subtract(this.x.multiply(new forge.jsbn.BigInteger('2'))).mod(p);
      var y3 = s.multiply(this.x.subtract(x3)).subtract(this.y).mod(p);
      return new tls.ecdh.ECPoint(this.curve, x3, y3);
    } else {
      // Points are inverses
      return new tls.ecdh.ECPoint(this.curve, null, null); // Point at infinity
    }
  } else {
    // Point addition
    var s = other.y.subtract(this.y).multiply(other.x.subtract(this.x).modInverse(p)).mod(p);
    var x3 = s.multiply(s).subtract(this.x).subtract(other.x).mod(p);
    var y3 = s.multiply(this.x.subtract(x3)).subtract(this.y).mod(p);
    return new tls.ecdh.ECPoint(this.curve, x3, y3);
  }
};

tls.ecdh.ECPoint.prototype.multiply = function(k) {
  if(k.equals(forge.jsbn.BigInteger.ZERO)) {
    return new tls.ecdh.ECPoint(this.curve, null, null); // Point at infinity
  }
  
  var result = new tls.ecdh.ECPoint(this.curve, null, null); // Start with point at infinity
  var addend = this;
  
  while(k.compareTo(forge.jsbn.BigInteger.ZERO) > 0) {
    if(k.testBit(0)) {
      result = result.add(addend);
    }
    addend = addend.add(addend); // Double
    k = k.shiftRight(1);
  }
  
  return result;
};

// ECDH key generation and shared secret computation
tls.ecdh.generateKeyPair = function(curveName) {
  var curve = tls.ecdh.curves[curveName];
  if(!curve) {
    throw new Error('Unsupported curve: ' + curveName);
  }
  
  // Generate random private key
  var privateKey;
  do {
    var privateKeyBytes = forge.random.getBytes(curve.fieldSize);
    privateKey = new forge.jsbn.BigInteger(forge.util.bytesToHex(privateKeyBytes), 16);
  } while(privateKey.compareTo(curve.n) >= 0 || privateKey.equals(forge.jsbn.BigInteger.ZERO));
  
  // Compute public key = private * G
  var G = new tls.ecdh.ECPoint(curve, curve.gx, curve.gy);
  var publicPoint = G.multiply(privateKey);
  
  return {
    privateKey: privateKey,
    publicKey: publicPoint
  };
};

tls.ecdh.computeSharedSecret = function(privateKey, publicPoint) {
  var sharedPoint = publicPoint.multiply(privateKey);
  
  // Convert x-coordinate to bytes (shared secret is the x-coordinate)
  var sharedSecret = forge.util.hexToBytes(sharedPoint.x.toString(16));
  
  // Pad to field size
  var fieldSize = publicPoint.curve.fieldSize;
  while(sharedSecret.length < fieldSize) {
    sharedSecret = '\x00' + sharedSecret;
  }
  
  return sharedSecret;
};

tls.ecdh.encodePoint = function(point) {
  if(point.isInfinity) {
    return String.fromCharCode(0x00);
  }
  
  // Uncompressed point format: 0x04 || x || y
  var x = forge.util.hexToBytes(point.x.toString(16));
  var y = forge.util.hexToBytes(point.y.toString(16));
  
  // Pad to field size
  var fieldSize = point.curve.fieldSize;
  while(x.length < fieldSize) x = '\x00' + x;
  while(y.length < fieldSize) y = '\x00' + y;
  
  return String.fromCharCode(0x04) + x + y;
};

tls.ecdh.decodePoint = function(curve, pointBytes) {
  if(pointBytes.length === 0 || pointBytes.charCodeAt(0) === 0x00) {
    return new tls.ecdh.ECPoint(curve, null, null); // Point at infinity
  }
  
  if(pointBytes.charCodeAt(0) !== 0x04) {
    throw new Error('Only uncompressed points are supported');
  }
  
  var fieldSize = curve.fieldSize;
  if(pointBytes.length !== 1 + 2 * fieldSize) {
    throw new Error('Invalid point encoding length');
  }
  
  var x = new forge.jsbn.BigInteger(forge.util.bytesToHex(pointBytes.substr(1, fieldSize)), 16);
  var y = new forge.jsbn.BigInteger(forge.util.bytesToHex(pointBytes.substr(1 + fieldSize, fieldSize)), 16);
  
  return new tls.ecdh.ECPoint(curve, x, y);
};

} // end module implementation

/* ########## Begin module wrapper ########## */
var name = 'ecdh';
if(typeof define !== 'function') {
  // NodeJS -> AMD
  if(typeof module === 'object' && module.exports) {
    var nodeJS = true;
    define = function(ids, factory) {
      factory(require, module);
    };
  } else {
    // <script>
    if(typeof forge === 'undefined') {
      forge = {};
    }
    return initModule(forge);
  }
}
// AMD
var deps;
var defineFunc = function(require, module) {
  module.exports = function(forge) {
    var mods = deps.map(function(dep) {
      return require(dep);
    }).concat(initModule);
    // handle circular dependencies
    forge = forge || {};
    forge.defined = forge.defined || {};
    if(forge.defined[name]) {
      return forge[name];
    }
    forge.defined[name] = true;
    for(var i = 0; i < mods.length; ++i) {
      mods[i](forge);
    }
    return forge[name];
  };
};
var tmpDefine = define;
define = function(ids, factory) {
  deps = (typeof ids === 'string') ? factory.slice(2) : ids.slice(2);
  if(nodeJS) {
    delete define;
    return tmpDefine.apply(null, Array.prototype.slice.call(arguments, 0));
  }
  define = tmpDefine;
  return define.apply(null, Array.prototype.slice.call(arguments, 0));
};
define(['require', 'module', './util', './jsbn', './random', './tls'], function() {
  defineFunc.apply(null, Array.prototype.slice.call(arguments, 0));
});
})();
