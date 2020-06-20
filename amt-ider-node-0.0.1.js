/**
* @description Meshcentral
* @author Ylian Saint-Hilaire
* @version v0.0.1
*/

function CreateIMRSDKWrapper() {
    var obj = {};
    var _IMRSDK;
    var _ImrSdkVersion;
    var _ref = require('ref');
    var _ffi = require('ffi');
    var _struct = require('ref-struct');
    var _arrayType = require('ref-array');
    obj.pendingData = {};

    // ###BEGIN###{IDERDebug}
    var logFile = null
    if (urlvars && urlvars['iderlog']) { logFile = require('fs').createWriteStream(urlvars['iderlog'], { flags: 'w' }); }
    // ###END###{IDERDebug}

    // Callback from the native lib back into js (StdCall)
    var uintPtr = _ref.refType('uint');
    var OpenHandlerCallBack = _ffi.Callback('int', ['uint', 'uint'], _ffi.FFI_STDCALL, function (clientID, conID) { obj.conID = conID; obj.pendingData[conID] = ''; return 0; });
    var CloseHandlerCallBack = _ffi.Callback('int', ['uint'], _ffi.FFI_STDCALL, function (conID) { obj.pendingData[conID] = null; return 0; });
    var ReceiveHandlerCallBack = _ffi.Callback('int', ['pointer', uintPtr, 'uint'], _ffi.FFI_STDCALL, function (bufferPtr, lengthPtr, conID) {
        try {
            if (obj.pendingData[conID] == null) {
                lengthPtr.writeUInt32LE(0, 0); // Send a close
            } else {
                var bufferLen = lengthPtr.readUInt32LE(0), buffer = _ref.reinterpret(bufferPtr, bufferLen);
                lengthPtr.writeUInt32LE(obj.pendingData[conID].length, 0);
                for (var i = 0; i < obj.pendingData[conID].length; i++) { buffer[i] = obj.pendingData[conID].charCodeAt(i); }
                // ###BEGIN###{IDERDebug}
                //console.log('ReceiveHandlerCallBack(conID: ' + conID + ', Len: ' + obj.pendingData[conID].length + ')');
                if (logFile != null) { logFile.write('IDERRECV: ' + rstr2hex(obj.pendingData[conID]) + '\r\n'); }
                // ###END###{IDERDebug}
                obj.pendingData[conID] = '';
            }
        } catch (e) { console.log(e); }
        return 0;
    });
    var SendHandlerCallBack = _ffi.Callback('int', ['pointer', 'uint', 'uint'], _ffi.FFI_STDCALL, function (ptr, length, conID) {
        try {
            if (obj.client == null) return;
            var buffer = _ref.reinterpret(ptr, length), str = '';
            for (var i = 0; i < length; i++) { str += String.fromCharCode(buffer[i]); }
            // ###BEGIN###{IDERDebug}
            //console.log('SendHandlerCallBack(conID: ' + conID + ', Len: ' + length + ')');
            if (logFile != null) { logFile.write('IDERSEND: ' + rstr2hex(str) + '\r\n'); }
            // ###END###{IDERDebug}
            obj.client.write(str, 'binary');
        } catch (e) { console.log(e); }
        return 0;
    });

    var _IMRVersion = _struct({ 'major': 'ushort', 'minor': 'ushort' });
    var _IMRVersionPtr = _ref.refType(_IMRVersion);
    var _IMRClientInfo = _struct({ 'type': 'int', 'ip': _arrayType('char', 128), 'guid': _arrayType('char', 16)});
    var _IMRClientInfoPtr = _ref.refType(_IMRClientInfo);
    var _ProxySettings = _struct({ 'type': 'int', 'server': _arrayType('char', 128), 'port': 'int', 'user': _arrayType('char', 128), 'pass': _arrayType('char', 128) });
    var _TCPSessionParams = _struct({ 'user': _arrayType('char', 128), 'pass': _arrayType('char', 128) });
    var _TCPSessionParamsPtr = _ref.refType(_TCPSessionParams);
    var _TCPSessionParamsEx = _struct({ 'version': 'int', 'user': _arrayType('char', 128), 'pass': _arrayType('char', 128), 'proxy': _ProxySettings });
    var _TCPSessionParamsExPtr = _ref.refType(_TCPSessionParamsEx);
    var _TCPSessionParamsEx2 = _struct({ 'version': 'int', 'user': _arrayType('char', 128), 'pass': _arrayType('char', 128), 'domain': _arrayType('char', 254), 'proxy': _ProxySettings });
    var _TCPSessionParamsEx2Ptr = _ref.refType(_TCPSessionParamsEx2);
    var _FeaturesSupported = _struct({ 'ider_dev_pri': 'int', 'ider_dev_sec': 'int', 'reserved': _arrayType('char', 30) });
    var _FeaturesSupportedPtr = _ref.refType(_FeaturesSupported);
    var _IDERTout = _struct({ 'rx_timeout': 'ushort', 'tx_timeout': 'ushort', 'hb_timeout': 'ushort' });
    var _IDERToutPtr = _ref.refType(_IDERTout);
    var _IDERStatistics = _struct({
        'error_state': 'int',
        'data_transfer': 'int',
        'num_reopen': 'ushort',
        'num_error': 'int',
        'num_reset': 'int',
        'last_cmd_length': 'int',
        'data_sent': 'int',
        'data_received': 'int',
        'packets_sent': 'int',
        'packets_received': 'int'
    });
    var _IDERStatisticsPtr = _ref.refType(_IDERStatistics);
    var _IDERDeviceState = _struct({ 'pri_default': 'int', 'pri_current': 'int', 'sec_default': 'int', 'sec_current': 'int' });
    var _IDERDeviceStatePtr = _ref.refType(_IDERDeviceState);
    var _IDERDeviceCmd = _struct({ 'pri_op': 'int', 'pri_timing': 'int', 'sec_op': 'int', 'sec_timing': 'int' });
    var _IDERDeviceCmdPtr = _ref.refType(_IDERDeviceCmd);
    var _IDERDeviceResult = _struct({ 'pri_res': 'int', 'sec_res': 'int' });
    var _IDERDeviceResultPtr = _ref.refType(_IDERDeviceResult);
    var _SockCallBacks = _struct({ 'OpenHandler': 'pointer', 'CloseHandler': 'pointer', 'ReceiveHandler': 'pointer', 'SendHandler': 'pointer' });
    var _SockCallBacksPtr = _ref.refType(_SockCallBacks);
    var _intPtr = _ref.refType('int');

    function _Setup(lib) {
        try {
            _IMRSDK = _ffi.Library(lib, {
                'IMR_Init': ['uint', [_IMRVersionPtr, 'string']],                                                                   // IMRResult IMR_Init(IMRVersion *version, char *ini_file);
                'IMR_InitEx': ['uint', [_IMRVersionPtr, 'string', _SockCallBacksPtr]],                                              // IMRResult IMR_Init(IMRVersion *version, char *ini_file, void *funcPtrs);
                'IMR_ReadyReadSock': ['uint', ['uint']],                                                                            // IMRResult IMR_ReadyReadSock(uint conid);
                'IMR_Close': ['uint', []],                                                                                          // IMRResult IMR_Close();
                'IMR_GetErrorStringLen': ['uint', ['uint', _intPtr]],                                                               // IMRResult IMR_GetErrorStringLen(IMRResult, int * str_len);
                'IMR_GetErrorString': ['uint', ['uint', 'pointer']],                                                                // IMRResult IMR_GetErrorString(IMRResult, char * str);
                'IMR_SetCertificateInfo': ['uint', ['string', 'string', 'string']],                                                 // IMRResult IMR_SetCertificateInfo(const char *root_cert, const char *private_cert, const char *cert_pass);
                'IMR_SetClientCertificate': ['uint', ['string']],                                                                   // IMRResult IMR_SetClientCertificate(const char *common_name);
                'IMR_AddClient': ['uint', ['int', 'string', 'pointer', _intPtr]],                                                   // IMRResult IMR_AddClient(ClientType new_client_type, char * client_ip, GUIDType client_guid, ClientID * new_client_id);
                'IMR_RemoveClient': ['uint', ['int']],                                                                              // IMRResult IMR_RemoveClient(ClientID client_id);
                'IMR_RemoveAllClients': ['uint', []],                                                                               // IMRResult IMR_RemoveAllClients();
                'IMR_GetAllClients': ['uint', [_arrayType('int'), _intPtr]],                                                        // IMRResult IMR_GetAllClients(ClientID * client_list, int * client_list_size);
                'IMR_GetClientInfo': ['uint', ['int', _IMRClientInfoPtr]],                                                          // IMRResult IMR_GetClientInfo(ClientID client_id, ClientInfo *);
                'IMR_IDEROpenTCPSession': ['uint', ['int', _TCPSessionParamsPtr, _IDERToutPtr, 'string', 'string']],                // IMRResult IMR_IDEROpenTCPSession(ClientID client_id, TCPSessionParams * params, IDERTout * touts, char * drive0, char * drive1);
                'IMR_IDEROpenTCPSessionEx': ['uint', ['int', _TCPSessionParamsExPtr, _IDERToutPtr, 'string', 'string']],            // IMRResult IMR_IDEROpenTCPSessionEx(ClientID client_id, TCPSessionParamsEx * params, IDERTout * touts, char * drive0, char * drive1);
                'IMR_IDEROpenTCPSessionEx2': ['uint', ['int', _TCPSessionParamsEx2Ptr, _IDERToutPtr, 'string', 'string']],          // IMRResult IMR_IDEROpenTCPSessionEx2(ClientID client_id, TCPSessionParamsEx2 * params, IDERTout * touts, char * drive0, char * drive1);
                'IMR_IDERCloseSession': ['uint', ['int']],                                                                          // IMRResult IMR_IDERCloseSession(ClientID client_id);
                'IMR_IDERClientFeatureSupported' : ['uint', ['int', _FeaturesSupportedPtr]],                                        // IMRResult IMR_IDERClientFeatureSupported(ClientID client_id, FeaturesSupported * supported);
                'IMR_IDERGetDeviceState' : ['uint', ['int', _IDERDeviceStatePtr]],                                                  // IMRResult IMR_IDERGetDeviceState(ClientID client_id, IDERDeviceState * state);
                'IMR_IDERSetDeviceState' : ['uint', ['int', _IDERDeviceCmdPtr, _IDERDeviceResultPtr]],                              // IMRResult IMR_IDERSetDeviceState(ClientID client_id, IDERDeviceCmd * cmd, IDERDeviceResult * result);
                'IMR_IDERGetSessionStatistics': ['uint', ['int', _IDERStatisticsPtr]],                                              // IMRResult IMR_IDERGetSessionStatistics(ClientID  client_id, IDERStatistics * stat);
                'IMR_SetOpt': ['uint', ['int', 'string', 'string', 'int']],                                                         // IMRResult IMR_SetOpt(/*IN*/ClientID id, /*IN*/int optname, /*IN*/ const char *optval, /*IN*/ int optlen);
                'IMR_GetOpt': ['uint', ['int', 'string', 'pointer', _intPtr]],                                                      // IMRResult IMR_GetOpt(/*IN*/ClientID id, /*IN*/int optname, /*OUT*/ char *optval, /*OUT*/ int* optlen);
            });
        } catch (e) { return false; }
        return true;
    }
    
    // Try to link to both 32bit and 64bit IMRSDK.dll's
    if (_Setup('imrsdk') == false) { if (_Setup('imrsdk_x64') == false) { return null; } }

    // IMR_Init
    obj.Init = function () {
        var version = new _IMRVersion();
        var error = _IMRSDK.IMR_Init(version.ref(), 'imrsdk.ini');
        if (error == 4) return _ImrSdkVersion; // If already initialized, return previous version information.
        if (error != 0) { throw obj.GetErrorString(error); }
        _ImrSdkVersion = { major: version.major, minor: version.minor };
        return _ImrSdkVersion;
    }

    // IMR_InitEx
    obj.InitEx = function (client) {
        var version = new _IMRVersion();
        var callbacks = new _SockCallBacks();
        callbacks.OpenHandler = OpenHandlerCallBack;
        callbacks.CloseHandler = CloseHandlerCallBack;
        callbacks.ReceiveHandler = ReceiveHandlerCallBack;
        callbacks.SendHandler = SendHandlerCallBack;
        obj.client = client;

        var error = _IMRSDK.IMR_InitEx(version.ref(), 'imrsdk.ini', callbacks.ref());
        if (error == 4) return _ImrSdkVersion; // If already initialized, return previous version information.
        if (error != 0) { throw obj.GetErrorString(error); }
        _ImrSdkVersion = { major: version.major, minor: version.minor };
        return _ImrSdkVersion;
    }
    
    // IMR_ReadyReadSock
    obj.ReadyReadSock = function (connid, func) { _IMRSDK.IMR_ReadyReadSock.async(connid, func); }

    // IMR_Close
    obj.Close = function (func) { _IMRSDK.IMR_Close.async(func); }

    // IMR_GetErrorString
    obj.GetErrorString = function (v) {
        var errorStringLen = _ref.alloc('int');
        var error = _IMRSDK.IMR_GetErrorStringLen(v, errorStringLen); if (error != 0) return 'Unknown IMRSDK Error ' + v;
        var errorStringLenEx = errorStringLen.deref();
        var errorString = new Buffer(errorStringLenEx);
        error = _IMRSDK.IMR_GetErrorString(v, errorString); if (error != 0) return 'Unknown IMRSDK Error ' + v;
        //console.log('IMRSDK ' + errorString.toString().substring(0, errorStringLenEx));
        return 'IMRSDK ' + errorString.toString().substring(0, errorStringLenEx);
    }
    
    // IMR_SetCertificateInfo
    obj.SetCertificateInfo = function (root_cert, private_cert, cert_pass) {
        var error = _IMRSDK.IMR_SetCertificateInfo(root_cert, private_cert, cert_pass); if (error != 0) { throw obj.GetErrorString(error); }
    }
    
    // IMR_SetClientCertificate
    obj.SetClientCertificate = function (common_name) {
        var error = _IMRSDK.IMR_SetClientCertificate(common_name); if (error != 0) { throw obj.GetErrorString(error); }
    }
    
    // IMR_AddClient
    // Type: 1=TCP, 2=TLS
    obj.AddClient = function (type, ip) {
        var guid = new Buffer(16);
        for (var i = 0; i < 16; i++) { guid[i] = Math.floor(Math.random() * 255); }
        var clientid = _ref.alloc('int');
        var error = _IMRSDK.IMR_AddClient(type, ip, guid, clientid); if (error != 0) { throw obj.GetErrorString(error); }
        return clientid.deref();
    }
    
    // IMR_RemoveClient
    obj.RemoveClient = function (client_id) {
        var error = _IMRSDK.IMR_RemoveClient(client_id); if (error != 0) { throw obj.GetErrorString(error); }
    }
    
    // IMR_RemoveAllClients
    obj.RemoveAllClients = function () {
        var error = _IMRSDK.IMR_RemoveAllClients(); if (error != 0) { throw obj.GetErrorString(error); }
    }
    
    // IMR_GetAllClients
    obj.GetAllClients = function () {
        var clientListLength = _ref.alloc('int');
        var error = _IMRSDK.IMR_GetAllClients(null, clientListLength); if (error != 0) { throw obj.GetErrorString(error); }
        var clientListLengthEx = clientListLength.deref();
        var IntArray = _arrayType(_ref.types.int)
        var buf = new Buffer(4 * clientListLengthEx);
        var error = _IMRSDK.IMR_GetAllClients(buf, clientListLength); if (error != 0) { throw obj.GetErrorString(error); }
        clientListLengthEx = clientListLength.deref();
        var array = IntArray.untilZeros(buf)
        var clientids = [];
        for (var i = 0; i < clientListLengthEx; i++) { clientids.push(array[i]); }
        return clientids;
    }

    // IMR_GetClientInfo
    obj.GetClientInfo = function (client_id) {
        var client = new obj.IMRClientInfo();
        var error = _IMRSDK.IMR_GetClientInfo(client_id, client.ref()); if (error != 0) { throw obj.GetErrorString(error); }
        var ip = '', i = 0;
        while (client.ip[i] != 0) { ip += String.fromCharCode(client.ip[i++]); }
        return { type: client.type, ip: ip };
    }

    // IMR_IDEROpenTCPSession
    obj.IDEROpenTCPSessionAsync = function (client_id, user, pass, driveimg, driveiso, func) {
        //console.log('IDEROpenTCPSessionAsync', client_id, user, pass, driveimg, driveiso);
        // Setup parameters
        var params = new _TCPSessionParams();
        var user2 = obj.decode_utf8(user);
        var pass2 = obj.decode_utf8(pass);
        for (var i = 0; i < 128; i++) { params.user[i] = 0; }
        for (var i = 0; i < user2.length; i++) { params.user[i] = user2.charCodeAt(i); }
        for (var i = 0; i < 128; i++) { params.pass[i] = 0; }
        for (var i = 0; i < pass2.length; i++) { params.pass[i] = pass2.charCodeAt(i); }

        // Setup 
        var IDERTout = new _IDERTout();
        IDERTout.rx_timeout = 30000;    // Default is 10000
        IDERTout.tx_timeout = 0;        // Default is 0
        IDERTout.hb_timeout = 20000;    // Default is 5000

        // Make the call
        _IMRSDK.IMR_IDEROpenTCPSession.async(client_id, params.ref(), IDERTout.ref(), driveimg, driveiso, function (x, error) {
            if (error == 38) { return error; } // User consent required
            //if (error != 0) { throw obj.GetErrorString(error); }
            if (func != null) { func(error); }
        });
    }

    // IMR_IDERCloseSession
    obj.IDERCloseSessionAsync = function (client_id, func) {
        //console.log('IDERCloseSessionAsync', client_id);
        _IMRSDK.IMR_IDERCloseSession.async(client_id, func);
    }
    
    // IMR_IDERClientFeatureSupported
    obj.IDERClientFeatureSupported = function (client_id) {
        var features = new _FeaturesSupported();
        var error = _IMRSDK.IMR_IDERClientFeatureSupported(client_id, features.ref()); if (error != 0) { throw obj.GetErrorString(error); }
        return { ider_dev_pri: features.ider_dev_pri, ider_dev_sec: features.ider_dev_sec }
    }
    
    // IMR_IDERGetDeviceState
    obj.IDERGetDeviceState = function (client_id) {
        var state = new _IDERDeviceState();
        var error = _IMRSDK.IMR_IDERGetDeviceState(client_id, state.ref()); if (error != 0) { throw obj.GetErrorString(error); }
        return { pri_default: state.pri_default, pri_current: state.pri_current, sec_default: state.sec_default, sec_current: state.sec_current }
    }

    // IMR_IDERSetDeviceState Async
    obj.IDERSetDeviceStateAsync = function (client_id, pri_op, pri_timing, sec_op, sec_timing, func) {
        var cmd = new _IDERDeviceCmd();
        cmd.pri_op = pri_op;
        cmd.pri_timing = pri_timing;
        cmd.sec_op = sec_op;
        cmd.sec_timing = sec_timing;
        var result = new _IDERDeviceResult();
        _IMRSDK.IMR_IDERSetDeviceState.async(client_id, cmd.ref(), result.ref(), function (x, error) {
            if (func != null) func(error, { pri_res: result.pri_res, sec_res: result.sec_res });
        });
    }

    // IMR_IDERGetSessionStatistics
    obj.IDERGetSessionStatistics = function (client_id) {
        var stats = new _IDERStatistics();
        var error = _IMRSDK.IMR_IDERGetSessionStatistics(client_id, stats.ref()); if (error != 0) { throw obj.GetErrorString(error); }
        return { error_state: stats.error_state, data_transfer: stats.data_transfer, num_reopen: stats.num_reopen, num_error: stats.num_error, num_reset: stats.num_reset, last_cmd_length: stats.last_cmd_length, data_sent: stats.data_sent, data_received: stats.data_received, packets_sent: stats.packets_sent, packets_received: stats.packets_received };
    }
    
    // IMR_SetOpt
    obj.SetOpt = function (client_id, optname, optval) {
        var error = _IMRSDK.IMR_SetOpt(client_id, optname, optval, optval.length); if (error != 0) { throw obj.GetErrorString(error); }
    }
    
    // IMR_GetOpt
    obj.GetOpt = function (client_id, optname) {
        var len = _ref.alloc('int');
        var error = _IMRSDK.IMR_GetOpt(client_id, optname, null, len); if (error != 0) { throw obj.GetErrorString(error); }
        var buf = new Buffer(len.deref() + 1);
        var error = _IMRSDK.IMR_GetOpt(client_id, optname, buf, len); if (error != 0) { throw obj.GetErrorString(error); }
        // console.log(buf);
        return buf; // TODO: Return something correct after testing this call
    }

    // UTF-8 encoding & decoding functions
    obj.encode_utf8 = function (s) { return unescape(encodeURIComponent(s)); }
    obj.decode_utf8 = function (s) { return decodeURIComponent(escape(s)); }

    return obj;
}

