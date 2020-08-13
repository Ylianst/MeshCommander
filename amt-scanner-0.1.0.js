/**
* @description Meshcentral Intel AMT Local Scanner
* @author Ylian Saint-Hilaire
* @version v0.0.1
*/

// Construct a Intel AMT Scanner object
var CreateAmtScanner = function (func) {
    var obj = {};
    obj.active = false;
    obj.dgram = require('dgram');
    obj.servers = {};
    obj.rserver = {};
    obj.rpacket = null;
    obj.tagToId = {}; // Tag --> { lastpong: time, id: NodeId }
    obj.scanTable = {}; // Handle --> ScanInfo : { lastping: time, lastpong: time, nodeinfo:{node} }
    obj.scanTableTags = {}; // Tag --> ScanInfo
    obj.pendingSends = []; // We was to stagger the sends using a 10ms timer
    obj.pendingSendTimer = null;
    obj.mainTimer = null;
    obj.nextTag = 0;
    obj.computerPresenceFunc = func;
    var PeriodicScanTime = 30000; // Interval between scan sweeps
    var PeriodicScanTimeout = 65000; // After this time, timeout the device.

    // Build a RMCP packet with a given tag field
    obj.buildRmcpPing = function (tag) {
        var packet = new Buffer(hex2rstr('06000006000011BE80000000'), 'ascii');
        packet[9] = tag;
        return packet;
    }

    // Start scanning for local network Intel AMT computers
    obj.start = function () {
        if (obj.active == false) {
            obj.active = true;
            obj.performScan();
            obj.mainTimer = setInterval(obj.performScan, PeriodicScanTime);
        }
    }

    // Stop scanning for local network Intel AMT computers
    obj.stop = function () {
        obj.active = false;
        for (var i in obj.servers) { obj.servers[i].close(); } // Stop all servers
        obj.servers = {};
        if (obj.mainTimer != null) { clearInterval(obj.mainTimer); obj.mainTimer = null; }
    }

    // Scan for Intel AMT computers using network multicast
    obj.performRangeScan = function (id, rangestr, func) {
        if (obj.rpacket == null) { obj.rpacket = obj.buildRmcpPing(0); }
        var range = obj.parseIpv4Range(rangestr);
        //console.log(obj.IPv4NumToStr(range.min), obj.IPv4NumToStr(range.max));
        if (range == null || (range.min > range.max)) return false;
        var rangeinfo = { id: id, range: rangestr, min: range.min, max: range.max, results: {}, resultCount: 0 };
        obj.rserver[id] = rangeinfo;
        rangeinfo.server = obj.dgram.createSocket('udp4');
        rangeinfo.server.bind(0);
        rangeinfo.server.on('error', function(err) { console.log(err); });
        rangeinfo.server.on('message', function(data, rinfo) { obj.parseRmcpPacket(data, rinfo, 0, func, rangeinfo); });
        rangeinfo.server.on('listening', function () {
            for (var i = rangeinfo.min; i <= rangeinfo.max; i++) {
                rangeinfo.server.send(obj.rpacket, 0, obj.rpacket.length, 623, obj.IPv4NumToStr(i));
                rangeinfo.server.send(obj.rpacket, 0, obj.rpacket.length, 623, obj.IPv4NumToStr(i));
            }
        });
        rangeinfo.timer = setTimeout(function () {
            if (rangeinfo.resultCount == 0) { func(obj, null); }
            rangeinfo.server.close();
            delete rangeinfo.server;
            delete rangeinfo;
        }, 5000);
        return true;
    }

    // Parse range, used to parse 'ip', 'ip/mask' or 'ip-ip' notation.
    // Return the start and end value of the scan
    obj.parseIpv4Range = function (range) {
        if (range == undefined || range == null) return null;
        var x = range.split('-');
        if (x.length == 2) { return { min: obj.parseIpv4Addr(x[0]), max: obj.parseIpv4Addr(x[1]) }; }
        x = range.split('/');
        if (x.length == 2) {
            var ip = obj.parseIpv4Addr(x[0]), masknum = parseInt(x[1]), mask = 0;
            if (masknum < 16) return null;
            for (var i = 0; i < (32 - masknum) ; i++) { mask = (mask << 1); mask++; }
            return { min: ip & (0xFFFFFFFF - mask), max: (ip & (0xFFFFFFFF - mask)) + mask };
        }
        x = obj.parseIpv4Addr(range);
        if (x == null) return null;
        return { min: x, max: x };
    }

    // Parse IP address. Takes a 
    obj.parseIpv4Addr = function (addr) {
        var x = addr.split('.');
        if (x.length == 4) { return (parseInt(x[0]) << 24) + (parseInt(x[1]) << 16) + (parseInt(x[2]) << 8) + (parseInt(x[3]) << 0); }
        return null;
    }

    // IP address number to string
    obj.IPv4NumToStr = function (num) {
        return ((num >> 24) & 0xFF) + '.' + ((num >> 16) & 0xFF) + '.' + ((num >> 8) & 0xFF) + '.' + (num & 0xFF);
    }

    // Scan the list of all computers
    obj.performScan = function () {
        if (obj.active == false || computerlist == undefined) return;
        for (var i in obj.scanTable) { obj.scanTable[i].present = false; }
        if (computerlist.length > 0) {
            for (var i in computerlist) {
                var computer = computerlist[i];
                if (computer.host == null) continue;// do not scan computer without host/ip, it is relayed.
                var host = computer.host.toLowerCase();
                if ((host != '127.0.0.1') && (host != '::1') && (host != 'localhost') && (host.split(':').length == 1)) {
                    var scaninfo = obj.scanTable[computer.h];
                    if (scaninfo == undefined) {
                        var tag = obj.nextTag++;
                        obj.scanTableTags[tag] = obj.scanTable[computer.h] = scaninfo = { computer: computer, present: true, tag: tag, scanstate: -1, lastpong: Date.now() };
                    } else {
                        scaninfo.present = true;
                        var delta = Date.now() - scaninfo.lastpong;
                        if ((delta > PeriodicScanTimeout) && (scaninfo.scanstate != 0)) { // More than the timeout without a response, mark the node as unknown state
                            scaninfo.scanstate = 0;
                            if (obj.computerPresenceFunc) { obj.computerPresenceFunc(scaninfo.computer.h, false); }
                        }
                    }
                    // Start scanning this node
                    scaninfo.lastping = Date.now();
                    obj.checkAmtPresence(computer.host, scaninfo.tag);
                }
            }
        }
        for (var i in obj.scanTable) {
            if (obj.scanTable[i].present == false) {
                // Stop scanning this node
                delete obj.scanTableTags[obj.scanTable[i].tag];
                delete obj.scanTable[i];
            }
        }
    }

    // Check the presense of a specific Intel AMT computer
    obj.checkAmtPresence = function (host, tag) {
        var serverid = Math.floor(tag / 255);
        var servertag = (tag % 255);
        var packet = obj.buildRmcpPing(servertag);
        var server = obj.servers[serverid];
        if (server == undefined) {
            // Start new server
            server = obj.dgram.createSocket('udp4');
            server.on('error', function(err) { });
            server.on('message', function (data, rinfo) { obj.parseRmcpPacket(data, rinfo, serverid, obj.changeConnectState, null); });
            server.on('listening', function() { obj.pendingSends.push([ server, packet, host ]); if (obj.pendingSendTimer == null) { obj.pendingSendTimer = setInterval(obj.sendPendingPacket, 10); } });
            server.bind(0);
            obj.servers[serverid] = server;
        } else {
            // Use existing server
            obj.pendingSends.push([ server, packet, host ]);
            if (obj.pendingSendTimer == null) { obj.pendingSendTimer = setInterval(obj.sendPendingPacket, 10); }
        }
    }

    // Send a pending RMCP packet
    obj.sendPendingPacket = function () {
        try {
            var p = obj.pendingSends.shift();
            if (p != undefined) {
                p[0].send(p[1], 0, p[1].length, 623, p[2]);
                p[0].send(p[1], 0, p[1].length, 623, p[2]);
            } else {
                clearInterval(obj.pendingSendTimer);
                obj.pendingSendTimer = null;
            }
        } catch (e) { }
    }
    
    // Parse RMCP packet
    obj.parseRmcpPacket = function (data, rinfo, serverid, func, rangeinfo) {
        if (data == null || data.length < 20) return;
        if (((data[12] == 0) || (data[13] != 0) || (data[14] != 1) || (data[15] != 0x57)) && (data[21] & 32)) {
            var result = { tag: (serverid * 255) + data[9], ver: ((data[18] >> 4) & 0x0F) + '.' + (data[18] & 0x0F), state: (data[19] & 0x03), port: ((data[16] * 256) + data[17]), dualport: (((data[19] & 0x04) != 0) ? true : false), rinfo: rinfo };
            result.tls = (((result.openPort == 16993) || (result.dualPorts == true)) ? 1 : 0)
            if (rangeinfo != null) {
                if ((result.state <= 2) && (!rangeinfo.results[rinfo.address])) {
                    rangeinfo.results[rinfo.address] = result;
                    rangeinfo.resultCount++;
                    obj.reverseLookup(rinfo.address, function (err, domains) {
                        result.domains = domains;
                        func(obj, result, rangeinfo);
                    });
                }
            } else {
                func(obj, result, rangeinfo);
            }
        }
    }

    // Use the RMCP packet to change the computer state
    obj.changeConnectState = function (obj, result, rangeinfo) {
        var scaninfo = obj.scanTableTags[result.tag];
        if (scaninfo) {
            scaninfo.lastpong = Date.now();
            if (scaninfo.scanstate != 1) {
                scaninfo.scanstate = 1;
                if (obj.computerPresenceFunc) obj.computerPresenceFunc(scaninfo.computer.h, true);
            }
        }
    }

    // Perform DNS reverse lookup
    obj.reverseLookup = function(ip, callback) {
        var callbackCalled = false, timer = null;
        var doCallback = function (err, domains) {
            if (err) domains = [ip];
            if (callbackCalled) return;
            callbackCalled = true;
            if (timer != null) {
                // Cancelling timer to safe few seconds
                clearTimeout(timer);
                timer = null;
            }
            callback(err, domains);
        }
        // throw failed upon timeout
        timer = setTimeout(function () {
            timer = null; // Ensure timer is nullified
            doCallback(new Error('Timeout exceeded'), null);
        }, 3000);

        require('dns').reverse(ip, doCallback);
    }

    return obj;
}