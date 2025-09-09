/**
 * A Javascript implementation of AES Cipher Suites for TLS.
 *
 * @author Dave Longley
 *
 * Copyright (c) 2009-2015 Digital Bazaar, Inc.
 *
 */
(function() {
/* ########## Begin module implementation ########## */
function initModule(forge) {

var tls = forge.tls;

/**
 * Supported cipher suites.
 */
tls.CipherSuites['TLS_RSA_WITH_AES_128_CBC_SHA'] = {
  id: [0x00,0x2f],
  name: 'TLS_RSA_WITH_AES_128_CBC_SHA',
  initSecurityParameters: function(sp) {
    sp.bulk_cipher_algorithm = tls.BulkCipherAlgorithm.aes;
    sp.cipher_type = tls.CipherType.block;
    sp.enc_key_length = 16;
    sp.block_length = 16;
    sp.fixed_iv_length = 16;
    sp.record_iv_length = 16;
    sp.mac_algorithm = tls.MACAlgorithm.hmac_sha1;
    sp.mac_length = 20;
    sp.mac_key_length = 20;
  },
  initConnectionState: initConnectionState
};
tls.CipherSuites['TLS_RSA_WITH_AES_256_CBC_SHA'] = {
  id: [0x00,0x35],
  name: 'TLS_RSA_WITH_AES_256_CBC_SHA',
  initSecurityParameters: function(sp) {
    sp.bulk_cipher_algorithm = tls.BulkCipherAlgorithm.aes;
    sp.cipher_type = tls.CipherType.block;
    sp.enc_key_length = 32;
    sp.block_length = 16;
    sp.fixed_iv_length = 16;
    sp.record_iv_length = 16;
    sp.mac_algorithm = tls.MACAlgorithm.hmac_sha1;
    sp.mac_length = 20;
    sp.mac_key_length = 20;
  },
  initConnectionState: initConnectionState
};

// cipher suites with SHA-256 MAC
tls.CipherSuites['TLS_RSA_WITH_AES_128_CBC_SHA256'] = {
  id: [0x00,0x3c],
  name: 'TLS_RSA_WITH_AES_128_CBC_SHA256',
  initSecurityParameters: function(sp) {
    sp.bulk_cipher_algorithm = tls.BulkCipherAlgorithm.aes;
    sp.cipher_type = tls.CipherType.block;
    sp.enc_key_length = 16;
    sp.block_length = 16;
    sp.fixed_iv_length = 16;
    sp.record_iv_length = 16;
    sp.mac_algorithm = tls.MACAlgorithm.hmac_sha256;
    sp.mac_length = 32;
    sp.mac_key_length = 32;
    sp.prf_algorithm = tls.PRFAlgorithm.tls_prf_sha256;
  },
  initConnectionState: initConnectionState_sha256
};

tls.CipherSuites['TLS_RSA_WITH_AES_256_CBC_SHA256'] = {
  id: [0x00,0x3d],
  name: 'TLS_RSA_WITH_AES_256_CBC_SHA256',
  initSecurityParameters: function(sp) {
    sp.bulk_cipher_algorithm = tls.BulkCipherAlgorithm.aes;
    sp.cipher_type = tls.CipherType.block;
    sp.enc_key_length = 32;
    sp.block_length = 16;
    sp.fixed_iv_length = 16;
    sp.record_iv_length = 16;
    sp.mac_algorithm = tls.MACAlgorithm.hmac_sha256;
    sp.mac_length = 32;
    sp.mac_key_length = 32;
    sp.prf_algorithm = tls.PRFAlgorithm.tls_prf_sha256;
  },
  initConnectionState: initConnectionState_sha256
};

tls.CipherSuites['TLS_RSA_WITH_AES_128_GCM_SHA256'] = {
  id: [0x00,0x9c],
  name: 'TLS_RSA_WITH_AES_128_GCM_SHA256',
  initSecurityParameters: function(sp) {
    sp.bulk_cipher_algorithm = tls.BulkCipherAlgorithm.aes;
    sp.cipher_type = tls.CipherType.aead;
    sp.enc_key_length = 16;
    sp.fixed_iv_length = 4;
    sp.record_iv_length = 8;
    sp.mac_algorithm = tls.MACAlgorithm.aead;
    sp.mac_length = 16;
    sp.mac_key_length = 0;
    sp.auth_tag_length = 16;
    sp.prf_algorithm = tls.PRFAlgorithm.tls_prf_sha256;
  },
  initConnectionState: initConnectionState_gcm
};

tls.CipherSuites['TLS_RSA_WITH_AES_256_GCM_SHA384'] = {
  id: [0x00,0x9d],
  name: 'TLS_RSA_WITH_AES_256_GCM_SHA384',
  initSecurityParameters: function(sp) {
    sp.bulk_cipher_algorithm = tls.BulkCipherAlgorithm.aes;
    sp.cipher_type = tls.CipherType.aead;
    sp.enc_key_length = 32;
    sp.fixed_iv_length = 4;
    sp.record_iv_length = 8;
    sp.mac_algorithm = tls.MACAlgorithm.aead;
    sp.mac_length = 16;
    sp.mac_key_length = 0;
    sp.auth_tag_length = 16;
    sp.prf_algorithm = tls.PRFAlgorithm.tls_prf_sha384;
  },
  initConnectionState: initConnectionState_gcm
};

tls.CipherSuites['TLS_DHE_RSA_WITH_AES_256_GCM_SHA384'] = {
  id: [0x00,0x9f],
  name: 'TLS_DHE_RSA_WITH_AES_256_GCM_SHA384',
  initSecurityParameters: function(sp) {
    sp.bulk_cipher_algorithm = tls.BulkCipherAlgorithm.aes;
    sp.cipher_type = tls.CipherType.aead;
    sp.enc_key_length = 32;
    sp.fixed_iv_length = 4;
    sp.record_iv_length = 8;
    sp.mac_algorithm = tls.MACAlgorithm.aead;
    sp.mac_length = 16;
    sp.mac_key_length = 0;
    sp.auth_tag_length = 16;
    sp.key_exchange_algorithm = 'dhe_rsa';
    sp.prf_algorithm = tls.PRFAlgorithm.tls_prf_sha384;
  },
  initConnectionState: initConnectionState_gcm
};

tls.CipherSuites['TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384'] = {
  id: [0xc0,0x30],
  name: 'TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384',
  initSecurityParameters: function(sp) {
    sp.bulk_cipher_algorithm = tls.BulkCipherAlgorithm.aes;
    sp.cipher_type = tls.CipherType.aead;
    sp.enc_key_length = 32;
    sp.fixed_iv_length = 4;
    sp.record_iv_length = 8;
    sp.mac_algorithm = tls.MACAlgorithm.aead;
    sp.mac_length = 16;
    sp.mac_key_length = 0;
    sp.auth_tag_length = 16;
    sp.key_exchange_algorithm = 'ecdhe_rsa';
    sp.prf_algorithm = tls.PRFAlgorithm.tls_prf_sha384;
  },
  initConnectionState: initConnectionState_gcm
};

tls.CipherSuites['TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256'] = {
  id: [0xc0,0x2f],
  name: 'TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256',
  initSecurityParameters: function(sp) {
    sp.bulk_cipher_algorithm = tls.BulkCipherAlgorithm.aes;
    sp.cipher_type = tls.CipherType.aead;
    sp.enc_key_length = 16;
    sp.fixed_iv_length = 4;
    sp.record_iv_length = 8;
    sp.mac_algorithm = tls.MACAlgorithm.aead;
    sp.mac_length = 16;
    sp.mac_key_length = 0;
    sp.auth_tag_length = 16;
    sp.key_exchange_algorithm = 'ecdhe_rsa';
    sp.prf_algorithm = tls.PRFAlgorithm.tls_prf_sha256;
  },
  initConnectionState: initConnectionState_gcm
};

tls.CipherSuites['TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384'] = {
  id: [0xc0,0x2c],
  name: 'TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384',
  initSecurityParameters: function(sp) {
    sp.bulk_cipher_algorithm = tls.BulkCipherAlgorithm.aes;
    sp.cipher_type = tls.CipherType.aead;
    sp.enc_key_length = 32;
    sp.fixed_iv_length = 4;
    sp.record_iv_length = 8;
    sp.mac_algorithm = tls.MACAlgorithm.aead;
    sp.mac_length = 16;
    sp.mac_key_length = 0;
    sp.auth_tag_length = 16;
    sp.key_exchange_algorithm = 'ecdhe_ecdsa';
    sp.prf_algorithm = tls.PRFAlgorithm.tls_prf_sha384;
  },
  initConnectionState: initConnectionState_gcm
};

function initConnectionState(state, c, sp) {
  var client = (c.entity === forge.tls.ConnectionEnd.client);

  // cipher setup
  state.read.cipherState = {
    init: false,
    cipher: forge.cipher.createDecipher('AES-CBC', client ?
      sp.keys.server_write_key : sp.keys.client_write_key),
    iv: client ? sp.keys.server_write_IV : sp.keys.client_write_IV
  };
  state.write.cipherState = {
    init: false,
    cipher: forge.cipher.createCipher('AES-CBC', client ?
      sp.keys.client_write_key : sp.keys.server_write_key),
    iv: client ? sp.keys.client_write_IV : sp.keys.server_write_IV
  };
  state.read.cipherFunction = decrypt_aes_cbc_sha1;
  state.write.cipherFunction = encrypt_aes_cbc_sha1;

  // MAC setup
  state.read.macLength = state.write.macLength = sp.mac_length;
  state.read.macFunction = state.write.macFunction = tls.hmac_sha1;
}

/**
 * Encrypts the TLSCompressed record into a TLSCipherText record using AES
 * in CBC mode.
 *
 * @param record the TLSCompressed record to encrypt.
 * @param s the ConnectionState to use.
 *
 * @return true on success, false on failure.
 */
function encrypt_aes_cbc_sha1(record, s) {
  var rval = false;

  // append MAC to fragment, update sequence number
  var mac = s.macFunction(s.macKey, s.sequenceNumber, record);
  record.fragment.putBytes(mac);
  s.updateSequenceNumber();

  // TLS 1.1+ use an explicit IV every time to protect against CBC attacks
  var iv;
  if(record.version.minor === tls.Versions.TLS_1_0.minor) {
    // use the pre-generated IV when initializing for TLS 1.0, otherwise use
    // the residue from the previous encryption
    iv = s.cipherState.init ? null : s.cipherState.iv;
  } else {
    iv = forge.random.getBytesSync(16);
  }

  s.cipherState.init = true;

  // start cipher
  var cipher = s.cipherState.cipher;
  cipher.start({iv: iv});

  // TLS 1.1+ write IV into output
  if(record.version.minor >= tls.Versions.TLS_1_1.minor) {
    cipher.output.putBytes(iv);
  }

  // do encryption (default padding is appropriate)
  cipher.update(record.fragment);
  if(cipher.finish(encrypt_aes_cbc_sha1_padding)) {
    // set record fragment to encrypted output
    record.fragment = cipher.output;
    record.length = record.fragment.length();
    rval = true;
  }

  return rval;
}

/**
 * Handles padding for aes_cbc_sha1 in encrypt mode.
 *
 * @param blockSize the block size.
 * @param input the input buffer.
 * @param decrypt true in decrypt mode, false in encrypt mode.
 *
 * @return true on success, false on failure.
 */
function encrypt_aes_cbc_sha1_padding(blockSize, input, decrypt) {
  /* The encrypted data length (TLSCiphertext.length) is one more than the sum
   of SecurityParameters.block_length, TLSCompressed.length,
   SecurityParameters.mac_length, and padding_length.

   The padding may be any length up to 255 bytes long, as long as it results in
   the TLSCiphertext.length being an integral multiple of the block length.
   Lengths longer than necessary might be desirable to frustrate attacks on a
   protocol based on analysis of the lengths of exchanged messages. Each uint8
   in the padding data vector must be filled with the padding length value.

   The padding length should be such that the total size of the
   GenericBlockCipher structure is a multiple of the cipher's block length.
   Legal values range from zero to 255, inclusive. This length specifies the
   length of the padding field exclusive of the padding_length field itself.

   This is slightly different from PKCS#7 because the padding value is 1
   less than the actual number of padding bytes if you include the
   padding_length uint8 itself as a padding byte. */
  if(!decrypt) {
    // get the number of padding bytes required to reach the blockSize and
    // subtract 1 for the padding value (to make room for the padding_length
    // uint8)
    var padding = blockSize - (input.length() % blockSize);
    input.fillWithByte(padding - 1, padding);
  }
  return true;
}

/**
 * Handles padding for aes_cbc_sha1 in decrypt mode.
 *
 * @param blockSize the block size.
 * @param output the output buffer.
 * @param decrypt true in decrypt mode, false in encrypt mode.
 *
 * @return true on success, false on failure.
 */
function decrypt_aes_cbc_sha1_padding(blockSize, output, decrypt) {
  var rval = true;
  if(decrypt) {
    /* The last byte in the output specifies the number of padding bytes not
      including itself. Each of the padding bytes has the same value as that
      last byte (known as the padding_length). Here we check all padding
      bytes to ensure they have the value of padding_length even if one of
      them is bad in order to ward-off timing attacks. */
    var len = output.length();
    var paddingLength = output.last();
    for(var i = len - 1 - paddingLength; i < len - 1; ++i) {
      rval = rval && (output.at(i) == paddingLength);
    }
    if(rval) {
      // trim off padding bytes and last padding length byte
      output.truncate(paddingLength + 1);
    }
  }
  return rval;
}

/**
 * Decrypts a TLSCipherText record into a TLSCompressed record using
 * AES in CBC mode.
 *
 * @param record the TLSCipherText record to decrypt.
 * @param s the ConnectionState to use.
 *
 * @return true on success, false on failure.
 */
var count = 0;
function decrypt_aes_cbc_sha1(record, s) {
  var rval = false;
  ++count;

  var iv;
  if(record.version.minor === tls.Versions.TLS_1_0.minor) {
    // use pre-generated IV when initializing for TLS 1.0, otherwise use the
    // residue from the previous decryption
    iv = s.cipherState.init ? null : s.cipherState.iv;
  } else {
    // TLS 1.1+ use an explicit IV every time to protect against CBC attacks
    // that is appended to the record fragment
    iv = record.fragment.getBytes(16);
  }

  s.cipherState.init = true;

  // start cipher
  var cipher = s.cipherState.cipher;
  cipher.start({iv: iv});

  // do decryption
  cipher.update(record.fragment);
  rval = cipher.finish(decrypt_aes_cbc_sha1_padding);

  // even if decryption fails, keep going to minimize timing attacks

  // decrypted data:
  // first (len - 20) bytes = application data
  // last 20 bytes          = MAC
  var macLen = s.macLength;

  // create a random MAC to check against should the mac length check fail
  // Note: do this regardless of the failure to keep timing consistent
  var mac = forge.random.getBytesSync(macLen);

  // get fragment and mac
  var len = cipher.output.length();
  if(len >= macLen) {
    record.fragment = cipher.output.getBytes(len - macLen);
    mac = cipher.output.getBytes(macLen);
  } else {
    // bad data, but get bytes anyway to try to keep timing consistent
    record.fragment = cipher.output.getBytes();
  }
  record.fragment = forge.util.createBuffer(record.fragment);
  record.length = record.fragment.length();

  // see if data integrity checks out, update sequence number
  var mac2 = s.macFunction(s.macKey, s.sequenceNumber, record);
  s.updateSequenceNumber();
  rval = compareMacs(s.macKey, mac, mac2) && rval;
  return rval;
}

/**
 * Safely compare two MACs. This function will compare two MACs in a way
 * that protects against timing attacks.
 *
 * TODO: Expose elsewhere as a utility API.
 *
 * See: https://www.nccgroup.trust/us/about-us/newsroom-and-events/blog/2011/february/double-hmac-verification/
 *
 * @param key the MAC key to use.
 * @param mac1 as a binary-encoded string of bytes.
 * @param mac2 as a binary-encoded string of bytes.
 *
 * @return true if the MACs are the same, false if not.
 */
function compareMacs(key, mac1, mac2) {
  var hmac = forge.hmac.create();

  hmac.start('SHA1', key);
  hmac.update(mac1);
  mac1 = hmac.digest().getBytes();

  hmac.start(null, null);
  hmac.update(mac2);
  mac2 = hmac.digest().getBytes();

  return mac1 === mac2;
}

function initConnectionState_sha256(state, c, sp) {
  var client = (c.entity === tls.ConnectionEnd.client);

  // cipher setup
  state.read.cipherState = {
    init: false,
    cipher: forge.cipher.createDecipher('AES-CBC', client ?
      sp.keys.server_write_key : sp.keys.client_write_key),
    iv: client ? sp.keys.server_write_IV : sp.keys.client_write_IV
  };
  state.write.cipherState = {
    init: false,
    cipher: forge.cipher.createCipher('AES-CBC', client ?
      sp.keys.client_write_key : sp.keys.server_write_key),
    iv: client ? sp.keys.client_write_IV : sp.keys.server_write_IV
  };
  state.read.cipherFunction = decrypt_aes_cbc_sha256;
  state.write.cipherFunction = encrypt_aes_cbc_sha256;

  // MAC setup
  state.read.macLength = state.write.macLength = sp.mac_length;
  state.read.macFunction = state.write.macFunction = tls.hmac_sha256;
}

function initConnectionState_gcm(state, c, sp) {
  var client = (c.entity === tls.ConnectionEnd.client);

  // cipher setup for AEAD (AES-GCM)
  state.read.cipherState = {
    init: false,
    cipher: forge.cipher.createDecipher('AES-GCM', client ?
      sp.keys.server_write_key : sp.keys.client_write_key),
    iv: client ? sp.keys.server_write_IV : sp.keys.client_write_IV,
    sequenceNumber: [0, 0]
  };
  state.write.cipherState = {
    init: false,
    cipher: forge.cipher.createCipher('AES-GCM', client ?
      sp.keys.client_write_key : sp.keys.server_write_key),
    iv: client ? sp.keys.client_write_IV : sp.keys.server_write_IV,
    sequenceNumber: [0, 0]
  };
  state.read.cipherFunction = decrypt_aes_gcm;
  state.write.cipherFunction = encrypt_aes_gcm;

  // AEAD doesn't use separate MAC
  state.read.macLength = state.write.macLength = 0;
  state.read.macFunction = state.write.macFunction = null;
}

/**
 * Updates a 64-bit sequence number represented as two 32-bit integers.
 *
 * @param seqNum the sequence number to update.
 */
function updateSequenceNumber(seqNum) {
  if(seqNum[1] === 0xFFFFFFFF) {
    seqNum[1] = 0;
    ++seqNum[0];
  } else {
    ++seqNum[1];
  }
}

/**
 * Encrypts the TLSCompressed record into a TLSCipherText record using AES
 * in CBC mode with SHA-256 MAC.
 *
 * @param record the TLSCompressed record to encrypt.
 * @param s the ConnectionState to use.
 *
 * @return true on success, false on failure.
 */
function encrypt_aes_cbc_sha256(record, s) {
  var rval = false;

  // append MAC to fragment, update sequence number
  var mac = s.macFunction(s.macKey, s.sequenceNumber, record);
  record.fragment.putBytes(mac);
  s.updateSequenceNumber();

  // TLS 1.1+ use an explicit IV every time to protect against CBC attacks
  var iv;
  if(record.version.minor === tls.Versions.TLS_1_0.minor) {
    // use the pre-generated IV when initializing for TLS 1.0, otherwise use
    // the residue from the previous encryption
    iv = s.cipherState.init ? null : s.cipherState.iv;
  } else {
    iv = forge.random.getBytesSync(16);
  }

  s.cipherState.init = true;

  // start cipher
  var cipher = s.cipherState.cipher;
  cipher.start({iv: iv});

  // TLS 1.1+ write IV into output
  if(record.version.minor >= tls.Versions.TLS_1_1.minor) {
    cipher.output.putBytes(iv);
  }

  // do encryption (default padding is appropriate)
  cipher.update(record.fragment);
  if(cipher.finish(encrypt_aes_cbc_sha256_padding)) {
    // set record fragment to encrypted output
    record.fragment = cipher.output;
    record.length = record.fragment.length();
    rval = true;
  }

  return rval;
}

/**
 * Handles padding for aes_cbc_sha256 in encrypt mode.
 *
 * @param blockSize the block size.
 * @param input the input buffer.
 * @param decrypt true in decrypt mode, false in encrypt mode.
 *
 * @return true on success, false on failure.
 */
function encrypt_aes_cbc_sha256_padding(blockSize, input, decrypt) {
  return encrypt_aes_cbc_sha1_padding(blockSize, input, decrypt);
}

/**
 * Decrypts a TLSCipherText record into a TLSCompressed record using
 * AES in CBC mode with SHA-256 MAC.
 *
 * @param record the TLSCipherText record to decrypt.
 * @param s the ConnectionState to use.
 *
 * @return true on success, false on failure.
 */
function decrypt_aes_cbc_sha256(record, s) {
  var rval = false;

  var iv;
  if(record.version.minor === tls.Versions.TLS_1_0.minor) {
    // use pre-generated IV when initializing for TLS 1.0, otherwise use the
    // residue from the previous decryption
    iv = s.cipherState.init ? null : s.cipherState.iv;
  } else {
    // TLS 1.1+ use an explicit IV every time to protect against CBC attacks
    // that is appended to the record fragment
    iv = record.fragment.getBytes(16);
  }

  s.cipherState.init = true;

  // start cipher
  var cipher = s.cipherState.cipher;
  cipher.start({iv: iv});

  // do decryption
  cipher.update(record.fragment);
  rval = cipher.finish(decrypt_aes_cbc_sha256_padding);

  // even if decryption fails, keep going to minimize timing attacks

  // decrypted data:
  // first (len - 32) bytes = application data
  // last 32 bytes          = MAC
  var macLen = s.macLength;

  // create a random MAC to check against should the mac length check fail
  // Note: do this regardless of the failure to keep timing consistent
  var mac = forge.random.getBytesSync(macLen);

  // get fragment and mac
  var len = cipher.output.length();
  if(len >= macLen) {
    record.fragment = cipher.output.getBytes(len - macLen);
    mac = cipher.output.getBytes(macLen);
  } else {
    // bad data, but get bytes anyway to try to keep timing consistent
    record.fragment = cipher.output.getBytes();
  }
  record.fragment = forge.util.createBuffer(record.fragment);
  record.length = record.fragment.length();

  // see if data integrity checks out, update sequence number
  var mac2 = s.macFunction(s.macKey, s.sequenceNumber, record);
  s.updateSequenceNumber();
  rval = (mac2 === mac) && rval;

  return rval;
}

/**
 * Handles padding for aes_cbc_sha256 in decrypt mode.
 *
 * @param blockSize the block size.
 * @param output the output buffer.
 * @param decrypt true in decrypt mode, false in encrypt mode.
 *
 * @return true on success, false on failure.
 */
function decrypt_aes_cbc_sha256_padding(blockSize, output, decrypt) {
  return decrypt_aes_cbc_sha1_padding(blockSize, output, decrypt);
}

/**
 * Encrypts the TLSCompressed record into a TLSCipherText record using AES
 * in GCM mode (AEAD).
 *
 * @param record the TLSCompressed record to encrypt.
 * @param s the ConnectionState to use.
 *
 * @return true on success, false on failure.
 */
function encrypt_aes_gcm(record, s) {
  var rval = false;

  // construct explicit nonce (8 bytes)
  var explicitNonce = forge.util.createBuffer();
  explicitNonce.putInt32(s.cipherState.sequenceNumber[0]);
  explicitNonce.putInt32(s.cipherState.sequenceNumber[1]);

  // construct IV: fixed_iv + explicit_nonce
  var iv = forge.util.createBuffer();
  iv.putBytes(s.cipherState.iv);
  iv.putBytes(explicitNonce.getBytes());

  // create additional data for AEAD
  var additionalData = forge.util.createBuffer();
  additionalData.putInt32(s.cipherState.sequenceNumber[0]);
  additionalData.putInt32(s.cipherState.sequenceNumber[1]);
  additionalData.putByte(record.type);
  additionalData.putByte(record.version.major);
  additionalData.putByte(record.version.minor);
  additionalData.putInt16(record.fragment.length());

  // start cipher with IV and additional data
  var cipher = s.cipherState.cipher;
  cipher.start({
    iv: iv.getBytes(),
    additionalData: additionalData.getBytes()
  });

  // encrypt the fragment
  cipher.update(record.fragment);
  if(cipher.finish()) {
    // prepend explicit nonce to ciphertext + auth tag
    record.fragment = forge.util.createBuffer();
    record.fragment.putBytes(explicitNonce.getBytes());
    record.fragment.putBytes(cipher.output.getBytes());
    record.fragment.putBytes(cipher.mode.tag.getBytes());
    record.length = record.fragment.length();
    rval = true;

    // update sequence number
    updateSequenceNumber(s.cipherState.sequenceNumber);
  }

  return rval;
}

/**
 * Decrypts a TLSCipherText record into a TLSCompressed record using
 * AES in GCM mode (AEAD).
 *
 * @param record the TLSCipherText record to decrypt.
 * @param s the ConnectionState to use.
 *
 * @return true on success, false on failure.
 */
function decrypt_aes_gcm(record, s) {
  var rval = false;

  // extract explicit nonce (8 bytes)
  var explicitNonce = record.fragment.getBytes(8);
  
  // extract auth tag (16 bytes from end)
  var ciphertext = record.fragment.getBytes(record.fragment.length() - 16);
  var authTag = record.fragment.getBytes(16);

  // construct IV: fixed_iv + explicit_nonce
  var iv = forge.util.createBuffer();
  iv.putBytes(s.cipherState.iv);
  iv.putBytes(explicitNonce);

  // create additional data for AEAD
  var additionalData = forge.util.createBuffer();
  additionalData.putInt32(s.cipherState.sequenceNumber[0]);
  additionalData.putInt32(s.cipherState.sequenceNumber[1]);
  additionalData.putByte(record.type);
  additionalData.putByte(record.version.major);
  additionalData.putByte(record.version.minor);
  additionalData.putInt16(ciphertext.length);

  // start cipher with IV, additional data, and auth tag
  var cipher = s.cipherState.cipher;
  cipher.start({
    iv: iv.getBytes(),
    additionalData: additionalData.getBytes(),
    tag: authTag
  });

  // decrypt the ciphertext
  cipher.update(forge.util.createBuffer(ciphertext));
  if(cipher.finish()) {
    record.fragment = cipher.output;
    record.length = record.fragment.length();
    rval = true;

    // update sequence number
    updateSequenceNumber(s.cipherState.sequenceNumber);
  }

  return rval;
}

} // end module implementation

/* ########## Begin module wrapper ########## */
var name = 'aesCipherSuites';
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
define(['require', 'module', './aes', './tls'], function() {
  defineFunc.apply(null, Array.prototype.slice.call(arguments, 0));
});
})();