globalIderPendingCalls = 0;
globalIderWrapper = null;
globalIderClientId = null;

// Construct a Intel AMT IDER object
var CreateAmtRemoteIderIMR = function () {
    if (globalIderPendingCalls != 0) { console.log('Incomplete IDER cleanup (A, ' + globalIderPendingCalls + ').'); return null; } // IDER is not ready.
    var _net = require('net');
    var _tls = require('tls');

    var obj = {};
    obj.onStateChanged = null;
    obj.state = 0;

    obj.m = {};
    obj.m.protocol = 3; // IDER
    obj.m.state = 0;
    obj.m.bytesToAmt = 0;
    obj.m.bytesFromAmt = 0;
    obj.m.imrsdk = null;
    obj.receivedCount = 0;

    // Private method
    obj.StateChange = function (newstate) { if (obj.state != newstate) { obj.state = newstate; obj.onStateChanged(obj, obj.state); } }

    obj.m.Start = function (host, port, user, pass, tls, wsmanCert, tlsOptions) {
        obj.constants = require('constants');
        obj.m.host = host;
        obj.m.port = port;
        obj.m.user = user;
        obj.m.pass = pass;
        obj.m.tls = tls;
        obj.m.xtlsoptions = tlsOptions;
        obj.m.wsmanCert = wsmanCert;
        obj.m.bytesToAmt = 0;
        obj.m.bytesFromAmt = 0;

        if (obj.m.onDialogPrompt) {
            if (require('os').platform() == 'win32') {
                obj.m.onDialogPrompt(obj.m, { 'html': '<br>' + "Select a CDROM and Floppy disk image to start the disk redirection." + '<br><br><br><div style=height:26px;margin-bottom:6px><select style=float:right;width:300px id=storagesourceoption onchange=onIderSourceChange()><option value=0 selected>' + "ISO & IMG from file" + '</option><option value=1>' + "ISO from drive, IMG from file" + '</option><option value=2>' + "ISO from file, IMG from drive" + '</option><option value=3>' + "ISO & IMG from drive" + '</option></select><div>' + "Source" + '</div></div><div style=height:20px><input type=file id=iderisofile accept=.iso style=float:right;width:300px><select style=float:right;width:300px;display:none id=iderisodrive><option>D:</option><option>E:</option><option>F:</option><option>G:</option><option>H:</option><option>I:</option></select><div>' + ".ISO file" + '</div></div><br><div style=height:20px><input type=file id=iderimgfile accept=.img style=float:right;width:300px><select style=float:right;width:300px;display:none id=iderimgdrive><option>A:</option><option>B:</option></select><div>' + ".IMG file" + '</div></div><br /><div style=height:26px><select style=float:right;width:300px id=storageserveroption><option value=0>' + "On Reset" + '</option><option value=1 selected>' + "Gracefully" + '</option><option value=2>' + "Immediately" + '</option></select><div>' + "Start" + '</div></div>' });
            } else {
                obj.m.onDialogPrompt(obj.m, { 'html': '<br>' + "Select a CDROM and Floppy disk image to start the disk redirection." + '<br><br><br><div style=height:20px><input type=file id=iderisofile accept=.iso style=float:right;width:300px><div>.ISO file</div></div><br><div style=height:20px><input type=file id=iderimgfile accept=.img style=float:right;width:300px><div>' + ".IMG file" + '</div></div><br /><div style=height:26px><select style=float:right;width:300px id=storageserveroption><option value=0>' + "On Reset" + '</option><option value=1 selected>' + "Gracefully" + '</option><option value=2>' + "Immediately" + '</option></select><div>' + "Start" + '</div></div>' });
            }
        }
    }

    obj.m.Stop = function () {
        if (obj.m.client != null) {
            //console.log('obj.m.Stop - client');
            try { obj.m.client.destroy(); } catch (e) { console.log(e); }
            delete obj.m.client;
        }
        if (obj.m.imrsdk) {
            //console.log('obj.m.Stop - imrsdk', obj.m.clientid);
            try
            {
                if (obj.m.clientid !== undefined) {
                    try { obj.m.imrsdk.IDERCloseSessionAsync(obj.m.clientid, function (error) { console.log('IDERCloseSessionAsync-Response', error); }); } catch (e) { console.log(e); }
                    //try { obj.m.imrsdk.RemoveClient(obj.m.clientid); } catch (e) { console.log(e); }
                    //delete obj.m.clientid;
                }
                //obj.m.imrsdk.Close(function (error) { });
            } catch (e) { }
            delete obj.m.imrsdk;
        }
        obj.StateChange(0);
    }

    obj.m.Update = function () {
        if ((obj.m.imrsdk != undefined) && (obj.m.clientid !== undefined)) {
            try {
                var stats = obj.m.imrsdk.IDERGetSessionStatistics(obj.m.clientid);
                obj.m.bytesToAmt = stats.data_sent;
                obj.m.bytesFromAmt = stats.data_received;
            } catch (e) {
                obj.m.bytesToAmt = -1;
                obj.m.bytesFromAmt = -1;
            }
        } else {
            obj.m.bytesToAmt = 0;
            obj.m.bytesFromAmt = 0;
        }
    }

    obj.m.dialogPrompt = function (userConsentFunc) {
        try {
            obj.m.Stop();
            if (Q('storageserveroption')) {
                var sel = 0;
                if (require('os').platform() == 'win32') { sel = Q('storagesourceoption').value; }
                if ((sel & 1) == 0) {
                    var x = Q('iderisofile');
                    if (!x || x.files.length != 1) { obj.m.isopath = 'empty.iso'; } else { obj.m.isopath = x.files[0].path; }
                } else {
                    obj.m.isopath = Q('iderisodrive').value;
                }
                if ((sel & 2) == 0) {
                    var x = Q('iderimgfile');
                    if (!x || x.files.length != 1) { obj.m.imgpath = 'empty.img'; } else { obj.m.imgpath = x.files[0].path; }
                } else {
                    obj.m.imgpath = Q('iderimgdrive').value;
                }
                obj.m.startoption = Q('storageserveroption').value;
                startIderSession(userConsentFunc);
            }
        } catch (e) {
            //console.log(e);
            obj.m.onDialogPrompt(obj.m, { 'html': e }, 1);
        }
    }

    function startIderSession(userConsentFunc) {
        if (globalIderPendingCalls != 0) { console.log('Incomplete IDER cleanup (B, ' + globalIderPendingCalls + ').'); return; }
        try {
            //console.log('IDER-Start');
            if (obj.m.xtlsoptions && obj.m.xtlsoptions.meshServerConnect) {
                // Open thru MeshCentral websocket wrapper
                obj.m.client = CreateWebSocketWrapper(obj.m.xtlsoptions.host, obj.m.xtlsoptions.port, '/webrelay.ashx?user=' + encodeURIComponent(obj.m.xtlsoptions.username) + '&pass=' + encodeURIComponent(obj.m.xtlsoptions.password) + '&host=' + encodeURIComponent(obj.m.host) + '&p=2', obj.m.xtlsoptions.xtlsFingerprint);
                obj.m.client.connect(function () {
                    //console.log('IDER Connected WS, ' + obj.m.xtlsoptions.host + ':' + obj.m.xtlsoptions.port + ' to ' + obj.m.host);
                    startIderSessionEx(userConsentFunc);
                });
            } else if (obj.m.tls == 0) {
                // Open connection without TLS
                obj.m.client = new _net.Socket();
                obj.m.client.connect(obj.m.port, obj.m.host, function () {
                    //console.log('IDER Connected TCP, ' + obj.m.host + ':' + obj.m.port);
                    startIderSessionEx(userConsentFunc);
                });
            } else {
                // Open connection with TLS
                if (obj.m.xtlsoptions == null) { obj.m.xtlsoptions = { secureProtocol: 'TLSv1_method', ciphers: 'RSA+AES:!aNULL:!MD5:!DSS', secureOptions: obj.constants.SSL_OP_NO_SSLv2 | obj.constants.SSL_OP_NO_SSLv3 | obj.constants.SSL_OP_NO_COMPRESSION | obj.constants.SSL_OP_CIPHER_SERVER_PREFERENCE, rejectUnauthorized: false }; }
                obj.m.client = _tls.connect(obj.m.port, obj.m.host, obj.m.xtlsoptions, function () {
                    //console.log('IDER Connected TLS, ' + obj.m.host + ':' + obj.m.port);

                    // Check the Intel AMT certificate, it must be the same as the one used for WSMAN. If not, disconnect.
                    var iderTlsCertificate = obj.m.client.getPeerCertificate();
                    if ((iderTlsCertificate == null) || (obj.m.wsmanCert == null) || (iderTlsCertificate.fingerprint != obj.m.wsmanCert.fingerprint)) {
                        console.log('Invalid IDER certificate, disconnecting.', iderTlsCertificate);
                        obj.m.Stop();
                    } else {
                        startIderSessionEx(userConsentFunc)
                    }
                });
            }

            obj.m.client.setEncoding('binary');

            obj.m.client.on('data', function (data) {
                //console.log('IDER-RECV(' + data.length + ', ' + obj.receivedCount + '): ' + rstr2hex(data));
                if ((obj.m.imrsdk == null) || (obj.m.imrsdk.pendingData[obj.m.imrsdk.conID] == null)) { return; }

                if ((obj.receivedCount == 0) && (data.charCodeAt(0) == 0x11) && (data.charCodeAt(1) == 0x05)) {
                    // We got a user consent error, handle it now before IMRSDK.dll can get it.
                    console.log('IDER user consent required.');
                    obj.m.imrsdk.pendingData[obj.m.imrsdk.conID] = String.fromCharCode(0x11, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00); // Try to cause a fault.
                    obj.m.imrsdk.ReadyReadSock(obj.m.imrsdk.conID, function (x, error) { });
                    setTimeout(function () { obj.m.userConsentFunc(startIderSession); }, 500);
                } else {
                    obj.m.imrsdk.pendingData[obj.m.imrsdk.conID] += data;
                    obj.m.imrsdk.ReadyReadSock(obj.m.imrsdk.conID, function (x, error) { });
                }
                obj.receivedCount += data.length;
            });

            obj.m.client.on('close', function () { obj.m.Stop(); });

            // If the TCP connection causes an error, disconnect the associated web socket.
            obj.m.client.on('error', function (err) { obj.m.Stop(); });
        } catch (e) {
            //console.log(e);
            obj.m.Stop();
            obj.m.onDialogPrompt(obj.m, { 'html': e }, 1);
        }
    }

    function startIderSessionEx(userConsentFunc) {
        try {
            //console.log('IDER-StartEx');
            obj.m.userConsentFunc = userConsentFunc;
            if (globalIderWrapper == null) {
                obj.m.imrsdk = globalIderWrapper = CreateIMRSDKWrapper();
                obj.m.imrsdk.InitEx(obj.m.client);
                if (obj.m.amtcertpath) { obj.m.imrsdk.SetCertificateInfo(obj.m.amtcertpath, null, null); }
            } else {
                obj.m.imrsdk = globalIderWrapper;
                obj.m.imrsdk.client = obj.m.client;
            }
            obj.m.clientid = globalIderClientId = obj.m.imrsdk.AddClient(obj.m.tls + 1, 'HOST' + Math.random());
            obj.m.imrsdk.pendingData[obj.m.clientid] = '';

            globalIderPendingCalls++;
            var error = obj.m.imrsdk.IDEROpenTCPSessionAsync(obj.m.clientid, obj.m.user, obj.m.pass, obj.m.imgpath, obj.m.isopath, function (error) {
                globalIderPendingCalls--;
                if (obj.m.imrsdk == null) return; // We closed already, exit now.
                if ((error == 38) && (userConsentFunc != undefined)) { obj.m.Stop(); userConsentFunc(startIderSession); return; }
                if (error != 0) { console.log('IDER error ' + error); obj.m.Stop(); }
                if (error == 0) {
                    globalIderPendingCalls++;
                    obj.m.imrsdk.IDERSetDeviceStateAsync(obj.m.clientid, 0, obj.m.startoption, 0, obj.m.startoption, function (error, result) {
                        globalIderPendingCalls--;
                        if (error != 0) {
                            obj.m.Stop();
                            obj.m.onDialogPrompt(obj.m, { 'html': e }, 1);
                        } else {
                            obj.StateChange(3);
                        }
                    });
                }
            });
        } catch (e) {
            console.log(e);
            obj.m.Stop();
            obj.m.onDialogPrompt(obj.m, { 'html': e }, 1);
        }
    }

    return obj;
}
