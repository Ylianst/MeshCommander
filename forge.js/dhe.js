/**
 * DHE (Diffie-Hellman Ephemeral) implementation for Forge TLS.
 */
(function() {
/* ########## Begin module implementation ########## */
function initModule(forge) {

var tls = forge.tls;

// Diffie-Hellman implementation for DHE support
tls.dh = {
  // 2048-bit MODP Group 14 (RFC 3526) - well-known safe prime
  p2048: new forge.jsbn.BigInteger(
    'FFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD1' +
    '29024E088A67CC74020BBEA63B139B22514A08798E3404DD' +
    'EF9519B3CD3A431B302B0A6DF25F14374FE1356D6D51C245' +
    'E485B576625E7EC6F44C42E9A637ED6B0BFF5CB6F406B7ED' +
    'EE386BFB5A899FA5AE9F24117C4B1FE649286651ECE45B3D' +
    'C2007CB8A163BF0598DA48361C55D39A69163FA8FD24CF5F' +
    '83655D23DCA3AD961C62F356208552BB9ED529077096966D' +
    '670C354E4ABC9804F1746C08CA18217C32905E462E36CE3B' +
    'E39E772C180E86039B2783A2EC07A28FB5C55DF06F4C52C9' +
    'DE2BCBF6955817183995497CEA956AE515D2261898FA0510' +
    '15728E5A8AACAA68FFFFFFFFFFFFFFFF', 16),
  
  g2048: new forge.jsbn.BigInteger('2', 16),
  
  generateKeyPair: function(p, g) {
    p = p || tls.dh.p2048;
    g = g || tls.dh.g2048;
    
    // Generate random private key (1 < x < p-1)
    var pMinus1 = p.subtract(forge.jsbn.BigInteger.ONE);
    var privateKey;
    
    do {
      // Generate random bytes for private key
      var bytes = forge.random.getBytesSync(32); // 256 bits
      privateKey = new forge.jsbn.BigInteger(forge.util.bytesToHex(bytes), 16);
    } while (privateKey.compareTo(forge.jsbn.BigInteger.ONE) <= 0 || 
             privateKey.compareTo(pMinus1) >= 0);
    
    // Calculate public key: g^x mod p
    var publicKey = g.modPow(privateKey, p);
    
    return {
      privateKey: privateKey,
      publicKey: publicKey
    };
  },
  
  computeSecret: function(privateKey, theirPublicKey, p) {
    p = p || tls.dh.p2048;
    
    // Validate that their public key is in valid range (1 < Y < p-1)
    if(theirPublicKey.compareTo(forge.jsbn.BigInteger.ONE) <= 0 || 
       theirPublicKey.compareTo(p) >= 0) {
      throw new Error('Invalid DH public key');
    }
    
    // Compute shared secret: Y^x mod p
    return theirPublicKey.modPow(privateKey, p);
  }
};

} // end module implementation

/* ########## Begin module wrapper ########## */
var name = 'dhe';
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
