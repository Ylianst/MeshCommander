/**
* @fileoverview Intel(r) AMT Certificate functions
* @author Ylian Saint-Hilaire
* @version v0.2.0b
*/

/*
// Check which key pair matches the public key in the certificate
function amtcert_linkCertPrivateKey(certs, keys) {
    for (var i in certs) {
        var cert = certs[i];
        try {
            if (keys.length == 0) return;
            var publicKeyPEM = forge.pki.publicKeyToPem(forge.pki.certificateFromAsn1(forge.asn1.fromDer(cert.X509Certificate)).publicKey).substring(28 + 32).replace(/(\r\n|\n|\r)/gm, "");
            for (var j = 0; j < keys.length; j++) {
                if (publicKeyPEM === (keys[j]['DERKey'] + '-----END PUBLIC KEY-----')) {
                    keys[j].XCert = cert; // Link the key pair to the certificate
                    cert.XPrivateKey = keys[j]; // Link the certificate to the key pair
                }
            }
        } catch (e) { console.log(e); }
    }
}
*/

// Check which key pair matches the public key in the certificate
function amtcert_linkCertPrivateKey(certs, keys) {
    if ((keys == null) || (keys.length == 0)) return;
    for (var i in certs) {
        var cert = certs[i];
        try {
            var publicKeyPEM = forge.pki.publicKeyToPem(forge.pki.certificateFromAsn1(forge.asn1.fromDer(cert.X509Certificate)).publicKey).substring(28 + 32).replace(/(\r\n|\n|\r)/gm, "");
            publicKeyPEM = publicKeyPEM.substring(0, publicKeyPEM.length - 24); // Remove the PEM footer
            for (var j = 0; j < keys.length; j++) {
                if ((publicKeyPEM === (keys[j]['DERKey'])) || (publicKeyPEM == btoa(atob(keys[j]['DERKey']).substring(24)))) { // Match directly or, new version of Intel AMT put the key type OID in the private key, skip that and match.
                    keys[j].XCert = cert; // Link the key pair to the certificate
                    cert.XPrivateKey = keys[j]; // Link the certificate to the key pair
                }
            }
        } catch (e) { console.log(e); }
    }
}

// Load a P12 file, decodes it using the password and returns the private key handle
function amtcert_loadP12File(file, password, func) {
    try {
        // Encode in Base64 so Forge API can parse it.
        var p12Der = window.forge.util.decode64(btoa(file));
        var p12Asn1 = window.forge.asn1.fromDer(p12Der);
        var p12 = window.forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);

        // Private key is stored in a shrouded key bag
        var bags = p12.getBags({ bagType: window.forge.pki.oids.pkcs8ShroudedKeyBag });
        console.assert(bags[window.forge.pki.oids.pkcs8ShroudedKeyBag] && bags[window.forge.pki.oids.pkcs8ShroudedKeyBag].length > 0);
        
        // Import the Forge private key structure into Web Crypto
        var privateKey = bags[window.forge.pki.oids.pkcs8ShroudedKeyBag][0].key;
        var rsaPrivateKey = window.forge.pki.privateKeyToAsn1(privateKey);
        var privateKeyInfo = window.forge.pki.wrapRsaPrivateKey(rsaPrivateKey);
        var pkcs8 = window.forge.asn1.toDer(privateKeyInfo).getBytes();
        
        // Get the issuer attributes
        var certBags = p12.getBags({ bagType: window.forge.pki.oids.certBag });
        var issuerAttributes = certBags[window.forge.pki.oids.certBag][0].cert.subject.attributes;

        var bags1 = p12.getBags({ bagType: forge.pki.oids.certBag });
        var cert = bags1[forge.pki.oids.certBag][0].cert;

        func(privateKey, issuerAttributes, cert);
        return true;
    } catch (ex) { }
    return false;
}

function amtcert_signWithCaKey(DERKey, caPrivateKey, certAttributes, issuerAttributes, extKeyUsage) {
    if (!caPrivateKey || caPrivateKey == null) {
        var certAndKey = amtcert_createCertificate(issuerAttributes);
        caPrivateKey = certAndKey.key;
    }
    return amtcert_createCertificate(certAttributes, caPrivateKey, DERKey, issuerAttributes, extKeyUsage);
}

// --- Extended Key Usage OID's ---
// 1.3.6.1.5.5.7.3.1            = TLS Server certificate
// 1.3.6.1.5.5.7.3.2            = TLS Client certificate
// 2.16.840.1.113741.1.2.1      = Intel AMT Remote Console
// 2.16.840.1.113741.1.2.2      = Intel AMT Local Console
// 2.16.840.1.113741.1.2.3      = Intel AMT Client Setup Certificate (Zero-Touch)

