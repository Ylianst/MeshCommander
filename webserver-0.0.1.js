/** 
* @description One Client Recovery (OCR) web server
* @author Ylian Saint-Hilaire
* @version v0.0.1
*/

// Construct tiny web server
var CreateWebServer = function () {
    const fs = require('fs');
    const net = require('net');
    const tls = require('tls');
    const path = require("path");
    var obj = {};
    var server = null;
    obj.port = random(33000, 65500); // Port used to listen for incoming requests.
    obj.state = 0;                   // State of the web server, 0 = Disabled, 2 = Listening.
    obj.rootCert = null;             // Root certificate in PEM format.
    obj.rootKey = null;              // Root certificate private key in PEM format.
    obj.cert = null;                 // TLS certificate in PEM format.
    obj.key = null;                  // TLS certificate private key in PEM format.
    obj.certCommonName = null;       // TLS certificate common name.
    obj.certHashRaw = null;          // SHA384 hash of TLS certificate.
    obj.certHashHex = null;          // SHA384 hash of TLS certificate in HEX.
    obj.responses = {};              // Table responses to different url paths.
    obj.transfers = [];              // List of currently active file transfers.
    obj.transfersTimer = null;       // When file transfers are active, this is a half second timer.
    obj.onTransfers = null;          // Callback for transfers status.
    obj.lastBootImageArgs = null;

    // Return a random number between min and max
    function random(min, max) { return Math.floor(min + Math.random() * (max - min)); }

    // Start the web server
    obj.start = function (func) {
        if (server != null) return;
        obj.state = 1;
        if ((obj.cert != null) && (obj.key != null)) { server = tls.createServer({ cert: obj.cert, key: obj.key, minVersion: 'TLSv1' }, onConnection); } else { server = net.createServer(onConnection); }
        server.on('error', function (err) { if (err.code == 'EADDRINUSE') { obj.port = random(33000, 65500); server = null; obj.start(func); } else { console.log('WebServer Listen Error', err.code); } });
        server.listen({ port: obj.port }, function (x) { obj.state = 2; console.log('WebServer listening on ' + obj.port + ', CN: ' + obj.certCommonName); if (func != null) { func(); } });
    }

    // Called when a new incoming connection is made
    function onConnection(socket) {
        if (socket.remoteAddress.startsWith('::ffff:')) { socket.xremoteAddress = socket.remoteAddress.substring(7); } else { socket.xremoteAddress = socket.remoteAddress; }
        console.log('WebServer, socket connection from ' + socket.xremoteAddress + ':' + socket.remotePort);
        socket.xdata = ''; // Accumulator
        socket.on('data', function (data) {
            this.xdata += data.toString('utf8');
            var headersize = this.xdata.indexOf('\r\n\r\n');
            if (headersize < 0) { if (this.xdata.length > 4096) { this.close(); } return; }
            var headers = this.xdata.substring(0, headersize).split('\r\n');
            if (headers.length < 1) { this.close(); return; }
            var headerObj = {};
            for (var i = 1; i < headers.length; i++) { var j = headers[i].indexOf(': '); if (i > 0) { headerObj[headers[i].substring(0, j).toLowerCase()] = headers[i].substring(j + 2); } }
            var hostHeader = (headerObj['host'] != null) ? ('Host: ' + headerObj['host'] + '\r\n') : '';
            var directives = headers[0].split(' ');
            if ((directives.length != 3) || ((directives[0] != 'GET') && (directives[0] != 'HEAD'))) { this.end(); return; }
            console.log('WebServer, request', directives[0], directives[1]);
            var responseCode = 404, responseType = 'text/html', responseData = 'Invalid request', r = obj.responses[directives[1]];
            if (r != null) {
                if (typeof r == 'string') {
                    responseCode = 200; responseData = obj.responses[directives[1]];
                } else if (typeof r == 'object') {
                    responseCode = 200;
                    if (r.type) { responseType = r.type; }
                    if (r.data) { responseData = r.data; }
                    if (r.shortfile) { try { responseData = fs.readFileSync(r.shortfile); } catch (ex) { responseCode = 404; responseType = 'text/html'; responseData = 'File not found'; } }
                    if (r.file) {
                        // Send the file header and pipe the rest of the file
                        this.xfilepath = r.file;
                        this.xfilename = path.basename(r.file);
                        this.xsize = fs.statSync(r.file).size;
                        this.write('HTTP/1.1 200 OK\r\n' + hostHeader + 'Content-Type: application/octet-stream\r\nConnection: keep-alive\r\nContent-Length: ' + this.xsize + '\r\n\r\n');

                        if (directives[0] == 'GET') {
                            console.log('WebServer, Streaming File: ' + r.file);
                            var writable = require('stream').Writable;
                            this.progress = new writable({ write: function (chunk, encoding, flush) { this.count += chunk.length; flush(); } });
                            this.progress.count = 0;
                            var ws = fs.createReadStream(r.file, { flags: 'r' });
                            ws.pipe(this.progress); ws.pipe(this);
                            obj.transfers.push(this);

                            // Start the progress bar timer
                            if (obj.onTransfers != null) { obj.onTransfers(obj, obj.transfers); if (obj.transfersTimer == null) { obj.transfersTimer = setInterval(function () { obj.onTransfers(obj, obj.transfers); }, 500); } }
                        }
                        this.xdata = '';
                        return;
                    }
                }
            }
            socket.write('HTTP/1.1 ' + responseCode + ' OK\r\n' + hostHeader + 'Connection: keep-alive\r\nContent-Type: ' + responseType + '\r\nContent-Length: ' + responseData.length + '\r\n\r\n');
            socket.write(responseData);
            this.xdata = '';
        });
        socket.on('end', function () { cleanupSocket(this); console.log('WebServer, socket closed'); });
        socket.on('error', function (err) { cleanupSocket(this); console.log('WebServer, socket error', err); });
    }

    // Remove the socket from the transfer list and clear the timer if needed
    function cleanupSocket(socket) {
        var i = obj.transfers.indexOf(socket);
        if (i >= 0) {
            obj.transfers.splice(i, 1);
            obj.onTransfers(obj, obj.transfers);
            if (obj.transfers.length == 0) { clearInterval(obj.transfersTimer); obj.transfersTimer = null; }
        }
    }

    // Stop the web server
    obj.stop = function () { if (server == null) return; server.close(); server = null; }

    // Generate a TLS certificate (this is really a root cert)
    obj.generateCertificate = function (commonName) {
        var attrs1 = [{ name: 'commonName', value: 'MC-WebServerRoot-' + random(1, 10000000) }, { name: 'countryName', value: 'unknown' }, { name: 'organizationName', value: 'unknown' }];
        var attrs2 = [{ name: 'commonName', value: (commonName ? commonName : 'MeshCommander') }, { name: 'countryName', value: 'unknown' }, { name: 'organizationName', value: 'unknown' }];

        if (fs.existsSync('webroot.crt') && fs.existsSync('webroot.key')) {
            console.log('Read root from file');
            obj.rootCert = fs.readFileSync('webroot.crt').toString();
            obj.rootKey = fs.readFileSync('webroot.key').toString();
            var rootcert = forge.pki.certificateFromPem(obj.rootCert);
            var rootkeys = { privateKey: forge.pki.privateKeyFromPem(obj.rootKey) };
            attrs1[0].value = rootcert.subject.getField('CN').value;
            attrs1[1].value = rootcert.subject.getField('C').value;
            attrs1[2].value = rootcert.subject.getField('O').value;
        } else {
            // Generate a root keypair and create an X.509v3 root certificate
            console.log('Generate root ' + attrs1[0].value + '...');
            var rootkeys = forge.pki.rsa.generateKeyPair(2048);
            var rootcert = forge.pki.createCertificate();
            rootcert.publicKey = rootkeys.publicKey;
            rootcert.serialNumber = '' + Math.floor((Math.random() * 100000) + 1);
            rootcert.validity.notBefore = new Date(2018, 0, 1);
            rootcert.validity.notAfter = new Date(2049, 11, 31);
            rootcert.setSubject(attrs1);
            rootcert.setIssuer(attrs1);
            rootcert.setExtensions([{ name: 'basicConstraints', cA: true }, { name: 'keyUsage', keyCertSign: true }, { name: 'subjectKeyIdentifier' }]); // Root extensions
            rootcert.sign(rootkeys.privateKey, forge.md.sha384.create());
            obj.rootCert = forge.pki.certificateToPem(rootcert);
            obj.rootKey = forge.pki.privateKeyToPem(rootkeys.privateKey);
            fs.writeFileSync('webroot.crt', obj.rootCert);
            fs.writeFileSync('webroot.key', obj.rootKey);
        }

        if (commonName === 0) return; // This is used to only generate the root cert and exit.

        if (fs.existsSync('webleaf.crt') && fs.existsSync('webleaf.key')) {
            console.log('Read leaf from file');
            obj.cert = fs.readFileSync('webleaf.crt').toString();
            obj.key = fs.readFileSync('webleaf.key').toString();
            var cert = forge.pki.certificateFromPem(obj.cert);
            var keys = { privateKey: forge.pki.privateKeyFromPem(obj.key) };
            obj.certCommonName = forge.pki.certificateFromPem(obj.cert).subject.getField('CN').value;
        }

        if ((obj.certCommonName == null) || ((commonName != null) && (commonName != obj.certCommonName))) {
            console.log('Generate leaf ' + attrs2[0].value + '...');
            // Generate a keypair and create an X.509v3 certificate
            var keys = forge.pki.rsa.generateKeyPair(2048);
            var cert = forge.pki.createCertificate();
            cert.publicKey = keys.publicKey;
            cert.serialNumber = '' + Math.floor((Math.random() * 100000) + 1);
            cert.validity.notBefore = new Date(2018, 0, 1);
            cert.validity.notAfter = new Date(2049, 11, 31);
            cert.setSubject(attrs2);
            cert.setIssuer(attrs1);

            // Figure out the extended key usages
            var extKeyUsage = { name: 'extKeyUsage', serverAuth: true }

            // Create a leaf certificate
            cert.setExtensions([{ name: 'basicConstraints' }, { name: 'keyUsage', digitalSignature: true, keyEncipherment: true }, extKeyUsage, { name: 'subjectKeyIdentifier' }]);

            // Self-sign certificate
            cert.sign(rootkeys.privateKey, forge.md.sha384.create());
            obj.cert = forge.pki.certificateToPem(cert);
            obj.key = forge.pki.privateKeyToPem(keys.privateKey);
            obj.certCommonName = (commonName ? commonName : 'MeshCommander');

            fs.writeFileSync('webleaf.crt', obj.cert);
            fs.writeFileSync('webleaf.key', obj.key);
        }

        // Compute the SHA256 hash of the certificate
        var md = forge.md.sha256.create();
        md.start(); md.update(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes());
        var digest = md.digest();
        obj.certHashRaw = digest.data;
        obj.certHashHex = digest.toHex();
        console.log('SHA256', md.digest().toHex());

        // Compute the SHA384 hash of the certificate
        md = forge.md.sha384.create();
        md.start(); md.update(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes());
        console.log('SHA384', md.digest().toHex());

        // Compute the SHA512 hash of the certificate
        md = forge.md.sha512.create();
        md.start(); md.update(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes());
        console.log('SHA512', md.digest().toHex());
    }

    // Setup UEFI boot image
    obj.setupBootImage = function(filePath, ip) {
        if (fs.existsSync(filePath) == false) return null;
        var name = ('' + Math.random()).substring(2) + '.iso';
        obj.responses['/' + name] = { type: 'application/octet-stream', file: filePath };
        var url = 'http' + ((obj.cert != null) ? 's' : '') + '://' + ip + ':' + obj.port + '/' + name;
        console.log(url);

        /*
        obj.lastBootImageArgs = {
            args: btoa(
                makeUefiBootParam(1, url) +                   // OCR_EFI_NETWORK_DEVICE_PATH (1)
                makeUefiBootParam(3, url.length, 2) +         // OCR_EFI_DEVICE_PATH_LEN (3)
                makeUefiBootParam(20, 0, 1) +                 // OCR_HTTPS_CERT_SYNC_ROOT_CA (20) (0 = false)
                makeUefiBootParam(21, obj.certCommonName) +   // OCR_HTTPS_CERT_SERVER_NAME (21)
                makeUefiBootParam(22, 1, 2) +                 // OCR_HTTPS_SERVER_NAME_VERIFY_METHOD (22) (1 = FullName)
                makeUefiBootParam(23, obj.certHashRaw) +      // OCR_HTTPS_SERVER_CERT_HASH_SHA256 (23)
                makeUefiBootParam(30, 0, 2)),                 // OCR_HTTPS_REQUEST_TIMEOUT (30) (0 seconds = default)
            argscount: 7
        };

        obj.lastBootImageArgs = {
            args: btoa(
                makeUefiBootParam(1, url) +                   // OCR_EFI_NETWORK_DEVICE_PATH (1)
                makeUefiBootParam(20, 0, 1) +                 // OCR_HTTPS_CERT_SYNC_ROOT_CA (20) (0 = false)
                makeUefiBootParam(21, obj.certCommonName) +   // OCR_HTTPS_CERT_SERVER_NAME (21)
                makeUefiBootParam(22, 1, 2) +                 // OCR_HTTPS_SERVER_NAME_VERIFY_METHOD (22) (1 = FullName)
                makeUefiBootParam(23, obj.certHashRaw)),      // OCR_HTTPS_SERVER_CERT_HASH_SHA256 (23)
            argscount: 5
        };

        obj.lastBootImageArgs = {
            args: btoa(
                makeUefiBootParam(1, url) +                   // OCR_EFI_NETWORK_DEVICE_PATH (1)
                makeUefiBootParam(20, 1, 1) +                 // OCR_HTTPS_CERT_SYNC_ROOT_CA (20) (0 = false)
                makeUefiBootParam(21, obj.certCommonName) +   // OCR_HTTPS_CERT_SERVER_NAME (21)
                makeUefiBootParam(22, 1, 2)),                 // OCR_HTTPS_SERVER_NAME_VERIFY_METHOD (22) (1 = FullName)
            argscount: 4
        };
        */

        /*
        url = 'http' + ((obj.cert != null) ? 's' : '') + '://' + "DESKTOP-NTHM909.jf.intel.com" + ':' + obj.port + '/' + name;

        // This works!
        obj.lastBootImageArgs = {
            args: btoa(
                makeUefiBootParam(1, url) +                   // OCR_EFI_NETWORK_DEVICE_PATH (1)
                makeUefiBootParam(23, obj.certHashRaw) +      // OCR_HTTPS_SERVER_CERT_HASH_SHA256 (23)
                makeUefiBootParam(20, 1, 1) +                 // OCR_HTTPS_CERT_SYNC_ROOT_CA (20) (0 = false)
                makeUefiBootParam(30, 0, 2)),                 // OCR_HTTPS_REQUEST_TIMEOUT (30) (0 seconds = default)
            argscount: 4
        };
        */

        obj.lastBootImageArgs = {
            args: btoa(
                makeUefiBootParam(1, url) +                   // OCR_EFI_NETWORK_DEVICE_PATH (1)
                makeUefiBootParam(23, obj.certHashRaw) +      // OCR_HTTPS_SERVER_CERT_HASH_SHA256 (23)
                makeUefiBootParam(20, 1, 1) +                 // OCR_HTTPS_CERT_SYNC_ROOT_CA (20) (0 = false)
                makeUefiBootParam(30, 0, 2)),                 // OCR_HTTPS_REQUEST_TIMEOUT (30) (0 seconds = default)
            argscount: 4
        };

        /*
        obj.lastBootImageArgs = {
            args: btoa(
                makeUefiBootParam(1, url) +                   // OCR_EFI_NETWORK_DEVICE_PATH (1)
                makeUefiBootParam(20, 1, 1)),                 // OCR_HTTPS_CERT_SYNC_ROOT_CA (20) (0 = false)
            argscount: 2
        };
        */

        return obj.lastBootImageArgs;
    }

    return obj;
}
