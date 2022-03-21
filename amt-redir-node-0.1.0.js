/** 
* @description Intel AMT Redirection Transport Module - using Node
* @author Ylian Saint-Hilaire
* @version v0.0.1f
*/

// Construct a MeshServer object
var CreateAmtRedirect = function (module) {
    var obj = {};
    obj.m = module; // This is the inner module (Terminal or Desktop)
    module.parent = obj;
    obj.State = 0;
    obj.net = require('net');
    obj.tls = require('tls');
    obj.crypto = require('crypto');
    obj.constants = require('constants');
    obj.socket = null;
    obj.host = null;
    obj.port = 0;
    obj.user = null;
    obj.pass = null;
    obj.connectstate = 0;
    obj.protocol = module.protocol; // 1 = SOL, 2 = KVM, 3 = IDER
    obj.xtlsoptions = null;
    obj.amtaccumulator = '';
    obj.amtsequence = 1;
    obj.amtkeepalivetimer = null;
    obj.authuri = '/RedirectionService';
    obj.digestRealmMatch = null;
    obj.onStateChanged = null;
    obj.disconnectCode = 0; // 2 = BUSY, 3 = UNSUPPORTED, 256 = ERROR, 50000 = RLE16 fail, 50001 = AmtDisconnect.

    function ToIntStr(v) { return String.fromCharCode((v & 0xFF), ((v >> 8) & 0xFF), ((v >> 16) & 0xFF), ((v >> 24) & 0xFF)); }
    function ToShortStr(v) { return String.fromCharCode((v & 0xFF), ((v >> 8) & 0xFF)); }
    function arrToStr(arr) { return String.fromCharCode.apply(null, arr); }
    function randomHex(length) { var r = ''; for (var i = 0; i < length; i++) { r += 'abcdef0123456789'.charAt(Math.floor(Math.random() * 16)); } return r; }

    // Private method
    //obj.Debug = function (msg) { console.log(msg); }

    obj.Start = function (host, port, user, pass, tls, tlsFingerprint, tlsoptions) {
        obj.host = host;
        obj.port = port;
        obj.user = user;
        obj.pass = pass;
        obj.xtls = tls;
        obj.xtlsoptions = tlsoptions;
        obj.xtlsFingerprint = tlsFingerprint;
        obj.connectstate = 0;
        obj.disconnectCode = 0;

        if (obj.xtlsoptions && obj.xtlsoptions.meshServerConnect) {
            // Use the websocket wrapper to connect to MeshServer server
            obj.socket = CreateWebSocketWrapper(obj.xtlsoptions.host, obj.xtlsoptions.port, '/webrelay.ashx?user=' + encodeURIComponent(obj.xtlsoptions.username) + '&pass=' + encodeURIComponent(obj.xtlsoptions.password) + '&host=' + encodeURIComponent(obj.host) + '&p=2&tls=' + tlsFingerprint.xtls + '&tls1only=' + tlsFingerprint.xtlsMethod, obj.xtlsoptions.xtlsFingerprint);
            //obj.socket.setEncoding('binary');
            obj.socket.ondata = obj.xxOnSocketData;
            obj.socket.onclose = obj.xxOnSocketClosed;
            obj.socket.connect(obj.xxOnSocketConnected);
        } else if (tls == false) {
            obj.socket = new obj.net.Socket();
            //obj.socket.setEncoding('binary');
            obj.socket.connect(port, host, obj.xxOnSocketConnected);
            obj.socket.on('data', obj.xxOnSocketData);
            obj.socket.on('close', obj.xxOnSocketClosed);
            obj.socket.on('error', obj.xxOnSocketClosed);
        } else {
            if (obj.xtlsoptions == null) { obj.xtlsoptions = { secureProtocol: 'TLSv1_method', ciphers: 'RSA+AES:!aNULL:!MD5:!DSS', secureOptions: obj.constants.SSL_OP_NO_SSLv2 | obj.constants.SSL_OP_NO_SSLv3 | obj.constants.SSL_OP_NO_COMPRESSION | obj.constants.SSL_OP_CIPHER_SERVER_PREFERENCE, rejectUnauthorized: false }; }
            obj.socket = obj.tls.connect(port, host, obj.xtlsoptions, obj.xxOnSocketConnected);
            //obj.socket.setEncoding('binary');
            obj.socket.on('data', obj.xxOnSocketData);
            obj.socket.on('close', obj.xxOnSocketClosed);
            obj.socket.on('error', obj.xxOnSocketClosed);
        }
        obj.xxStateChange(1);
    }

    // Get the certificate of Intel AMT
    obj.getPeerCertificate = function () { if (obj.xtls == true) { return obj.socket.getPeerCertificate(); } return null; }

    obj.xxOnSocketConnected = function () {
        if (obj.socket == null) return;
        if (!obj.xtlsoptions || !obj.xtlsoptions.meshServerConnect) {
            if (obj.xtls == true) {
                obj.xtlsCertificate = obj.socket.getPeerCertificate();
                if ((obj.xtlsFingerprint != 0) && (obj.xtlsCertificate.fingerprint.split(':').join('').toLowerCase() != obj.xtlsFingerprint)) { obj.Stop(); return; }
            }
        }

        if (urlvars && urlvars['redirtrace']) { console.log('REDIR-CONNECTED'); }
        //obj.Debug('Socket Connected');
        obj.xxStateChange(2);
        if (obj.protocol == 1) obj.directSend(new Uint8Array([0x10, 0x00, 0x00, 0x00, 0x53, 0x4F, 0x4C, 0x20])); // SOL
        if (obj.protocol == 2) obj.directSend(new Uint8Array([0x10, 0x01, 0x00, 0x00, 0x4b, 0x56, 0x4d, 0x52])); // KVM
        if (obj.protocol == 3) obj.directSend(new Uint8Array([0x10, 0x00, 0x00, 0x00, 0x49, 0x44, 0x45, 0x52])); // IDER
    }
   

    obj.xxOnSocketData = function (data) {
        if (!data || obj.connectstate == -1) return;

        if (typeof(data)=='string') {data = new Buffer(data,'binary')}
        // Redirection tracing
        if (urlvars && urlvars['redirtrace']) {
            var datastr = arrToStr(new Uint8Array(data));
            console.log('REDIR-RECV(' + datastr.length + '): ' + rstr2hex(datastr));
        }

        //obj.inDataCount++;
        data = new Uint8Array(data).buffer;
        
        // KVM traffic, forward it directly.
        if ((obj.connectstate == 1) && ((obj.protocol == 2) || (obj.protocol == 3))) {
            return obj.m.ProcessBinaryData ? obj.m.ProcessBinaryData(data) : obj.m.ProcessData(arrToStr(new Uint8Array(data)));
        }

        // Append to accumulator
        if (obj.acc == null) {
            obj.acc = data;
        } else {
            var tmp = new Uint8Array(obj.acc.byteLength + data.byteLength);
            tmp.set(new Uint8Array(obj.acc), 0);
            tmp.set(new Uint8Array(data), obj.acc.byteLength);
            obj.acc = tmp.buffer;
        }

        //console.log('Redir Recv', obj.acc);
        while ((obj.acc != null) && (obj.acc.byteLength >= 1)) {
            var cmdsize = 0, accArray = new Uint8Array(obj.acc);
            switch (accArray[0]) {
                case 0x11: // StartRedirectionSessionReply (17)
                    if (accArray.byteLength < 4) return;
                    var statuscode = accArray[1];
                    switch (statuscode) {
                        case 0: // STATUS_SUCCESS
                            if (accArray.byteLength < 13) return;
                            var oemlen = accArray[12];
                            if (accArray.byteLength < 13 + oemlen) return;
                            obj.directSend(new Uint8Array([0x13, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])); // Query for available authentication
                            cmdsize = (13 + oemlen);
                            break;
                        default:
                            obj.disconnectCode = statuscode; // 2 = BUSY, 3 = UNSUPPORTED, 0xFF = ERROR.
                            obj.Stop(1);
                            break;
                    }
                    break;
                case 0x14: // AuthenticateSessionReply (20)
                    if (accArray.byteLength < 9) return;
                    var authDataLen = new DataView(obj.acc).getUint32(5, true);
                    if (accArray.byteLength < 9 + authDataLen) return;
                    var status = accArray[1], authType = accArray[4], authData = [];
                    for (i = 0; i < authDataLen; i++) { authData.push(accArray[9 + i]); }
                    var authDataBuf = new Uint8Array(obj.acc.slice(9, 9 + authDataLen));
                    cmdsize = 9 + authDataLen;
                    if (authType == 0) {
                        // ###BEGIN###{Mode-NodeWebkit}
                        if (obj.user == '*') {
                            if (authData.indexOf(2) >= 0) {
                                // Kerberos Auth
                                var ticket;
                                if (kerberos && kerberos != null) {
                                    var ticketReturn = kerberos.getTicket('HTTP' + ((obj.tls == 1)?'S':'') + '/' + ((obj.pass == '') ? (obj.host + ':' + obj.port) : obj.pass));
                                    if (ticketReturn.returnCode == 0 || ticketReturn.returnCode == 0x90312) {
                                        ticket = ticketReturn.ticket;
                                        if (process.platform.indexOf('win') >= 0) {
                                            // Clear kerberos tickets on both 32 and 64bit Windows platforms
                                            try { require('child_process').exec('%windir%\\system32\\klist purge', function (error, stdout, stderr) { if (error) { require('child_process').exec('%windir%\\sysnative\\klist purge', function (error, stdout, stderr) { if (error) { console.error('Unable to purge kerberos tickets'); } }); } }); } catch (e) { console.log(e); }
                                        }
                                    } else {
                                        console.error('Unexpected Kerberos error code: ' + ticketReturn.returnCode);
                                    }
                                }
                                if (ticket) {
                                    obj.xxSend(String.fromCharCode(0x13, 0x00, 0x00, 0x00, 0x02) + IntToStrX(ticket.length) + ticket);
                                } else {
                                    obj.Stop(2);
                                }
                            }
                            else obj.Stop(2);
                        } else {
                        // ###END###{Mode-NodeWebkit}
                            // Query
                            if (authData.indexOf(4) >= 0) {
                                // Good Digest Auth (With cnonce and all)
                                obj.xxSend(String.fromCharCode(0x13, 0x00, 0x00, 0x00, 0x04) + IntToStrX(obj.user.length + obj.authuri.length + 8) + String.fromCharCode(obj.user.length) + obj.user + String.fromCharCode(0x00, 0x00) + String.fromCharCode(obj.authuri.length) + obj.authuri + String.fromCharCode(0x00, 0x00, 0x00, 0x00));
                            }
                            /*
                            else if (authData.indexOf(3) >= 0) {
                                // Bad Digest Auth (Not sure why this is supported, cnonce is not used!)
                                obj.xxSend(String.fromCharCode(0x13, 0x00, 0x00, 0x00, 0x03) + IntToStrX(obj.user.length + obj.authuri.length + 7) + String.fromCharCode(obj.user.length) + obj.user + String.fromCharCode(0x00, 0x00) + String.fromCharCode(obj.authuri.length) + obj.authuri + String.fromCharCode(0x00, 0x00, 0x00));
                            }
                            else if (authData.indexOf(1) >= 0) {
                                // Basic Auth (Probably a good idea to not support this unless this is an old version of Intel AMT)
                                obj.xxSend(String.fromCharCode(0x13, 0x00, 0x00, 0x00, 0x01) + IntToStrX(obj.user.length + obj.pass.length + 2) + String.fromCharCode(obj.user.length) + obj.user + String.fromCharCode(obj.pass.length) + obj.pass);
                            }
                            */
                            else obj.Stop(2);
                        // ###BEGIN###{Mode-NodeWebkit}
                        }
                        // ###END###{Mode-NodeWebkit}
                    } else if (((authType == 3) || (authType == 4)) && (status == 1)) {
                        var curptr = 0;

                        // Realm
                        var realmlen = authDataBuf[curptr];
                        var realm = arrToStr(new Uint8Array(authDataBuf.buffer.slice(curptr + 1, curptr + 1 + realmlen)));
                        curptr += (realmlen + 1);

                        // Nonce
                        var noncelen = authDataBuf[curptr];
                        var nonce = arrToStr(new Uint8Array(authDataBuf.buffer.slice(curptr + 1, curptr + 1 + noncelen)));
                        curptr += (noncelen + 1);

                        // QOP
                        var qoplen = 0;
                        var qop = null;
                        var cnonce = randomHex(32);
                        var snc = '00000002';
                        var extra = '';
                        if (authType == 4) {
                            qoplen = authDataBuf[curptr];
                            qop = arrToStr(new Uint8Array(authDataBuf.buffer.slice(curptr + 1, curptr + 1 + qoplen)));
                            curptr += (qoplen + 1);
                            extra = snc + ':' + cnonce + ':' + qop + ':';
                        }

                        var digest = hex_md5(hex_md5(obj.user + ':' + realm + ':' + obj.pass) + ':' + nonce + ':' + extra + hex_md5('POST:' + obj.authuri));
                        var totallen = obj.user.length + realm.length + nonce.length + obj.authuri.length + cnonce.length + snc.length + digest.length + 7;
                        if (authType == 4) totallen += (qop.length + 1);
                        var buf = String.fromCharCode(0x13, 0x00, 0x00, 0x00, authType) + IntToStrX(totallen) + String.fromCharCode(obj.user.length) + obj.user + String.fromCharCode(realm.length) + realm + String.fromCharCode(nonce.length) + nonce + String.fromCharCode(obj.authuri.length) + obj.authuri + String.fromCharCode(cnonce.length) + cnonce + String.fromCharCode(snc.length) + snc + String.fromCharCode(digest.length) + digest;
                        if (authType == 4) buf += (String.fromCharCode(qop.length) + qop);
                        obj.xxSend(buf);
                    } else if (status == 0) { // Success
                        switch (obj.protocol) {
                            case 1: {
                                // Serial-over-LAN: Send Intel AMT serial settings...
                                var MaxTxBuffer = 10000;
                                var TxTimeout = 100;
                                var TxOverflowTimeout = 0;
                                var RxTimeout = 10000;
                                var RxFlushTimeout = 100;
                                var Heartbeat = 0;//5000;
                                obj.xxSend(String.fromCharCode(0x20, 0x00, 0x00, 0x00) + IntToStrX(obj.amtsequence++) + ShortToStrX(MaxTxBuffer) + ShortToStrX(TxTimeout) + ShortToStrX(TxOverflowTimeout) + ShortToStrX(RxTimeout) + ShortToStrX(RxFlushTimeout) + ShortToStrX(Heartbeat) + IntToStrX(0));
                                break;
                            }
                            case 2: {
                                // Remote Desktop: Send traffic directly...
                                obj.directSend(new Uint8Array([0x40, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]));
                                break;
                            }
                            case 3: {
                                // Remote IDER: Send traffic directly...
                                obj.connectstate = 1;
                                obj.xxStateChange(3);
                                break;
                            }
                        }
                    } else obj.Stop(3);
                    break;
                case 0x21: // Response to settings (33)
                    if (accArray.byteLength < 23) break;
                    cmdsize = 23;
                    obj.xxSend(String.fromCharCode(0x27, 0x00, 0x00, 0x00) + IntToStrX(obj.amtsequence++) + String.fromCharCode(0x00, 0x00, 0x1B, 0x00, 0x00, 0x00));
                    if (obj.protocol == 1) { obj.amtkeepalivetimer = setInterval(obj.xxSendAmtKeepAlive, 2000); }
                    obj.connectstate = 1;
                    obj.xxStateChange(3);
                    break;
                case 0x29: // Serial Settings (41)
                    if (accArray.byteLength < 10) break;
                    cmdsize = 10;
                    break;
                case 0x2A: // Incoming display data (42)
                    if (accArray.byteLength < 10) break;
                    var cs = (10 + (accArray[9] << 8) + accArray[8]);
                    if (accArray.byteLength < cs) break;
                    if (obj.m.ProcessBinaryData) { obj.m.ProcessBinaryData(obj.acc.slice(10, cs)); } else { obj.m.ProcessData(arrToStr(new Uint8Array(obj.acc.slice(10, cs)))); }
                    cmdsize = cs;
                    break;
                case 0x2B: // Keep alive message (43)
                    if (accArray.byteLength < 8) break;
                    cmdsize = 8;
                    break;
                case 0x41:
                    if (accArray.byteLength < 8) break;
                    obj.connectstate = 1;
                    obj.m.Start();
                    // KVM traffic, forward rest of accumulator directly.
                    if (accArray.byteLength > 8) { if (obj.m.ProcessBinaryData) { obj.m.ProcessBinaryData(obj.acc.slice(8)); } else { obj.m.ProcessData(arrToStr(new Uint8Array(obj.acc.slice(8)))); } }
                    cmdsize = accArray.byteLength;
                    break;
                case 0xF0:
                    // console.log('Session is being recorded');
                    obj.serverIsRecording = true;
                    cmdsize = 1;
                    break;
                default:
                    console.log('Unknown Intel AMT command: ' + accArray[0] + ' acclen=' + accArray.byteLength);
                    obj.Stop(4);
                    return;
            }
            if (cmdsize == 0) return;
            if (cmdsize != obj.acc.byteLength) { obj.acc = obj.acc.slice(cmdsize); } else { obj.acc = null; }
        }
    }

    obj.directSend = function (arr) {
        // Redirection tracing
        if (urlvars && urlvars['redirtrace']) {
            var datastr = arrToStr(new Uint8Array(arr));
            console.log('REDIR-DSEND(' + datastr.length + '): ' + rstr2hex(datastr));
        }

        try { obj.socket.write(new Buffer(arr)); } catch (ex) { console.log(ex); }
    }

    obj.xxSend = function (x) {
        if (urlvars && urlvars['redirtrace']) { console.log('REDIR-SEND(' + x.length + '): ' + rstr2hex(x)); }
        //obj.Debug('Send(' + x.length + '): ' + rstr2hex(x));
        obj.socket.write(new Buffer(x, 'binary'));
    }

    obj.Send = obj.send = function (x) {
        if (obj.socket == null || obj.connectstate != 1) return;
        if (obj.protocol == 1) { obj.xxSend(String.fromCharCode(0x28, 0x00, 0x00, 0x00) + ToIntStr(obj.amtsequence++) + ToShortStr(x.length) + x); } else { obj.xxSend(x); }
    }

    obj.xxSendAmtKeepAlive = function () {
        if (obj.socket == null) return;
        obj.xxSend(String.fromCharCode(0x2B, 0x00, 0x00, 0x00) + ToIntStr(obj.amtsequence++));
    }

    obj.xxOnSocketClosed = function () {
        if (urlvars && urlvars['redirtrace']) { console.log('REDIR-CLOSED'); }
        //obj.Debug('Socket Closed');
        obj.Stop();
    }

    obj.xxStateChange = function(newstate) {
        if (obj.State == newstate) return;
        obj.State = newstate;
        obj.m.xxStateChange(obj.State);
        if (obj.onStateChanged != null) obj.onStateChanged(obj, obj.State);
    }

    obj.Stop = function () {
        if (urlvars && urlvars['redirtrace']) { console.log('REDIR-CLOSED'); }
        //obj.Debug('Socket Stopped');
        obj.xxStateChange(0);
        obj.connectstate = -1;
        obj.amtaccumulator = '';
        if (obj.socket != null) { obj.socket.destroy(); obj.socket = null; }
        if (obj.amtkeepalivetimer != null) { clearInterval(obj.amtkeepalivetimer); obj.amtkeepalivetimer = null; }
    }

    return obj;
}