// Generate a certificate with a set of attributes signed by a rootCert. If the rootCert is obmitted, the generated certificate is self-signed.
function amtcert_createCertificate(certAttributes, caPrivateKey, DERKey, issuerAttributes, extKeyUsage) {
    // Generate a keypair and create an X.509v3 certificate
    var keys, cert = forge.pki.createCertificate();
    if (!DERKey) {
        keys = forge.pki.rsa.generateKeyPair(2048);
        cert.publicKey = keys.publicKey;
    } else {
        cert.publicKey = forge.pki.publicKeyFromPem('-----BEGIN PUBLIC KEY-----' + DERKey + '-----END PUBLIC KEY-----');
    }
    cert.serialNumber = '' + Math.floor((Math.random() * 100000) + 1);
    cert.validity.notBefore = new Date(2018, 0, 1);
    //cert.validity.notBefore.setFullYear(cert.validity.notBefore.getFullYear() - 1); // Create a certificate that is valid one year before, to make sure out-of-sync clocks don't reject this cert.
    cert.validity.notAfter = new Date(2049, 11, 31);
    //cert.validity.notAfter.setFullYear(cert.validity.notAfter.getFullYear() + 20);
    var attrs = [];
    if (certAttributes['CN']) attrs.push({ name: 'commonName', value: certAttributes['CN'] });
    if (certAttributes['C']) attrs.push({ name: 'countryName', value: certAttributes['C'] });
    if (certAttributes['ST']) attrs.push({ shortName: 'ST', value: certAttributes['ST'] });
    if (certAttributes['O']) attrs.push({ name: 'organizationName', value: certAttributes['O'] });
    cert.setSubject(attrs);

    if (caPrivateKey) {
        // Use root attributes
        var rootattrs = [];
        if (issuerAttributes['CN']) rootattrs.push({ name: 'commonName', value: issuerAttributes['CN'] });
        if (issuerAttributes['C']) rootattrs.push({ name: 'countryName', value: issuerAttributes['C'] });
        if (issuerAttributes['ST']) rootattrs.push({ shortName: 'ST', value: issuerAttributes['ST'] });
        if (issuerAttributes['O']) rootattrs.push({ name: 'organizationName', value: issuerAttributes['O'] });
        cert.setIssuer(rootattrs);
    } else {
        // Use our own attributes
        cert.setIssuer(attrs);
    }

    if (caPrivateKey == null) {
        // Create a root certificate
        cert.setExtensions([{
            name: 'basicConstraints',
            cA: true
        }, {
            name: 'nsCertType',
            sslCA: true,
            emailCA: true,
            objCA: true
        }, {
            name: 'subjectKeyIdentifier'
        }]);
    } else {
        if (extKeyUsage == null) { extKeyUsage = { name: 'extKeyUsage', serverAuth: true, } } else { extKeyUsage.name = 'extKeyUsage'; }

        /*
        {
            name: 'extKeyUsage',
            serverAuth: true,
            clientAuth: true,
            codeSigning: true,
            emailProtection: true,
            timeStamping: true,
            '2.16.840.1.113741.1.2.1': true
        }
        */

        // Create a leaf certificate
        cert.setExtensions([{
            name: 'basicConstraints'
        }, {
            name: 'keyUsage',
            keyCertSign: true,
            digitalSignature: true,
            nonRepudiation: true,
            keyEncipherment: true,
            dataEncipherment: true
        }, extKeyUsage, {
            name: 'nsCertType',
            client: true,
            server: true,
            email: true,
            objsign: true,
        }, {
            name: 'subjectKeyIdentifier'
        }]);
    }

    // Self-sign certificate
    if (caPrivateKey) {
        cert.sign(caPrivateKey, forge.md.sha256.create());
    } else {
        cert.sign(keys.privateKey, forge.md.sha256.create());
    }

    if (DERKey) {
        return cert;
    } else {
        return { 'cert': cert, 'key': keys.privateKey };
    }
}

function _stringToArrayBuffer(str) {
    var buf = new ArrayBuffer(str.length);
    var bufView = new Uint8Array(buf);
    for (var i = 0, strLen = str.length; i < strLen; i++) { bufView[i] = str.charCodeAt(i); }
    return buf;
}

function _arrayBufferToString(buffer) {
    var binary = '';
    var bytes = new Uint8Array(buffer);
    var len = bytes.byteLength;
    for (var i = 0; i < len; i++) { binary += String.fromCharCode(bytes[i]); }
    return binary;
}

function certCetAsn1Values(node, list) {
    if ((typeof node === 'string') && (node.indexOf('https://') == 0)) { list.push(node); return; }
    if (Array.isArray(node)) { for (var i in node) { certCetAsn1Values(node[i], list); } return; }
    if (node && typeof node === 'object') { certCetAsn1Values(node.value, list) }
}

function getExtensionUrls(cert, val) {
    var list = [], ext = cert.getExtension(val);
    if (ext != null) { certCetAsn1Values(forge.asn1.fromDer(ext.value), list); }
    return list;
}

var certUrlCache = null;
var certUrlCacheFile = null;
function getCertUrl(url, func) {
    if (certUrlCacheFile == null) { if (process.env.LOCALAPPDATA != null) { certUrlCacheFile = require('path').join(process.env.LOCALAPPDATA, 'mccache.json'); } else { certUrlCacheFile = 'mccache.json'; } }
    if (certUrlCache == null) { try { certUrlCache = JSON.parse(require('fs').readFileSync(certUrlCacheFile)); } catch (ex) { certUrlCache = {}; } }
    if ((certUrlCache[url] != null) && (certUrlCache[url].data != null)) { var timeout = 0; if (url.endsWith('.crl')) { timeout = Date.now() - (14 * 86400000); } if (certUrlCache[url].time > timeout) { func(url, atob(certUrlCache[url].data)); return; } }
    console.log('Loading: ' + url);
    var u = require('url').parse(url);
    var req = require('https').get({ hostname: u.hostname, port: u.port?u.port:443, path: u.path, method: 'GET', rejectUnauthorized: false
    }, function (resp) {
        var data = '';
        resp.on('data', function (chunk) { if (data != null) { data += chunk.toString('binary'); } if (data.length > 500000) { data = null; } });
        resp.on('end', function () { certUrlCache[url] = { data: btoa(data), time: Date.now() }; try { require('fs').writeFileSync(certUrlCacheFile, JSON.stringify(certUrlCache, null, 2)); } catch (ex) { } func(url, data); });
    });
    req.on('error', function (err) { console.log('Error: ' + err.message); func(url, null); });
}