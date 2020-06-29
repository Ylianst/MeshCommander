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
        server.listen({ port: obj.port }, function (x) { obj.state = 2; console.log('WebServer listening on ' + obj.port); if (func != null) { func(); } });
    }

    // Called when a new incoming connection is made
    function onConnection(socket) {
        if (socket.remoteAddress.startsWith('::ffff:')) { socket.xremoteAddress = socket.remoteAddress.substring(7); } else { socket.xremoteAddress = socket.remoteAddress; }
        console.log('WebServer, socket connection from ' + socket.xremoteAddress + ':' + socket.remotePort);
        socket.xdata = ''; // Accumulator
        socket.on('data', function (data) {
            this.xdata += data.toString('utf8');
            console.log('WebServer, socket received data', this.xdata);
            var headersize = this.xdata.indexOf('\r\n\r\n');
            if (headersize < 0) { if (this.xdata.length > 4096) { this.close(); } return; }
            var headers = this.xdata.substring(0, headersize).split('\r\n');
            if (headers.length < 1) { this.close(); return; }
            var directives = headers[0].split(' ');
            if ((directives.length != 3) || (directives[0] != 'GET')) { this.end(); return; }
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
                        socket.xfilepath = r.file;
                        socket.xfilename = path.basename(r.file);
                        socket.xsize = fs.statSync(r.file).size;
                        socket.write('HTTP/1.1 200 OK\r\nContent-Type: application/octet-stream\r\nContent-Length: ' + socket.xsize + '\r\nConnection: close\r\n\r\n');
                        var writable = require('stream').Writable;
                        socket.progress = new writable({ write: function (chunk, encoding, flush) { this.count += chunk.length; flush(); } });
                        socket.progress.count = 0;
                        var ws = fs.createReadStream(r.file, { flags: 'r' });
                        ws.pipe(socket.progress); ws.pipe(socket);
                        obj.transfers.push(socket);

                        // Start the progress bar timer
                        if (obj.onTransfers != null) { obj.onTransfers(obj, obj.transfers); if (obj.transfersTimer == null) { obj.transfersTimer = setInterval(function () { obj.onTransfers(obj, obj.transfers); }, 500); } }
                        return;
                    }
                }
            }
            socket.write('HTTP/1.1 ' + responseCode + ' OK\r\nContent-Type: ' + responseType + '\r\nContent-Length: ' + responseData.length + '\r\nConnection: close\r\n\r\n');
            socket.write(responseData);
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
    obj.generateCertificate = function () {
        var attrs1 = [{ name: 'commonName', value: 'MeshCommanderRoot' }, { name: 'countryName', value: 'Unknown' }, { shortName: 'ST', value: 'Unknown' }, { name: 'organizationName', value: 'Unknown' }];
        var attrs2 = [{ name: 'commonName', value: 'MeshCommander.com' }, { name: 'countryName', value: 'Unknown' }, { shortName: 'ST', value: 'Unknown' }, { name: 'organizationName', value: 'Unknown' }];

        if (fs.existsSync('webroot.pem') && fs.existsSync('webroot.key')) {
            console.log('Read root from file');
            obj.rootCert = fs.readFileSync('webroot.pem').toString();
            obj.rootKey = fs.readFileSync('webroot.key').toString();
            var rootcert = forge.pki.certificateFromPem(obj.rootCert);
            var rootkeys = { privateKey: forge.pki.privateKeyFromPem(obj.rootKey) };
        } else {
            console.log('Generate root');
            // Generate a root keypair and create an X.509v3 root certificate
            var rootkeys = forge.pki.rsa.generateKeyPair(1024);
            var rootcert = forge.pki.createCertificate();
            rootcert.publicKey = rootkeys.publicKey;
            rootcert.serialNumber = '' + Math.floor((Math.random() * 100000) + 1);
            rootcert.validity.notBefore = new Date(2018, 0, 1);
            rootcert.validity.notAfter = new Date(2049, 11, 31);
            rootcert.setSubject(attrs1);
            rootcert.setIssuer(attrs1);
            rootcert.setExtensions([{ name: 'basicConstraints', cA: true }, { name: 'nsCertType', sslCA: true, emailCA: true, objCA: true }, { name: 'subjectKeyIdentifier' }]); // Root extensions
            rootcert.sign(rootkeys.privateKey, forge.md.sha256.create());
            obj.rootCert = forge.pki.certificateToPem(rootcert);
            obj.rootKey = forge.pki.privateKeyToPem(rootkeys.privateKey);
            fs.writeFileSync('webroot.pem', obj.rootCert);
            fs.writeFileSync('webroot.key', obj.rootKey);
        }

        if (fs.existsSync('webleaf.pem') && fs.existsSync('webleaf.key')) {
            console.log('Read leaf from file');
            obj.cert = fs.readFileSync('webleaf.pem').toString();
            obj.key = fs.readFileSync('webleaf.key').toString();
            var cert = forge.pki.certificateFromPem(obj.cert);
            var keys = { privateKey: forge.pki.privateKeyFromPem(obj.key) };
        } else {
            console.log('Generate leaf');
            // Generate a keypair and create an X.509v3 certificate
            var keys = forge.pki.rsa.generateKeyPair(1024);
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
            cert.setExtensions([{ name: 'basicConstraints' }, { name: 'keyUsage', keyCertSign: true, digitalSignature: true, nonRepudiation: true, keyEncipherment: true, dataEncipherment: true }, extKeyUsage, { name: 'nsCertType', server: true }, { name: 'subjectKeyIdentifier' }]);

            // Self-sign certificate
            cert.sign(rootkeys.privateKey, forge.md.sha256.create());
            obj.cert = forge.pki.certificateToPem(cert);
            obj.key = forge.pki.privateKeyToPem(keys.privateKey);
            fs.writeFileSync('webleaf.pem', obj.cert);
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

    // MC 0.8.6
    // 8680 0100 2c000000 68747470733a2f2f31302e3135312e3133372e3139383a343133352f34343131313435323237343935353831     // https://10.151.137.198:4135/4411145227495581
    // 8680 1400 01000000 00        // OCR_HTTPS_CERT_SYNC_ROOT_CA
    // 8680 1700 20000000 ac8adfe3809dc66990040fdaac53765e369c0242f2a789327b57c072d5dd2677
    // 8680 1e00 02000000 3c00      // OCR_HTTPS_REQUEST_TIMEOUT (60)

    // MC 0.8.3-alpha
    // 8680 0100 2c000000 68747470733a2f2f31302e3135312e3133372e3139383a343133352f34343131313435323237343935353831     // https://10.151.137.198:4135/4411145227495581
    // 8680 0300 02000000 2c00      // OCR_EFI_FILE_DEVICE_PATH (44)
    // 8680 1700 20000000 ac8adfe3809dc66990040fdaac53765e369c0242f2a789327b57c072d5dd2677
    // 8680 1400 01000000 00        // OCR_HTTPS_CERT_SYNC_ROOT_CA
    // 8680 1e00 02000000 0000      // OCR_HTTPS_REQUEST_TIMEOUT

    // Returns a UEFI boot parameter in binary
    function makeUefiBootParam(type, data, len) {
        if (typeof data == 'number') { if (len == 1) { data = String.fromCharCode(data & 0xFF); } if (len == 2) { data = ShortToStrX(data); } if (len == 4) { data = IntToStrX(data); } }
        return ShortToStrX(0x8086) + ShortToStrX(type) + IntToStrX(data.length) + data;
    }

    // Setup UEFI boot image
    obj.setupBootImage = function(filePath, ip) {
        if (fs.existsSync(filePath) == false) return null;
        var name = ('' + Math.random()).substring(2);
        obj.responses['/' + name] = { type: 'application/octet-stream', file: filePath };
        var url = 'http' + ((obj.cert != null) ? 's' : '') + '://' + ip + ':' + obj.port + '/' + name;
        console.log(url);

        /*
        obj.lastBootImageArgs = {
            args: btoa(
                makeUefiBootParam(1, url) +                   // OCR_EFI_NETWORK_DEVICE_PATH (1)
                makeUefiBootParam(3, url.length, 2) +         // OCR_EFI_DEVICE_PATH_LEN (3)
                makeUefiBootParam(20, 0, 1) +                 // OCR_HTTPS_CERT_SYNC_ROOT_CA (20) (0 = false)
                makeUefiBootParam(21, "MeshCommander.com") +  // OCR_HTTPS_CERT_SERVER_NAME (21)
                makeUefiBootParam(22, 1, 2) +                 // OCR_HTTPS_SERVER_NAME_VERIFY_METHOD (22) (1 = FullName)
                makeUefiBootParam(23, obj.certHashRaw) +      // OCR_HTTPS_SERVER_CERT_HASH_SHA256 (23)
                makeUefiBootParam(30, 0, 2)),                 // OCR_HTTPS_REQUEST_TIMEOUT (30) (0 seconds = default)
            argscount: 7
        };

        obj.lastBootImageArgs = {
            args: btoa(
                makeUefiBootParam(1, url) +                   // OCR_EFI_NETWORK_DEVICE_PATH (1)
                makeUefiBootParam(20, 0, 1) +                 // OCR_HTTPS_CERT_SYNC_ROOT_CA (20) (0 = false)
                makeUefiBootParam(21, "MeshCommander.com") +  // OCR_HTTPS_CERT_SERVER_NAME (21)
                makeUefiBootParam(22, 1, 2) +                 // OCR_HTTPS_SERVER_NAME_VERIFY_METHOD (22) (1 = FullName)
                makeUefiBootParam(23, obj.certHashRaw)),      // OCR_HTTPS_SERVER_CERT_HASH_SHA256 (23)
            argscount: 5
        };
        */

        obj.lastBootImageArgs = {
            args: btoa(
                makeUefiBootParam(1, url) +                   // OCR_EFI_NETWORK_DEVICE_PATH (1)
                makeUefiBootParam(20, 1, 1) +                 // OCR_HTTPS_CERT_SYNC_ROOT_CA (20) (0 = false)
                makeUefiBootParam(21, "MeshCommander.com") +  // OCR_HTTPS_CERT_SERVER_NAME (21)
                makeUefiBootParam(22, 1, 2)),                 // OCR_HTTPS_SERVER_NAME_VERIFY_METHOD (22) (1 = FullName)
            argscount: 4
        };

        return obj.lastBootImageArgs;
    }

    return obj;
}