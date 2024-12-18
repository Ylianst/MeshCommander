/**
* @fileoverview Intel(r) AMT Communication StackXX
* @author Ylian Saint-Hilaire
* @version v0.2.0b
*/

/**
 * Construct a AmtStackCreateService object, this ia the main Intel AMT communication stack.
 * @constructor
 */
function AmtStackCreateService(wsmanStack) {
    var obj = new Object();
    obj.wsman = wsmanStack;
    obj.pfx = ['http://intel.com/wbem/wscim/1/amt-schema/1/', 'http://schemas.dmtf.org/wbem/wscim/1/cim-schema/2/', 'http://intel.com/wbem/wscim/1/ips-schema/1/'];
    obj.PendingEnums = [];
    obj.PendingBatchOperations = 0;
    obj.ActiveEnumsCount = 0;
    obj.MaxActiveEnumsCount = 1; // Maximum number of enumerations that can be done at the same time.
    obj.onProcessChanged = null;
    var _MaxProcess = 0;
    var _LastProcess = 0;

    // Return the number of pending actions
    obj.GetPendingActions = function () { return (obj.PendingEnums.length * 2) + (obj.ActiveEnumsCount) + obj.wsman.comm.PendingAjax.length + obj.wsman.comm.ActiveAjaxCount + obj.PendingBatchOperations; }

    // Private Method, Update the current processing status, this gives the application an idea of what progress is being done by the WSMAN stack
    function _up() {
        var x = obj.GetPendingActions();
        if (_MaxProcess < x) _MaxProcess = x;
        if (obj.onProcessChanged != null && _LastProcess != x) {
            //console.log('Process Old=' + _LastProcess + ', New=' + x + ', PEnums=' + obj.PendingEnums.length + ', AEnums=' + obj.ActiveEnumsCount + ', PAjax=' + obj.wsman.comm.PendingAjax.length + ', AAjax=' + obj.wsman.comm.ActiveAjaxCount + ', PBatch=' + obj.PendingBatchOperations);
            _LastProcess = x;
            obj.onProcessChanged(x, _MaxProcess);
        }
        if (x == 0) _MaxProcess = 0;
    }

    // Perform a WSMAN "SUBSCRIBE" operation.
    obj.Subscribe = function (name, delivery, url, callback, tag, pri, selectors, opaque, user, pass) { obj.wsman.ExecSubscribe(obj.CompleteName(name), delivery, url, function (ws, resuri, response, xstatus) { _up(); callback(obj, name, response, xstatus, tag); }, 0, pri, selectors, opaque, user, pass); _up(); }

    // Perform a WSMAN "UNSUBSCRIBE" operation.
    obj.UnSubscribe = function (name, callback, tag, pri, selectors) { obj.wsman.ExecUnSubscribe(obj.CompleteName(name), function (ws, resuri, response, xstatus) { _up(); callback(obj, name, response, xstatus, tag); }, 0, pri, selectors); _up(); }

    // Perform a WSMAN "GET" operation.
    obj.Get = function (name, callback, tag, pri) { obj.wsman.ExecGet(obj.CompleteName(name), function (ws, resuri, response, xstatus) { _up(); callback(obj, name, response, xstatus, tag); }, 0, pri); _up(); }

    // Perform a WSMAN "PUT" operation.
    obj.Put = function (name, putobj, callback, tag, pri, selectors) { obj.wsman.ExecPut(obj.CompleteName(name), putobj, function (ws, resuri, response, xstatus) { _up(); callback(obj, name, response, xstatus, tag); }, 0, pri, selectors); _up(); }
	
    // Perform a WSMAN "CREATE" operation.
    obj.Create = function (name, putobj, callback, tag, pri) { obj.wsman.ExecCreate(obj.CompleteName(name), putobj, function (ws, resuri, response, xstatus) { _up(); callback(obj, name, response, xstatus, tag); }, 0, pri); _up(); }

    // Perform a WSMAN "DELETE" operation.
    obj.Delete = function (name, putobj, callback, tag, pri) { obj.wsman.ExecDelete(obj.CompleteName(name), putobj, function (ws, resuri, response, xstatus) { _up(); callback(obj, name, response, xstatus, tag); }, 0, pri); _up(); }

    // Perform a WSMAN method call operation.
    obj.Exec = function (name, method, args, callback, tag, pri, selectors) { obj.wsman.ExecMethod(obj.CompleteName(name), method, args, function (ws, resuri, response, xstatus) { _up(); callback(obj, name, obj.CompleteExecResponse(response), xstatus, tag); }, 0, pri, selectors); _up(); }
	
    // Perform a WSMAN method call operation.
    obj.ExecWithXml = function (name, method, args, callback, tag, pri, selectors) { obj.wsman.ExecMethodXml(obj.CompleteName(name), method, execArgumentsToXml(args), function (ws, resuri, response, xstatus) { _up(); callback(obj, name, obj.CompleteExecResponse(response), xstatus, tag); }, 0, pri, selectors); _up(); }
	
    // Perform a WSMAN "ENUMERATE" operation.
    obj.Enum = function (name, callback, tag, pri) {
        if (obj.ActiveEnumsCount < obj.MaxActiveEnumsCount) {
            //console.log('ENUM-DO', obj.ActiveEnumsCount, obj.MaxActiveEnumsCount, obj.PendingEnums.length);
            obj.ActiveEnumsCount++; obj.wsman.ExecEnum(obj.CompleteName(name), function (ws, resuri, response, xstatus, tag0) { _up(); _EnumStartSink(name, response, callback, resuri, xstatus, tag0); }, tag, pri);
        } else {
            obj.PendingEnums.push([name, callback, tag, pri]);
            //console.log('ENUM-PENDING', obj.ActiveEnumsCount, obj.MaxActiveEnumsCount, obj.PendingEnums.length);
        }
        _up();
    }

    // Private method
    function _EnumStartSink(name, response, callback, resuri, status, tag, pri) {
        if (status != 200) {
            //console.log('Got ' + status + ' on _EnumStartSink for ' + name);
            callback(obj, name, null, status, tag); _EnumDoNext(1); return;
        }
        if (response == null || response.Header['Method'] != 'EnumerateResponse' || !response.Body['EnumerationContext']) { callback(obj, name, null, 603, tag); _EnumDoNext(1); return; }
        var enumctx = response.Body['EnumerationContext'];
        obj.wsman.ExecPull(resuri, enumctx, function (ws, resuri, response, xstatus) { _EnumContinueSink(name, response, callback, resuri, [], xstatus, tag, pri); });
    }

    // Private method
    function _EnumContinueSink(name, response, callback, resuri, items, status, tag, pri) {
        if (status != 200) {
            //console.log('Got ' + status + ' on _EnumContinueSink for ' + name);
            callback(obj, name, null, status, tag); _EnumDoNext(1); return;
        }
        if (response == null || response.Header['Method'] != 'PullResponse') { callback(obj, name, null, 604, tag); _EnumDoNext(1); return; }
        for (var i in response.Body['Items']) {
            if (response.Body['Items'][i] instanceof Array) {
                for (var j in response.Body['Items'][i]) { if (typeof response.Body['Items'][i][j] != 'function') { items.push(response.Body['Items'][i][j]); } }
            } else {
                if (typeof response.Body['Items'][i] != 'function') { items.push(response.Body['Items'][i]); }
            }
        }
        if (response.Body['EnumerationContext']) {
            var enumctx = response.Body['EnumerationContext'];
            obj.wsman.ExecPull(resuri, enumctx, function (ws, resuri, response, xstatus) { _EnumContinueSink(name, response, callback, resuri, items, xstatus, tag, 1); });
        } else {
            //console.log('ENUM-DONE');
            _EnumDoNext(1);
            callback(obj, name, items, status, tag);
            _up();
        }
    }

    // Private method
    function _EnumDoNext(dec) {
        obj.ActiveEnumsCount -= dec;
        if ((obj.ActiveEnumsCount >= obj.MaxActiveEnumsCount) || (obj.PendingEnums.length == 0)) { _up(); return; }
        var x = obj.PendingEnums.shift();
        obj.Enum(x[0], x[1], x[2]);
        _EnumDoNext(0);
    }

    // Perform a batch of WSMAN "ENUM" or "GET" operations.
    // Since we are pipelining, continueOnError is no longer supported
    obj.BatchEnum = function (batchname, names, callback, tag, continueOnError, pri) {
        var results = { _pending: names.length };
        obj.PendingBatchOperations += names.length;
        //console.log('obj.PendingBatchOperations', obj.PendingBatchOperations);
        for (var i in names) {
            var n = names[i], f = obj.Enum;
            if (n[0] == '*') { f = obj.Get; n = n.substring(1); } // If the name starts with a star, do a GET instead of an ENUM. This will reduce round trips.
            //console.log((f == obj.Get ? 'Get ' : 'Enum ') + n);
            f(n, function (stack, name, responses, status, tag0) {
                //if (status != 200) { console.log('Got ' + status + ' on BatchEnum for ' + name + ', ' + tag0[3]); }
                obj.PendingBatchOperations--;
                //console.log('obj.PendingBatchOperations', obj.PendingBatchOperations);
                _up();
                tag0[2][name] = { response: (responses == null ? null : responses.Body), responses: responses, status: status };
                if ((--tag0[2]._pending) == 0) {
                    delete tag0[2]._pending;
                    callback.call(obj, obj, batchname, tag0[2], status, tag);
                }
            }, [batchname, names, results, (f == obj.Get ? 'Get' : 'Enum')], pri);
        }
    }

    /*
    // Perform a batch of WSMAN "ENUM" operations.
    obj.BatchEnum = function (batchname, names, callback, tag, continueOnError, pri) {
        obj.PendingBatchOperations += (names.length * 2);
        _BatchNextEnum(batchname, Clone(names), callback, tag, {}, continueOnError, pri); _up();
    }

    // Request each enum in the batch, stopping if something does not return status 200
    function _BatchNextEnum(batchname, names, callback, tag, results, continueOnError, pri) {
        obj.PendingBatchOperations -= 2;
        var n = names.shift(), f = obj.Enum;
        if (n[0] == '*') { f = obj.Get; n = n.substring(1); } // If the name starts with a star, do a GET instead of an ENUM. This will reduce round trips.
        //console.log((f == obj.Get?'Get ':'Enum ') + n);
        // Perform a GET/ENUM action
        f(n, function (stack, name, responses, status, tag0) {
            tag0[2][name] = { response: (responses==null?null:responses.Body), responses: responses, status: status };
            if (tag0[1].length == 0 || status == 401 || (continueOnError != true && status != 200 && status != 400)) { obj.PendingBatchOperations -= (names.length * 2); _up(); callback(obj, batchname, tag0[2], status, tag); }
            else { _up(); _BatchNextEnum(batchname, names, callback, tag, tag0[2], pri); }
        }, [batchname, names, results], pri);
        _up();
    }
    */

    // Perform a batch of WSMAN "GET" operations.
    obj.BatchGet = function (batchname, names, callback, tag, pri) {
        _FetchNext({ name: batchname, names: names, callback: callback, current: 0, responses: {}, tag: tag, pri: pri }); _up();
    }

    // Private method
    function _FetchNext(batch) {
        if (batch.names.length <= batch.current) {
            batch.callback(obj, batch.name, batch.responses, 200, batch.tag);
        } else {
            obj.wsman.ExecGet(obj.CompleteName(batch.names[batch.current]), function (ws, resuri, response, xstatus) { _Fetched(batch, response, xstatus); }, batch.pri);
            batch.current++;
        }
        _up();
    }

    // Private method
    function _Fetched(batch, response, status) {
        if (response == null || status != 200) {
            batch.callback(obj, batch.name, null, status, batch.tag);
        } else {
            batch.responses[response.Header['Method']] = response;
            _FetchNext(batch);
        }
    }

    // Private method
    obj.CompleteName = function(name) {
        if (name.indexOf('AMT_') == 0) return obj.pfx[0] + name;
        if (name.indexOf('CIM_') == 0) return obj.pfx[1] + name;
        if (name.indexOf('IPS_') == 0) return obj.pfx[2] + name;
    }

    obj.CompleteExecResponse = function (resp) {
        if (resp && resp != null && resp.Body && (resp.Body['ReturnValue'] != undefined)) { resp.Body.ReturnValueStr = obj.AmtStatusToStr(resp.Body['ReturnValue']); }
        return resp;
    }

    obj.RequestPowerStateChange = function (PowerState, callback_func) {
        obj.CIM_PowerManagementService_RequestPowerStateChange(PowerState, '<Address xmlns="http://schemas.xmlsoap.org/ws/2004/08/addressing">http://schemas.xmlsoap.org/ws/2004/08/addressing</Address><ReferenceParameters xmlns="http://schemas.xmlsoap.org/ws/2004/08/addressing"><ResourceURI xmlns="http://schemas.dmtf.org/wbem/wsman/1/wsman.xsd">http://schemas.dmtf.org/wbem/wscim/1/cim-schema/2/CIM_ComputerSystem</ResourceURI><SelectorSet xmlns="http://schemas.dmtf.org/wbem/wsman/1/wsman.xsd"><Selector Name="CreationClassName">CIM_ComputerSystem</Selector><Selector Name="Name">ManagedSystem</Selector></SelectorSet></ReferenceParameters>', null, null, callback_func);
    }

    obj.RequestOSPowerStateChange = function (PowerState, callback_func) {
        obj.IPS_PowerManagementService_RequestOSPowerSavingStateChange(PowerState, '<Address xmlns="http://schemas.xmlsoap.org/ws/2004/08/addressing">http://schemas.xmlsoap.org/ws/2004/08/addressing</Address><ReferenceParameters xmlns="http://schemas.xmlsoap.org/ws/2004/08/addressing"><ResourceURI xmlns="http://schemas.dmtf.org/wbem/wsman/1/wsman.xsd\">http://schemas.dmtf.org/wbem/wscim/1/cim-schema/2/CIM_ComputerSystem</ResourceURI><SelectorSet xmlns="http://schemas.dmtf.org/wbem/wsman/1/wsman.xsd"><Selector Name="CreationClassName">CIM_ComputerSystem</Selector><Selector Name="Name">ManagedSystem</Selector></SelectorSet></ReferenceParameters>', null, null, callback_func);
    }

    obj.SetBootConfigRole = function (Role, callback_func) {
        obj.CIM_BootService_SetBootConfigRole('<Address xmlns="http://schemas.xmlsoap.org/ws/2004/08/addressing">http://schemas.xmlsoap.org/ws/2004/08/addressing</Address><ReferenceParameters xmlns="http://schemas.xmlsoap.org/ws/2004/08/addressing"><ResourceURI xmlns="http://schemas.dmtf.org/wbem/wsman/1/wsman.xsd">http://schemas.dmtf.org/wbem/wscim/1/cim-schema/2/CIM_BootConfigSetting</ResourceURI><SelectorSet xmlns="http://schemas.dmtf.org/wbem/wsman/1/wsman.xsd"><Selector Name="InstanceID">Intel(r) AMT: Boot Configuration 0</Selector></SelectorSet></ReferenceParameters>', Role, callback_func);
    }

    // Cancel all pending queries with given status
    obj.CancelAllQueries = function (s) {
        obj.wsman.CancelAllQueries(s);
    }

    // Auto generated methods
    obj.AMT_AgentPresenceWatchdog_RegisterAgent = function (callback_func) { obj.Exec('AMT_AgentPresenceWatchdog', 'RegisterAgent', {}, callback_func); }
    obj.AMT_AgentPresenceWatchdog_AssertPresence = function (SequenceNumber, callback_func) { obj.Exec('AMT_AgentPresenceWatchdog', 'AssertPresence', { 'SequenceNumber': SequenceNumber }, callback_func); }
    obj.AMT_AgentPresenceWatchdog_AssertShutdown = function (SequenceNumber, callback_func) { obj.Exec('AMT_AgentPresenceWatchdog', 'AssertShutdown', { 'SequenceNumber': SequenceNumber }, callback_func); }
    obj.AMT_AgentPresenceWatchdog_AddAction = function (OldState, NewState, EventOnTransition, ActionSd, ActionEac, callback_func, tag, pri, selectors) { obj.Exec('AMT_AgentPresenceWatchdog', 'AddAction', { 'OldState': OldState, 'NewState': NewState, 'EventOnTransition': EventOnTransition, 'ActionSd': ActionSd, 'ActionEac': ActionEac }, callback_func, tag, pri, selectors); }
    obj.AMT_AgentPresenceWatchdog_DeleteAllActions = function (callback_func, tag, pri, selectors) { obj.Exec('AMT_AgentPresenceWatchdog', 'DeleteAllActions', {}, callback_func, tag, pri, selectors); }
    obj.AMT_AgentPresenceWatchdogAction_GetActionEac = function (callback_func) { obj.Exec('AMT_AgentPresenceWatchdogAction', 'GetActionEac', {}, callback_func); }
    obj.AMT_AgentPresenceWatchdogVA_RegisterAgent = function (callback_func) { obj.Exec('AMT_AgentPresenceWatchdogVA', 'RegisterAgent', {}, callback_func); }
    obj.AMT_AgentPresenceWatchdogVA_AssertPresence = function (SequenceNumber, callback_func) { obj.Exec('AMT_AgentPresenceWatchdogVA', 'AssertPresence', { 'SequenceNumber': SequenceNumber }, callback_func); }
    obj.AMT_AgentPresenceWatchdogVA_AssertShutdown = function (SequenceNumber, callback_func) { obj.Exec('AMT_AgentPresenceWatchdogVA', 'AssertShutdown', { 'SequenceNumber': SequenceNumber }, callback_func); }
    obj.AMT_AgentPresenceWatchdogVA_AddAction = function (OldState, NewState, EventOnTransition, ActionSd, ActionEac, callback_func) { obj.Exec('AMT_AgentPresenceWatchdogVA', 'AddAction', { 'OldState': OldState, 'NewState': NewState, 'EventOnTransition': EventOnTransition, 'ActionSd': ActionSd, 'ActionEac': ActionEac }, callback_func); }
    obj.AMT_AgentPresenceWatchdogVA_DeleteAllActions = function (_method_dummy, callback_func) { obj.Exec('AMT_AgentPresenceWatchdogVA', 'DeleteAllActions', { '_method_dummy': _method_dummy }, callback_func); }
    obj.AMT_AuditLog_ClearLog = function (callback_func) { obj.Exec('AMT_AuditLog', 'ClearLog', {}, callback_func); }
    obj.AMT_AuditLog_RequestStateChange = function (RequestedState, TimeoutPeriod, callback_func) { obj.Exec('AMT_AuditLog', 'RequestStateChange', { 'RequestedState': RequestedState, 'TimeoutPeriod': TimeoutPeriod }, callback_func); }
    obj.AMT_AuditLog_ReadRecords = function (StartIndex, callback_func, tag) { obj.Exec('AMT_AuditLog', 'ReadRecords', { 'StartIndex': StartIndex }, callback_func, tag); }
    obj.AMT_AuditLog_SetAuditLock = function (LockTimeoutInSeconds, Flag, Handle, callback_func) { obj.Exec('AMT_AuditLog', 'SetAuditLock', { 'LockTimeoutInSeconds': LockTimeoutInSeconds, 'Flag': Flag, 'Handle': Handle }, callback_func); }
    obj.AMT_AuditLog_ExportAuditLogSignature = function (SigningMechanism, callback_func) { obj.Exec('AMT_AuditLog', 'ExportAuditLogSignature', { 'SigningMechanism': SigningMechanism }, callback_func); }
    obj.AMT_AuditLog_SetSigningKeyMaterial = function (SigningMechanismType, SigningKey, LengthOfCertificates, Certificates, callback_func) { obj.Exec('AMT_AuditLog', 'SetSigningKeyMaterial', { 'SigningMechanismType': SigningMechanismType, 'SigningKey': SigningKey, 'LengthOfCertificates': LengthOfCertificates, 'Certificates': Certificates }, callback_func); }
    obj.AMT_AuditPolicyRule_SetAuditPolicy = function (Enable, AuditedAppID, EventID, PolicyType, callback_func) { obj.Exec('AMT_AuditPolicyRule', 'SetAuditPolicy', { 'Enable': Enable, 'AuditedAppID': AuditedAppID, 'EventID': EventID, 'PolicyType': PolicyType }, callback_func); }
    obj.AMT_AuditPolicyRule_SetAuditPolicyBulk = function (Enable, AuditedAppID, EventID, PolicyType, callback_func) { obj.Exec('AMT_AuditPolicyRule', 'SetAuditPolicyBulk', { 'Enable': Enable, 'AuditedAppID': AuditedAppID, 'EventID': EventID, 'PolicyType': PolicyType }, callback_func); }
    obj.AMT_AuthorizationService_AddUserAclEntryEx = function (DigestUsername, DigestPassword, KerberosUserSid, AccessPermission, Realms, callback_func) { obj.Exec('AMT_AuthorizationService', 'AddUserAclEntryEx', { 'DigestUsername': DigestUsername, 'DigestPassword': DigestPassword, 'KerberosUserSid': KerberosUserSid, 'AccessPermission': AccessPermission, 'Realms': Realms }, callback_func); }
    obj.AMT_AuthorizationService_EnumerateUserAclEntries = function (StartIndex, callback_func) { obj.Exec('AMT_AuthorizationService', 'EnumerateUserAclEntries', { 'StartIndex': StartIndex }, callback_func); }
    obj.AMT_AuthorizationService_GetUserAclEntryEx = function (Handle, callback_func, tag) { obj.Exec('AMT_AuthorizationService', 'GetUserAclEntryEx', { 'Handle': Handle }, callback_func, tag); }
    obj.AMT_AuthorizationService_UpdateUserAclEntryEx = function (Handle, DigestUsername, DigestPassword, KerberosUserSid, AccessPermission, Realms, callback_func) { obj.Exec('AMT_AuthorizationService', 'UpdateUserAclEntryEx', { 'Handle': Handle, 'DigestUsername': DigestUsername, 'DigestPassword': DigestPassword, 'KerberosUserSid': KerberosUserSid, 'AccessPermission': AccessPermission, 'Realms': Realms }, callback_func); }
    obj.AMT_AuthorizationService_RemoveUserAclEntry = function (Handle, callback_func) { obj.Exec('AMT_AuthorizationService', 'RemoveUserAclEntry', { 'Handle': Handle }, callback_func); }
    obj.AMT_AuthorizationService_SetAdminAclEntryEx = function (Username, DigestPassword, callback_func) { obj.Exec('AMT_AuthorizationService', 'SetAdminAclEntryEx', { 'Username': Username, 'DigestPassword': DigestPassword }, callback_func); }
    obj.AMT_AuthorizationService_GetAdminAclEntry = function (callback_func) { obj.Exec('AMT_AuthorizationService', 'GetAdminAclEntry', {}, callback_func); }
    obj.AMT_AuthorizationService_GetAdminAclEntryStatus = function (callback_func) { obj.Exec('AMT_AuthorizationService', 'GetAdminAclEntryStatus', {}, callback_func); }
    obj.AMT_AuthorizationService_GetAdminNetAclEntryStatus = function (callback_func) { obj.Exec('AMT_AuthorizationService', 'GetAdminNetAclEntryStatus', {}, callback_func); }
    obj.AMT_AuthorizationService_SetAclEnabledState = function (Handle, Enabled, callback_func, tag) { obj.Exec('AMT_AuthorizationService', 'SetAclEnabledState', { 'Handle': Handle, 'Enabled': Enabled }, callback_func, tag); }
    obj.AMT_AuthorizationService_GetAclEnabledState = function (Handle, callback_func, tag) { obj.Exec('AMT_AuthorizationService', 'GetAclEnabledState', { 'Handle': Handle }, callback_func, tag); }
    obj.AMT_EndpointAccessControlService_RequestStateChange = function (RequestedState, TimeoutPeriod, callback_func) { obj.Exec('AMT_EndpointAccessControlService', 'RequestStateChange', { 'RequestedState': RequestedState, 'TimeoutPeriod': TimeoutPeriod }, callback_func); }
    obj.AMT_EndpointAccessControlService_GetPosture = function (PostureType, callback_func) { obj.Exec('AMT_EndpointAccessControlService', 'GetPosture', { 'PostureType': PostureType }, callback_func); }
    obj.AMT_EndpointAccessControlService_GetPostureHash = function (PostureType, callback_func) { obj.Exec('AMT_EndpointAccessControlService', 'GetPostureHash', { 'PostureType': PostureType }, callback_func); }
    obj.AMT_EndpointAccessControlService_UpdatePostureState = function (UpdateType, callback_func) { obj.Exec('AMT_EndpointAccessControlService', 'UpdatePostureState', { 'UpdateType': UpdateType }, callback_func); }
    obj.AMT_EndpointAccessControlService_GetEacOptions = function (callback_func) { obj.Exec('AMT_EndpointAccessControlService', 'GetEacOptions', {}, callback_func); }
    obj.AMT_EndpointAccessControlService_SetEacOptions = function (EacVendors, PostureHashAlgorithm, callback_func) { obj.Exec('AMT_EndpointAccessControlService', 'SetEacOptions', { 'EacVendors': EacVendors, 'PostureHashAlgorithm': PostureHashAlgorithm }, callback_func); }
    obj.AMT_EnvironmentDetectionSettingData_SetSystemDefensePolicy = function (Policy, callback_func) { obj.Exec('AMT_EnvironmentDetectionSettingData', 'SetSystemDefensePolicy', { 'Policy': Policy }, callback_func); }
    obj.AMT_EnvironmentDetectionSettingData_EnableVpnRouting = function (Enable, callback_func) { obj.Exec('AMT_EnvironmentDetectionSettingData', 'EnableVpnRouting', { 'Enable': Enable }, callback_func); }
    obj.AMT_EthernetPortSettings_SetLinkPreference = function (LinkPreference, Timeout, callback_func) { obj.Exec('AMT_EthernetPortSettings', 'SetLinkPreference', { 'LinkPreference': LinkPreference, 'Timeout': Timeout }, callback_func); }
    obj.AMT_GeneralSettings_AMTAuthenticate = function (Nonce, callback_func) { obj.Exec('AMT_GeneralSettings', 'AMTAuthenticate', { 'MC_Nonce': Nonce }, callback_func); }
    obj.AMT_HeuristicPacketFilterStatistics_ResetSelectedStats = function (SelectedStatistics, callback_func) { obj.Exec('AMT_HeuristicPacketFilterStatistics', 'ResetSelectedStats', { 'SelectedStatistics': SelectedStatistics }, callback_func); }
    obj.AMT_KerberosSettingData_GetCredentialCacheState = function (callback_func) { obj.Exec('AMT_KerberosSettingData', 'GetCredentialCacheState', {}, callback_func); }
    obj.AMT_KerberosSettingData_SetCredentialCacheState = function (Enable, callback_func) { obj.Exec('AMT_KerberosSettingData', 'SetCredentialCacheState', { 'Enable': Enable }, callback_func); }
    obj.AMT_MessageLog_CancelIteration = function (IterationIdentifier, callback_func) { obj.Exec('AMT_MessageLog', 'CancelIteration', { 'IterationIdentifier': IterationIdentifier }, callback_func); }
    obj.AMT_MessageLog_RequestStateChange = function (RequestedState, TimeoutPeriod, callback_func) { obj.Exec('AMT_MessageLog', 'RequestStateChange', { 'RequestedState': RequestedState, 'TimeoutPeriod': TimeoutPeriod }, callback_func); }
    obj.AMT_MessageLog_ClearLog = function (callback_func) { obj.Exec('AMT_MessageLog', 'ClearLog', { }, callback_func); }
    obj.AMT_MessageLog_GetRecords = function (IterationIdentifier, MaxReadRecords, callback_func, tag) { obj.Exec('AMT_MessageLog', 'GetRecords', { 'IterationIdentifier': IterationIdentifier, 'MaxReadRecords': MaxReadRecords }, callback_func, tag); }
    obj.AMT_MessageLog_GetRecord = function (IterationIdentifier, PositionToNext, callback_func) { obj.Exec('AMT_MessageLog', 'GetRecord', { 'IterationIdentifier': IterationIdentifier, 'PositionToNext': PositionToNext }, callback_func); }
    obj.AMT_MessageLog_PositionAtRecord = function (IterationIdentifier, MoveAbsolute, RecordNumber, callback_func) { obj.Exec('AMT_MessageLog', 'PositionAtRecord', { 'IterationIdentifier': IterationIdentifier, 'MoveAbsolute': MoveAbsolute, 'RecordNumber': RecordNumber }, callback_func); }
    obj.AMT_MessageLog_PositionToFirstRecord = function (callback_func, tag) { obj.Exec('AMT_MessageLog', 'PositionToFirstRecord', {}, callback_func, tag); }
    obj.AMT_MessageLog_FreezeLog = function (Freeze, callback_func) { obj.Exec('AMT_MessageLog', 'FreezeLog', { 'Freeze': Freeze }, callback_func); }
    obj.AMT_PublicKeyManagementService_AddCRL = function (Url, SerialNumbers, callback_func) { obj.Exec('AMT_PublicKeyManagementService', 'AddCRL', { 'Url': Url, 'SerialNumbers': SerialNumbers }, callback_func); }
    obj.AMT_PublicKeyManagementService_ResetCRLList = function (_method_dummy, callback_func) { obj.Exec('AMT_PublicKeyManagementService', 'ResetCRLList', { '_method_dummy': _method_dummy }, callback_func); }
    obj.AMT_PublicKeyManagementService_AddCertificate = function (CertificateBlob, callback_func) { obj.Exec('AMT_PublicKeyManagementService', 'AddCertificate', { 'CertificateBlob': CertificateBlob }, callback_func); }
    obj.AMT_PublicKeyManagementService_AddTrustedRootCertificate = function (CertificateBlob, callback_func) { obj.Exec('AMT_PublicKeyManagementService', 'AddTrustedRootCertificate', { 'CertificateBlob': CertificateBlob }, callback_func); }
    obj.AMT_PublicKeyManagementService_AddKey = function (KeyBlob, callback_func) { obj.Exec('AMT_PublicKeyManagementService', 'AddKey', { 'KeyBlob': KeyBlob }, callback_func); }
    obj.AMT_PublicKeyManagementService_GeneratePKCS10Request = function (KeyPair, DNName, Usage, callback_func) { obj.Exec('AMT_PublicKeyManagementService', 'GeneratePKCS10Request', { 'KeyPair': KeyPair, 'DNName': DNName, 'Usage': Usage }, callback_func); }
    obj.AMT_PublicKeyManagementService_GeneratePKCS10RequestEx = function (KeyPair, SigningAlgorithm, NullSignedCertificateRequest, callback_func) { obj.Exec('AMT_PublicKeyManagementService', 'GeneratePKCS10RequestEx', { 'KeyPair': KeyPair, 'SigningAlgorithm': SigningAlgorithm, 'NullSignedCertificateRequest': NullSignedCertificateRequest }, callback_func); }
    obj.AMT_PublicKeyManagementService_GenerateKeyPair = function (KeyAlgorithm, KeyLength, callback_func) { obj.Exec('AMT_PublicKeyManagementService', 'GenerateKeyPair', { 'KeyAlgorithm': KeyAlgorithm, 'KeyLength': KeyLength }, callback_func); }
    obj.AMT_RedirectionService_RequestStateChange = function (RequestedState, callback_func) { obj.Exec('AMT_RedirectionService', 'RequestStateChange', { 'RequestedState': RequestedState }, callback_func); }
    obj.AMT_RedirectionService_TerminateSession = function (SessionType, callback_func) { obj.Exec('AMT_RedirectionService', 'TerminateSession', { 'SessionType': SessionType }, callback_func); }
    obj.AMT_RemoteAccessService_AddMpServer = function (AccessInfo, InfoFormat, Port, AuthMethod, Certificate, Username, Password, CN, callback_func) { obj.Exec('AMT_RemoteAccessService', 'AddMpServer', { 'AccessInfo': AccessInfo, 'InfoFormat': InfoFormat, 'Port': Port, 'AuthMethod': AuthMethod, 'Certificate': Certificate, 'Username': Username, 'Password': Password, 'CN': CN }, callback_func); }
    obj.AMT_RemoteAccessService_AddRemoteAccessPolicyRule = function (Trigger, TunnelLifeTime, ExtendedData, MpServer, InternalMpServer, callback_func) { obj.Exec('AMT_RemoteAccessService', 'AddRemoteAccessPolicyRule', { 'Trigger': Trigger, 'TunnelLifeTime': TunnelLifeTime, 'ExtendedData': ExtendedData, 'MpServer': MpServer, 'InternalMpServer': InternalMpServer }, callback_func); }
    obj.AMT_RemoteAccessService_CloseRemoteAccessConnection = function (_method_dummy, callback_func) { obj.Exec('AMT_RemoteAccessService', 'CloseRemoteAccessConnection', { '_method_dummy': _method_dummy }, callback_func); }
    obj.AMT_SetupAndConfigurationService_CommitChanges = function (_method_dummy, callback_func) { obj.Exec('AMT_SetupAndConfigurationService', 'CommitChanges', { '_method_dummy': _method_dummy }, callback_func); }
    obj.AMT_SetupAndConfigurationService_Unprovision = function (ProvisioningMode, callback_func) { obj.Exec('AMT_SetupAndConfigurationService', 'Unprovision', { 'ProvisioningMode': ProvisioningMode }, callback_func); }
    obj.AMT_SetupAndConfigurationService_PartialUnprovision = function (_method_dummy, callback_func) { obj.Exec('AMT_SetupAndConfigurationService', 'PartialUnprovision', { '_method_dummy': _method_dummy }, callback_func); }
    obj.AMT_SetupAndConfigurationService_ResetFlashWearOutProtection = function (_method_dummy, callback_func) { obj.Exec('AMT_SetupAndConfigurationService', 'ResetFlashWearOutProtection', { '_method_dummy': _method_dummy }, callback_func); }
    obj.AMT_SetupAndConfigurationService_ExtendProvisioningPeriod = function (Duration, callback_func) { obj.Exec('AMT_SetupAndConfigurationService', 'ExtendProvisioningPeriod', { 'Duration': Duration }, callback_func); }
    obj.AMT_SetupAndConfigurationService_SetMEBxPassword = function (Password, callback_func) { obj.Exec('AMT_SetupAndConfigurationService', 'SetMEBxPassword', { 'Password': Password }, callback_func); }
    obj.AMT_SetupAndConfigurationService_SetTLSPSK = function (PID, PPS, callback_func) { obj.Exec('AMT_SetupAndConfigurationService', 'SetTLSPSK', { 'PID': PID, 'PPS': PPS }, callback_func); }
    obj.AMT_SetupAndConfigurationService_GetProvisioningAuditRecord = function (callback_func) { obj.Exec('AMT_SetupAndConfigurationService', 'GetProvisioningAuditRecord', {}, callback_func); }
    obj.AMT_SetupAndConfigurationService_GetUuid = function (callback_func) { obj.Exec('AMT_SetupAndConfigurationService', 'GetUuid', {}, callback_func); }
    obj.AMT_SetupAndConfigurationService_GetUnprovisionBlockingComponents = function (callback_func) { obj.Exec('AMT_SetupAndConfigurationService', 'GetUnprovisionBlockingComponents', {}, callback_func); }
    obj.AMT_SetupAndConfigurationService_GetProvisioningAuditRecordV2 = function (callback_func) { obj.Exec('AMT_SetupAndConfigurationService', 'GetProvisioningAuditRecordV2', {}, callback_func); }
    obj.AMT_SystemDefensePolicy_GetTimeout = function (callback_func) { obj.Exec('AMT_SystemDefensePolicy', 'GetTimeout', {}, callback_func); }
    obj.AMT_SystemDefensePolicy_SetTimeout = function (Timeout, callback_func) { obj.Exec('AMT_SystemDefensePolicy', 'SetTimeout', { 'Timeout': Timeout }, callback_func); }
    obj.AMT_SystemDefensePolicy_UpdateStatistics = function (NetworkInterface, ResetOnRead, callback_func, tag, pri, selectors) { obj.Exec('AMT_SystemDefensePolicy', 'UpdateStatistics', { 'NetworkInterface': NetworkInterface, 'ResetOnRead': ResetOnRead }, callback_func, tag, pri, selectors); }
    obj.AMT_SystemPowerScheme_SetPowerScheme = function (callback_func, schemeInstanceId, tag) { obj.Exec('AMT_SystemPowerScheme', 'SetPowerScheme', {}, callback_func, tag, 0, { 'InstanceID': schemeInstanceId }); }
    obj.AMT_TimeSynchronizationService_GetLowAccuracyTimeSynch = function (callback_func, tag) { obj.Exec('AMT_TimeSynchronizationService', 'GetLowAccuracyTimeSynch', {}, callback_func, tag); }
    obj.AMT_TimeSynchronizationService_SetHighAccuracyTimeSynch = function (Ta0, Tm1, Tm2, callback_func, tag) { obj.Exec('AMT_TimeSynchronizationService', 'SetHighAccuracyTimeSynch', { 'Ta0': Ta0, 'Tm1': Tm1, 'Tm2': Tm2 }, callback_func, tag); }
    obj.AMT_UserInitiatedConnectionService_RequestStateChange = function (RequestedState, TimeoutPeriod, callback_func) { obj.Exec('AMT_UserInitiatedConnectionService', 'RequestStateChange', { 'RequestedState': RequestedState, 'TimeoutPeriod': TimeoutPeriod }, callback_func); }
    obj.AMT_WebUIService_RequestStateChange = function (RequestedState, TimeoutPeriod, callback_func) { obj.Exec('AMT_WebUIService', 'RequestStateChange', { 'RequestedState': RequestedState, 'TimeoutPeriod': TimeoutPeriod }, callback_func); }
    obj.AMT_WiFiPortConfigurationService_AddWiFiSettings = function (WiFiEndpoint, WiFiEndpointSettingsInput, IEEE8021xSettingsInput, ClientCredential, CACredential, callback_func) {
        console.log(JSON.stringify({ "WiFiEndpoint": WiFiEndpoint, "WiFiEndpointSettingsInput": WiFiEndpointSettingsInput, "IEEE8021xSettingsInput": IEEE8021xSettingsInput, "ClientCredential": ClientCredential, "CACredential": CACredential }, null, 2));
        obj.ExecWithXml('AMT_WiFiPortConfigurationService', 'AddWiFiSettings', { 'WiFiEndpoint': WiFiEndpoint, 'WiFiEndpointSettingsInput': WiFiEndpointSettingsInput, 'IEEE8021xSettingsInput': IEEE8021xSettingsInput, 'ClientCredential': ClientCredential, 'CACredential': CACredential }, callback_func);
    }
    obj.AMT_WiFiPortConfigurationService_UpdateWiFiSettings = function (WiFiEndpointSettings, WiFiEndpointSettingsInput, IEEE8021xSettingsInput, ClientCredential, CACredential, callback_func) { obj.ExecWithXml('AMT_WiFiPortConfigurationService', 'UpdateWiFiSettings', { 'WiFiEndpointSettings': WiFiEndpointSettings, 'WiFiEndpointSettingsInput': WiFiEndpointSettingsInput, 'IEEE8021xSettingsInput': IEEE8021xSettingsInput, 'ClientCredential': ClientCredential, 'CACredential': CACredential }, callback_func); }
    obj.AMT_WiFiPortConfigurationService_DeleteAllITProfiles = function (_method_dummy, callback_func) { obj.Exec('AMT_WiFiPortConfigurationService', 'DeleteAllITProfiles', { '_method_dummy': _method_dummy }, callback_func); }
    obj.AMT_WiFiPortConfigurationService_DeleteAllUserProfiles = function (_method_dummy, callback_func) { obj.Exec('AMT_WiFiPortConfigurationService', 'DeleteAllUserProfiles', { '_method_dummy': _method_dummy }, callback_func); }
    obj.CIM_Account_RequestStateChange = function (RequestedState, TimeoutPeriod, callback_func) { obj.Exec('CIM_Account', 'RequestStateChange', { 'RequestedState': RequestedState, 'TimeoutPeriod': TimeoutPeriod }, callback_func); }
    obj.CIM_AccountManagementService_CreateAccount = function (System, AccountTemplate, callback_func) { obj.Exec('CIM_AccountManagementService', 'CreateAccount', { 'System': System, 'AccountTemplate': AccountTemplate }, callback_func); }
    obj.CIM_BootConfigSetting_ChangeBootOrder = function (Source, callback_func) { obj.Exec('CIM_BootConfigSetting', 'ChangeBootOrder', { 'Source': Source }, callback_func); }
    obj.CIM_BootService_SetBootConfigRole = function (BootConfigSetting, Role, callback_func) { obj.Exec('CIM_BootService', 'SetBootConfigRole', { 'BootConfigSetting': BootConfigSetting, 'Role': Role }, callback_func, 0, 1); }
    obj.CIM_BootService_RequestStateChange = function (RequestedState, TimeoutPeriod, callback_func, tag) { obj.Exec('CIM_BootService', 'RequestStateChange', { 'RequestedState': RequestedState, 'TimeoutPeriod': TimeoutPeriod }, callback_func, tag, 1); }
    obj.CIM_Card_ConnectorPower = function (Connector, PoweredOn, callback_func) { obj.Exec('CIM_Card', 'ConnectorPower', { 'Connector': Connector, 'PoweredOn': PoweredOn }, callback_func); }
    obj.CIM_Card_IsCompatible = function (ElementToCheck, callback_func) { obj.Exec('CIM_Card', 'IsCompatible', { 'ElementToCheck': ElementToCheck }, callback_func); }
    obj.CIM_Chassis_IsCompatible = function (ElementToCheck, callback_func) { obj.Exec('CIM_Chassis', 'IsCompatible', { 'ElementToCheck': ElementToCheck }, callback_func); }
    obj.CIM_Fan_SetSpeed = function (DesiredSpeed, callback_func) { obj.Exec('CIM_Fan', 'SetSpeed', { 'DesiredSpeed': DesiredSpeed }, callback_func); }
    obj.CIM_KVMRedirectionSAP_RequestStateChange = function (RequestedState, TimeoutPeriod, callback_func) { obj.Exec('CIM_KVMRedirectionSAP', 'RequestStateChange', { 'RequestedState': RequestedState/*, 'TimeoutPeriod': TimeoutPeriod */}, callback_func); }
    obj.CIM_MediaAccessDevice_LockMedia = function (Lock, callback_func) { obj.Exec('CIM_MediaAccessDevice', 'LockMedia', { 'Lock': Lock }, callback_func); }
    obj.CIM_MediaAccessDevice_SetPowerState = function (PowerState, Time, callback_func) { obj.Exec('CIM_MediaAccessDevice', 'SetPowerState', { 'PowerState': PowerState, 'Time': Time }, callback_func); }
    obj.CIM_MediaAccessDevice_Reset = function (callback_func) { obj.Exec('CIM_MediaAccessDevice', 'Reset', {}, callback_func); }
    obj.CIM_MediaAccessDevice_EnableDevice = function (Enabled, callback_func) { obj.Exec('CIM_MediaAccessDevice', 'EnableDevice', { 'Enabled': Enabled }, callback_func); }
    obj.CIM_MediaAccessDevice_OnlineDevice = function (Online, callback_func) { obj.Exec('CIM_MediaAccessDevice', 'OnlineDevice', { 'Online': Online }, callback_func); }
    obj.CIM_MediaAccessDevice_QuiesceDevice = function (Quiesce, callback_func) { obj.Exec('CIM_MediaAccessDevice', 'QuiesceDevice', { 'Quiesce': Quiesce }, callback_func); }
    obj.CIM_MediaAccessDevice_SaveProperties = function (callback_func) { obj.Exec('CIM_MediaAccessDevice', 'SaveProperties', {}, callback_func); }
    obj.CIM_MediaAccessDevice_RestoreProperties = function (callback_func) { obj.Exec('CIM_MediaAccessDevice', 'RestoreProperties', {}, callback_func); }
    obj.CIM_MediaAccessDevice_RequestStateChange = function (RequestedState, TimeoutPeriod, callback_func) { obj.Exec('CIM_MediaAccessDevice', 'RequestStateChange', { 'RequestedState': RequestedState, 'TimeoutPeriod': TimeoutPeriod }, callback_func); }
    obj.CIM_PhysicalFrame_IsCompatible = function (ElementToCheck, callback_func) { obj.Exec('CIM_PhysicalFrame', 'IsCompatible', { 'ElementToCheck': ElementToCheck }, callback_func); }
    obj.CIM_PhysicalPackage_IsCompatible = function (ElementToCheck, callback_func) { obj.Exec('CIM_PhysicalPackage', 'IsCompatible', { 'ElementToCheck': ElementToCheck }, callback_func); }
    obj.CIM_PowerManagementService_RequestPowerStateChange = function (PowerState, ManagedElement, Time, TimeoutPeriod, callback_func) { obj.Exec('CIM_PowerManagementService', 'RequestPowerStateChange', { 'PowerState': PowerState, 'ManagedElement': ManagedElement, 'Time': Time, 'TimeoutPeriod': TimeoutPeriod }, callback_func, 0, 1); }
    obj.CIM_PowerSupply_SetPowerState = function (PowerState, Time, callback_func) { obj.Exec('CIM_PowerSupply', 'SetPowerState', { 'PowerState': PowerState, 'Time': Time }, callback_func); }
    obj.CIM_PowerSupply_Reset = function (callback_func) { obj.Exec('CIM_PowerSupply', 'Reset', {}, callback_func); }
    obj.CIM_PowerSupply_EnableDevice = function (Enabled, callback_func) { obj.Exec('CIM_PowerSupply', 'EnableDevice', { 'Enabled': Enabled }, callback_func); }
    obj.CIM_PowerSupply_OnlineDevice = function (Online, callback_func) { obj.Exec('CIM_PowerSupply', 'OnlineDevice', { 'Online': Online }, callback_func); }
    obj.CIM_PowerSupply_QuiesceDevice = function (Quiesce, callback_func) { obj.Exec('CIM_PowerSupply', 'QuiesceDevice', { 'Quiesce': Quiesce }, callback_func); }
    obj.CIM_PowerSupply_SaveProperties = function (callback_func) { obj.Exec('CIM_PowerSupply', 'SaveProperties', {}, callback_func); }
    obj.CIM_PowerSupply_RestoreProperties = function (callback_func) { obj.Exec('CIM_PowerSupply', 'RestoreProperties', {}, callback_func); }
    obj.CIM_PowerSupply_RequestStateChange = function (RequestedState, TimeoutPeriod, callback_func) { obj.Exec('CIM_PowerSupply', 'RequestStateChange', { 'RequestedState': RequestedState, 'TimeoutPeriod': TimeoutPeriod }, callback_func); }
    obj.CIM_Processor_SetPowerState = function (PowerState, Time, callback_func) { obj.Exec('CIM_Processor', 'SetPowerState', { 'PowerState': PowerState, 'Time': Time }, callback_func); }
    obj.CIM_Processor_Reset = function (callback_func) { obj.Exec('CIM_Processor', 'Reset', {}, callback_func); }
    obj.CIM_Processor_EnableDevice = function (Enabled, callback_func) { obj.Exec('CIM_Processor', 'EnableDevice', { 'Enabled': Enabled }, callback_func); }
    obj.CIM_Processor_OnlineDevice = function (Online, callback_func) { obj.Exec('CIM_Processor', 'OnlineDevice', { 'Online': Online }, callback_func); }
    obj.CIM_Processor_QuiesceDevice = function (Quiesce, callback_func) { obj.Exec('CIM_Processor', 'QuiesceDevice', { 'Quiesce': Quiesce }, callback_func); }
    obj.CIM_Processor_SaveProperties = function (callback_func) { obj.Exec('CIM_Processor', 'SaveProperties', {}, callback_func); }
    obj.CIM_Processor_RestoreProperties = function (callback_func) { obj.Exec('CIM_Processor', 'RestoreProperties', {}, callback_func); }
    obj.CIM_Processor_RequestStateChange = function (RequestedState, TimeoutPeriod, callback_func) { obj.Exec('CIM_Processor', 'RequestStateChange', { 'RequestedState': RequestedState, 'TimeoutPeriod': TimeoutPeriod }, callback_func); }
    obj.CIM_RecordLog_ClearLog = function (callback_func) { obj.Exec('CIM_RecordLog', 'ClearLog', {}, callback_func); }
    obj.CIM_RecordLog_RequestStateChange = function (RequestedState, TimeoutPeriod, callback_func) { obj.Exec('CIM_RecordLog', 'RequestStateChange', { 'RequestedState': RequestedState, 'TimeoutPeriod': TimeoutPeriod }, callback_func); }
    obj.CIM_RedirectionService_RequestStateChange = function (RequestedState, TimeoutPeriod, callback_func) { obj.Exec('CIM_RedirectionService', 'RequestStateChange', { 'RequestedState': RequestedState, 'TimeoutPeriod': TimeoutPeriod }, callback_func); }
    obj.CIM_Sensor_SetPowerState = function (PowerState, Time, callback_func) { obj.Exec('CIM_Sensor', 'SetPowerState', { 'PowerState': PowerState, 'Time': Time }, callback_func); }
    obj.CIM_Sensor_Reset = function (callback_func) { obj.Exec('CIM_Sensor', 'Reset', {}, callback_func); }
    obj.CIM_Sensor_EnableDevice = function (Enabled, callback_func) { obj.Exec('CIM_Sensor', 'EnableDevice', { 'Enabled': Enabled }, callback_func); }
    obj.CIM_Sensor_OnlineDevice = function (Online, callback_func) { obj.Exec('CIM_Sensor', 'OnlineDevice', { 'Online': Online }, callback_func); }
    obj.CIM_Sensor_QuiesceDevice = function (Quiesce, callback_func) { obj.Exec('CIM_Sensor', 'QuiesceDevice', { 'Quiesce': Quiesce }, callback_func); }
    obj.CIM_Sensor_SaveProperties = function (callback_func) { obj.Exec('CIM_Sensor', 'SaveProperties', {}, callback_func); }
    obj.CIM_Sensor_RestoreProperties = function (callback_func) { obj.Exec('CIM_Sensor', 'RestoreProperties', {}, callback_func); }
    obj.CIM_Sensor_RequestStateChange = function (RequestedState, TimeoutPeriod, callback_func) { obj.Exec('CIM_Sensor', 'RequestStateChange', { 'RequestedState': RequestedState, 'TimeoutPeriod': TimeoutPeriod }, callback_func); }
    obj.CIM_StatisticalData_ResetSelectedStats = function (SelectedStatistics, callback_func) { obj.Exec('CIM_StatisticalData', 'ResetSelectedStats', { 'SelectedStatistics': SelectedStatistics }, callback_func); }
    obj.CIM_Watchdog_KeepAlive = function (callback_func) { obj.Exec('CIM_Watchdog', 'KeepAlive', {}, callback_func); }
    obj.CIM_Watchdog_SetPowerState = function (PowerState, Time, callback_func) { obj.Exec('CIM_Watchdog', 'SetPowerState', { 'PowerState': PowerState, 'Time': Time }, callback_func); }
    obj.CIM_Watchdog_Reset = function (callback_func) { obj.Exec('CIM_Watchdog', 'Reset', {}, callback_func); }
    obj.CIM_Watchdog_EnableDevice = function (Enabled, callback_func) { obj.Exec('CIM_Watchdog', 'EnableDevice', { 'Enabled': Enabled }, callback_func); }
    obj.CIM_Watchdog_OnlineDevice = function (Online, callback_func) { obj.Exec('CIM_Watchdog', 'OnlineDevice', { 'Online': Online }, callback_func); }
    obj.CIM_Watchdog_QuiesceDevice = function (Quiesce, callback_func) { obj.Exec('CIM_Watchdog', 'QuiesceDevice', { 'Quiesce': Quiesce }, callback_func); }
    obj.CIM_Watchdog_SaveProperties = function (callback_func) { obj.Exec('CIM_Watchdog', 'SaveProperties', {}, callback_func); }
    obj.CIM_Watchdog_RestoreProperties = function (callback_func) { obj.Exec('CIM_Watchdog', 'RestoreProperties', {}, callback_func); }
    obj.CIM_Watchdog_RequestStateChange = function (RequestedState, TimeoutPeriod, callback_func) { obj.Exec('CIM_Watchdog', 'RequestStateChange', { 'RequestedState': RequestedState, 'TimeoutPeriod': TimeoutPeriod }, callback_func); }
    obj.CIM_WiFiPort_SetPowerState = function (PowerState, Time, callback_func) { obj.Exec('CIM_WiFiPort', 'SetPowerState', { 'PowerState': PowerState, 'Time': Time }, callback_func); }
    obj.CIM_WiFiPort_Reset = function (callback_func) { obj.Exec('CIM_WiFiPort', 'Reset', {}, callback_func); }
    obj.CIM_WiFiPort_EnableDevice = function (Enabled, callback_func) { obj.Exec('CIM_WiFiPort', 'EnableDevice', { 'Enabled': Enabled }, callback_func); }
    obj.CIM_WiFiPort_OnlineDevice = function (Online, callback_func) { obj.Exec('CIM_WiFiPort', 'OnlineDevice', { 'Online': Online }, callback_func); }
    obj.CIM_WiFiPort_QuiesceDevice = function (Quiesce, callback_func) { obj.Exec('CIM_WiFiPort', 'QuiesceDevice', { 'Quiesce': Quiesce }, callback_func); }
    obj.CIM_WiFiPort_SaveProperties = function (callback_func) { obj.Exec('CIM_WiFiPort', 'SaveProperties', {}, callback_func); }
    obj.CIM_WiFiPort_RestoreProperties = function (callback_func) { obj.Exec('CIM_WiFiPort', 'RestoreProperties', {}, callback_func); }
    obj.CIM_WiFiPort_RequestStateChange = function (RequestedState, TimeoutPeriod, callback_func) { obj.Exec('CIM_WiFiPort', 'RequestStateChange', { 'RequestedState': RequestedState, 'TimeoutPeriod': TimeoutPeriod }, callback_func); }
    obj.IPS_HostBasedSetupService_Setup = function (NetAdminPassEncryptionType, NetworkAdminPassword, McNonce, Certificate, SigningAlgorithm, DigitalSignature, callback_func) { obj.Exec('IPS_HostBasedSetupService', 'Setup', { 'NetAdminPassEncryptionType': NetAdminPassEncryptionType, 'NetworkAdminPassword': NetworkAdminPassword, 'McNonce': McNonce, 'Certificate': Certificate, 'SigningAlgorithm': SigningAlgorithm, 'DigitalSignature': DigitalSignature }, callback_func); }
    obj.IPS_HostBasedSetupService_AddNextCertInChain = function (NextCertificate, IsLeafCertificate, IsRootCertificate, callback_func) { obj.Exec('IPS_HostBasedSetupService', 'AddNextCertInChain', { 'NextCertificate': NextCertificate, 'IsLeafCertificate': IsLeafCertificate, 'IsRootCertificate': IsRootCertificate }, callback_func); }
    obj.IPS_HostBasedSetupService_AdminSetup = function (NetAdminPassEncryptionType, NetworkAdminPassword, McNonce, SigningAlgorithm, DigitalSignature, callback_func) { obj.Exec('IPS_HostBasedSetupService', 'AdminSetup', { 'NetAdminPassEncryptionType': NetAdminPassEncryptionType, 'NetworkAdminPassword': NetworkAdminPassword, 'McNonce': McNonce, 'SigningAlgorithm': SigningAlgorithm, 'DigitalSignature': DigitalSignature }, callback_func); }
    obj.IPS_HostBasedSetupService_UpgradeClientToAdmin = function (McNonce, SigningAlgorithm, DigitalSignature, callback_func) { obj.Exec('IPS_HostBasedSetupService', 'UpgradeClientToAdmin', { 'McNonce': McNonce, 'SigningAlgorithm': SigningAlgorithm, 'DigitalSignature': DigitalSignature }, callback_func); }
    obj.IPS_HostBasedSetupService_DisableClientControlMode = function (_method_dummy, callback_func) { obj.Exec('IPS_HostBasedSetupService', 'DisableClientControlMode', { '_method_dummy': _method_dummy }, callback_func); }
    obj.IPS_KVMRedirectionSettingData_TerminateSession = function (callback_func) { obj.Exec('IPS_KVMRedirectionSettingData', 'TerminateSession', {}, callback_func); }
    obj.IPS_KVMRedirectionSettingData_DataChannelRead = function (callback_func) { obj.Exec('IPS_KVMRedirectionSettingData', 'DataChannelRead', {}, callback_func); }
    obj.IPS_KVMRedirectionSettingData_DataChannelWrite = function (Data, callback_func) { obj.Exec('IPS_KVMRedirectionSettingData', 'DataChannelWrite', { 'DataMessage': Data }, callback_func); }
    obj.IPS_OptInService_StartOptIn = function (callback_func) { obj.Exec('IPS_OptInService', 'StartOptIn', {}, callback_func); }
    obj.IPS_OptInService_CancelOptIn = function (callback_func) { obj.Exec('IPS_OptInService', 'CancelOptIn', {}, callback_func); }
    obj.IPS_OptInService_SendOptInCode = function (OptInCode, callback_func) { obj.Exec('IPS_OptInService', 'SendOptInCode', { 'OptInCode': OptInCode }, callback_func); }
    obj.IPS_OptInService_StartService = function (callback_func) { obj.Exec('IPS_OptInService', 'StartService', {}, callback_func); }
    obj.IPS_OptInService_StopService = function (callback_func) { obj.Exec('IPS_OptInService', 'StopService', {}, callback_func); }
    obj.IPS_OptInService_RequestStateChange = function (RequestedState, TimeoutPeriod, callback_func) { obj.Exec('IPS_OptInService', 'RequestStateChange', { 'RequestedState': RequestedState, 'TimeoutPeriod': TimeoutPeriod }, callback_func); }
    obj.IPS_PowerManagementService_RequestOSPowerSavingStateChange = function (PowerState, ManagedElement, Time, TimeoutPeriod, callback_func) { obj.Exec('IPS_PowerManagementService', 'RequestOSPowerSavingStateChange', { 'OSPowerSavingState': PowerState, 'ManagedElement': ManagedElement, 'Time': Time, 'TimeoutPeriod': TimeoutPeriod }, callback_func, 0, 1); }
    obj.IPS_ProvisioningRecordLog_RequestStateChange = function (RequestedState, TimeoutPeriod, callback_func) { obj.Exec('IPS_ProvisioningRecordLog', 'RequestStateChange', { 'RequestedState': RequestedState, 'TimeoutPeriod': TimeoutPeriod }, callback_func); }
    obj.IPS_ProvisioningRecordLog_ClearLog = function (_method_dummy, callback_func) { obj.Exec('IPS_ProvisioningRecordLog', 'ClearLog', { '_method_dummy': _method_dummy }, callback_func); }
    obj.IPS_ScreenConfigurationService_SetSessionState = function (SessionState, ConsecutiveRebootsNum, callback_func) { obj.Exec('IPS_ScreenConfigurationService', 'SetSessionState', { 'SessionState': SessionState, 'ConsecutiveRebootsNum': ConsecutiveRebootsNum }, callback_func); }
    obj.IPS_SecIOService_RequestStateChange = function (RequestedState, TimeoutPeriod, callback_func) { obj.Exec('IPS_SecIOService', 'RequestStateChange', { 'RequestedState': RequestedState, 'TimeoutPeriod': TimeoutPeriod }, callback_func); }
    obj.IPS_HTTPProxyService_AddProxyAccessPoint = function (AccessInfo, InfoFormat, Port, NetworkDnsSuffix, callback_func) { obj.Exec('IPS_HTTPProxyService', 'AddProxyAccessPoint', { 'AccessInfo': AccessInfo, 'InfoFormat': InfoFormat, 'Port': Port, 'NetworkDnsSuffix': NetworkDnsSuffix }, callback_func); }

    obj.AmtStatusToStr = function (code) { if (obj.AmtStatusCodes[code]) return obj.AmtStatusCodes[code]; else return 'UNKNOWN_ERROR' }
    obj.AmtStatusCodes = {
        0x0000: 'SUCCESS',
        0x0001: 'INTERNAL_ERROR',
        0x0002: 'NOT_READY',
        0x0003: 'INVALID_PT_MODE',
        0x0004: 'INVALID_MESSAGE_LENGTH',
        0x0005: 'TABLE_FINGERPRINT_NOT_AVAILABLE',
        0x0006: 'INTEGRITY_CHECK_FAILED',
        0x0007: 'UNSUPPORTED_ISVS_VERSION',
        0x0008: 'APPLICATION_NOT_REGISTERED',
        0x0009: 'INVALID_REGISTRATION_DATA',
        0x000A: 'APPLICATION_DOES_NOT_EXIST',
        0x000B: 'NOT_ENOUGH_STORAGE',
        0x000C: 'INVALID_NAME',
        0x000D: 'BLOCK_DOES_NOT_EXIST',
        0x000E: 'INVALID_BYTE_OFFSET',
        0x000F: 'INVALID_BYTE_COUNT',
        0x0010: 'NOT_PERMITTED',
        0x0011: 'NOT_OWNER',
        0x0012: 'BLOCK_LOCKED_BY_OTHER',
        0x0013: 'BLOCK_NOT_LOCKED',
        0x0014: 'INVALID_GROUP_PERMISSIONS',
        0x0015: 'GROUP_DOES_NOT_EXIST',
        0x0016: 'INVALID_MEMBER_COUNT',
        0x0017: 'MAX_LIMIT_REACHED',
        0x0018: 'INVALID_AUTH_TYPE',
        0x0019: 'AUTHENTICATION_FAILED',
        0x001A: 'INVALID_DHCP_MODE',
        0x001B: 'INVALID_IP_ADDRESS',
        0x001C: 'INVALID_DOMAIN_NAME',
        0x001D: 'UNSUPPORTED_VERSION',
        0x001E: 'REQUEST_UNEXPECTED',
        0x001F: 'INVALID_TABLE_TYPE',
        0x0020: 'INVALID_PROVISIONING_STATE',
        0x0021: 'UNSUPPORTED_OBJECT',
        0x0022: 'INVALID_TIME',
        0x0023: 'INVALID_INDEX',
        0x0024: 'INVALID_PARAMETER',
        0x0025: 'INVALID_NETMASK',
        0x0026: 'FLASH_WRITE_LIMIT_EXCEEDED',
        0x0027: 'INVALID_IMAGE_LENGTH',
        0x0028: 'INVALID_IMAGE_SIGNATURE',
        0x0029: 'PROPOSE_ANOTHER_VERSION',
        0x002A: 'INVALID_PID_FORMAT',
        0x002B: 'INVALID_PPS_FORMAT',
        0x002C: 'BIST_COMMAND_BLOCKED',
        0x002D: 'CONNECTION_FAILED',
        0x002E: 'CONNECTION_TOO_MANY',
        0x002F: 'RNG_GENERATION_IN_PROGRESS',
        0x0030: 'RNG_NOT_READY',
        0x0031: 'CERTIFICATE_NOT_READY',
        0x0400: 'DISABLED_BY_POLICY',
        0x0800: 'NETWORK_IF_ERROR_BASE',
        0x0801: 'UNSUPPORTED_OEM_NUMBER',
        0x0802: 'UNSUPPORTED_BOOT_OPTION',
        0x0803: 'INVALID_COMMAND',
        0x0804: 'INVALID_SPECIAL_COMMAND',
        0x0805: 'INVALID_HANDLE',
        0x0806: 'INVALID_PASSWORD',
        0x0807: 'INVALID_REALM',
        0x0808: 'STORAGE_ACL_ENTRY_IN_USE',
        0x0809: 'DATA_MISSING',
        0x080A: 'DUPLICATE',
        0x080B: 'EVENTLOG_FROZEN',
        0x080C: 'PKI_MISSING_KEYS',
        0x080D: 'PKI_GENERATING_KEYS',
        0x080E: 'INVALID_KEY',
        0x080F: 'INVALID_CERT',
        0x0810: 'CERT_KEY_NOT_MATCH',
        0x0811: 'MAX_KERB_DOMAIN_REACHED',
        0x0812: 'UNSUPPORTED',
        0x0813: 'INVALID_PRIORITY',
        0x0814: 'NOT_FOUND',
        0x0815: 'INVALID_CREDENTIALS',
        0x0816: 'INVALID_PASSPHRASE',
        0x0818: 'NO_ASSOCIATION',
        0x081B: 'AUDIT_FAIL',
        0x081C: 'BLOCKING_COMPONENT',
        0x0821: 'USER_CONSENT_REQUIRED',
        0x1000: 'APP_INTERNAL_ERROR',
        0x1001: 'NOT_INITIALIZED',
        0x1002: 'LIB_VERSION_UNSUPPORTED',
        0x1003: 'INVALID_PARAM',
        0x1004: 'RESOURCES',
        0x1005: 'HARDWARE_ACCESS_ERROR',
        0x1006: 'REQUESTOR_NOT_REGISTERED',
        0x1007: 'NETWORK_ERROR',
        0x1008: 'PARAM_BUFFER_TOO_SHORT',
        0x1009: 'COM_NOT_INITIALIZED_IN_THREAD',
        0x100A: 'URL_REQUIRED'
    }

    //
    // Methods used for getting the event log
    //

    obj.GetMessageLog = function (func, tag) {
        obj.AMT_MessageLog_PositionToFirstRecord(_GetMessageLog0, [func, tag, []]);
    }
    function _GetMessageLog0(stack, name, responses, status, tag) {
        if (status != 200 || responses.Body['ReturnValue'] != '0') { tag[0](obj, null, tag[2]); return; }
        obj.AMT_MessageLog_GetRecords(responses.Body['IterationIdentifier'], 390, _GetMessageLog1, tag);
    }
    function _GetMessageLog1(stack, name, responses, status, tag) {
        if (status != 200 || responses.Body['ReturnValue'] != '0') { tag[0](obj, null, tag[2]); return; }
        var i, j, x, e, AmtMessages = tag[2], t = new Date(), TimeStamp, ra = responses.Body['RecordArray'];
        if (typeof ra === 'string') { responses.Body['RecordArray'] = [responses.Body['RecordArray']]; }

        for (i in ra) {
            e = null;
            try {
                // ###BEGIN###{!Mode-MeshCentral2}
                // NodeJS detection
                var isNode = new Function('try {return this===global;}catch(e){return false;}');
                if (isNode()) { e = require('atob')(ra[i]); } else { e = window.atob(ra[i]); }
                // ###END###{!Mode-MeshCentral2}
                // ###BEGIN###{Mode-MeshCentral2}
                e = window.atob(ra[i]);
                // ###END###{Mode-MeshCentral2}
            } catch (ex) { }
            if (e != null) {
                TimeStamp = ReadIntX(e, 0);
                if ((TimeStamp > 0) && (TimeStamp < 0xFFFFFFFF)) {
                    x = { 'DeviceAddress': e.charCodeAt(4), 'EventSensorType': e.charCodeAt(5), 'EventType': e.charCodeAt(6), 'EventOffset': e.charCodeAt(7), 'EventSourceType': e.charCodeAt(8), 'EventSeverity': e.charCodeAt(9), 'SensorNumber': e.charCodeAt(10), 'Entity': e.charCodeAt(11), 'EntityInstance': e.charCodeAt(12), 'EventData': [], 'Time': new Date((TimeStamp + (t.getTimezoneOffset() * 60)) * 1000) };
                    for (j = 13; j < 21; j++) { x['EventData'].push(e.charCodeAt(j)); }
                    x['EntityStr'] = _SystemEntityTypes[x['Entity']];
                    x['Desc'] = _GetEventDetailStr(x['EventSensorType'], x['EventOffset'], x['EventData'], x['Entity']);
                    if (!x['EntityStr']) x['EntityStr'] = 'Unknown';
                    AmtMessages.push(x);
                }
            }
        }

        if (responses.Body['NoMoreRecords'] != true) { obj.AMT_MessageLog_GetRecords(responses.Body['IterationIdentifier'], 390, _GetMessageLog1, [tag[0], AmtMessages, tag[2]]); } else { tag[0](obj, AmtMessages, tag[2]); }
    }

    var _EventTrapSourceTypes = "Micrologiciel de la plate-forme (par exemple BIOS) | Gestionnaire SMI | Logiciel de gestion de système ISV | Alerte ASIC | IPMI | Fournisseur de BIOS | Fournisseur de jeu de cartes système | Intégrateur de système | Complément tiers | OSV | NIC | Carte de gestion de système".split('|');
    var _SystemFirmwareError = "Non spécifié. | Aucune mémoire système n'est physiquement installée dans le système. | Aucune mémoire système utilisable, toute la mémoire installée a rencontré une défaillance irrécupérable. | Défaillance irrécupérable du disque dur / ATAPI / IDE. | Défaillance irrécupérable de la carte système. | Disquette irrécupérable échec du sous-système. | Échec du contrôleur de disque dur irrécupérable. | Échec du clavier PS / 2 ou USB irrécupérable. | Support de démarrage amovible introuvable. | Échec du contrôleur vidéo irrécupérable. | Aucun périphérique vidéo détecté. | Corruption de la ROM du micrologiciel (BIOS) détectée. | Inadéquation de la tension du processeur (les processeurs qui partagent la même alimentation ont des exigences de tension non adaptées) | Échec de correspondance de la vitesse du processeur".split('|');
    var _SystemFirmwareProgress = "Unspecified.|Memory initialization.|Starting hard-disk initialization and test|Secondary processor(s) initialization|User authentication|Entering BIOS setup|USB resource configuration|PCI resource configuration|Option ROM initialization|Video initialization|Cache initialization|SM Bus initialization|Keyboard controller initialization|Embedded controller/management controller initialization|Docking station attachment|Enabling docking station|Docking station ejection|Disabling docking station|Calling operating system wake-up vector|Starting operating system boot process|Baseboard or motherboard initialization|reserved|Floppy initialization|Keyboard test|Pointing device test|Primary processor initialization".split('|');
    var _SystemEntityTypes = "Non spécifié | Autre | Inconnu | Processeur | Disque | Périphérique | Module de gestion du système | Carte système | Module de mémoire | Module processeur | Alimentation électrique | Ajouter dans la carte | Carte du panneau avant | Carte du panneau arrière | Carte du système d'alimentation | Fond de panier du lecteur | Expansion interne du système carte | Autre carte système | Carte processeur | Unité d'alimentation | Module d'alimentation | Carte de gestion de l'alimentation | Carte du panneau arrière du châssis | Châssis système | Châssis secondaire | Autre carte de châssis | Baie d'unité de disque | Baie périphérique | Baie de périphérique | Refroidissement par ventilateur | Unité de refroidissement | Interconnexion par câble | Périphérique mémoire | Logiciel de gestion du système | BIOS | Intel (r) ME | Bus système | Groupe | Intel (r) ME | Environnement externe | Batterie | Lame de traitement | Commutateur de connectivité | Processeur / module de mémoire | Module d'E / S | Module d'E / S du processeur | Micrologiciel du contrôleur de gestion | Canal IPMI | Bus PCI | Bus PCI express | Bus SCSI | Bus SATA / SAS | Bus frontal du processeur".split('|');
    obj.RealmNames = "|| Redirection || Asset Hardware | Remote Control | Storage | Event Manager | Storage Admin | Agent Presence Local | Agent Presence Remote | Disjoncteur | Time Network | Information générale | Firmware Update | EIT | LocalUN | Endpoint Access Control | Endpoint Access Control Admin | Lecteur de journal des événements | Journal d'audit | Domaine ACL ||| Système local".split('|');
    obj.WatchdogCurrentStates = { 1: "Pas commencé", 2: "Arrêté", 4: "Fonctionnement", 8: "Expiré", 16: "Suspendu" };
    var _OCRProgressEvents = ["Boot parameters received from CSME", "CSME Boot Option % added successfully", "HTTPS URI name resolved", "HTTPS connected successfully", "HTTPSBoot download is completed", "Attempt to boot", "Exit boot services"];
    var _OCRErrorEvents = ['', "No network connection available", "Name resolution of URI failed", "Connect to URI failed", "OEM app not found at local URI", "HTTPS TLS Auth failed", "HTTPS Digest Auth failed", "Verified boot failed (bad image)", "HTTPS Boot File not found"];
    var _OCRSource = { 1: '', 2: "HTTPS", 4: "Local PBA", 8: "WinRE" };

    function _GetEventDetailStr(eventSensorType, eventOffset, eventDataField, entity) {
        if (eventSensorType == 15) {
            if (eventDataField[0] == 235) return "Données invalides";
            if (eventOffset == 0) {
                return _SystemFirmwareError[eventDataField[1]];
            } else if (eventOffset == 3) {
                if ((eventDataField[0] == 170) && (eventDataField[1] == 48)) {
                    return format("One Click Recovery: {0}", _OCRErrorEvents[eventDataField[2]]);
                } else if ((eventDataField[0] == 170) && (eventDataField[1] == 64)) {
                    if (eventDataField[2] == 1) return "Got an error erasing Device SSD";
                    if (eventDataField[2] == 2) return "Erasing Device TPM is not supported";
                    if (eventDataField[2] == 3) return "Reached Max Counter";
                } else {
                    return "OEM Specific Firmware Error event";
                }
            } else if (eventOffset == 5) {
                if ((eventDataField[0] == 170) && (eventDataField[1] == 48)) {
                    if (eventDataField[2] == 1) {
                        return format("One Click Recovery: CSME Boot Option {0}:{1} added successfully", (eventDataField[3]), _OCRSource[(eventDataField[3])]);
                    } else if (eventDataField[2] < 7) {
                        return format("One Click Recovery: {0}", _OCRProgressEvents[eventDataField[2]]);
                    } else {
                        return format("One Click Recovery: Unknown progress event {0}", eventDataField[2]);
                    }
                } else if ((eventDataField[0] == 170) && (eventDataField[1] == 64)) {
                    if (eventDataField[2] == 1) {
                        if (eventDataField[3] == 2) return "Started erasing Device SSD";
                        if (eventDataField[3] == 3) return "Started erasing Device TPM";
                        if (eventDataField[3] == 5) return "Started erasing Device BIOS Reload of Golden Config";
                    }
                    if (eventDataField[2] == 2) {
                        if (eventDataField[3] == 2) return "Erasing Device SSD ended successfully";
                        if (eventDataField[3] == 3) return "Erasing Device TPM ended successfully";
                        if (eventDataField[3] == 5) return "Erasing Device BIOS Reload of Golden Config ended successfully";
                    }
                    if (eventDataField[2] == 3) return "Beginning Platform Erase";
                    if (eventDataField[2] == 4) return "Clear Reserved Parameters";
                    if (eventDataField[2] == 5) return "All setting decremented";
                } else {
                    return "OEM Specific Firmware Progress event";
                }
            } else {
                return _SystemFirmwareProgress[eventDataField[1]];
            }
        }

        if ((eventSensorType == 18) && (eventDataField[0] == 170)) { // System watchdog event
            return "Agent de surveillance" + char2hex(eventDataField[4]) + char2hex(eventDataField[3]) + char2hex(eventDataField[2]) + char2hex(eventDataField[1]) + '-' + char2hex(eventDataField[6]) + char2hex(eventDataField[5]) + '-...' + " changé en" + obj.WatchdogCurrentStates[eventDataField[7]];
        }

        if ((eventSensorType == 5) && (eventOffset == 0)) { // System chassis
            return "Intrusion de cas";
        }

        if ((eventSensorType == 192) && (eventOffset == 0) && (eventDataField[0] == 170) && (eventDataField[1] == 48))
        {
            if (eventDataField[2] == 0) return "Une session Serial Over LAN distante a été établie.";
            if (eventDataField[2] == 1) return "La session Serial Over LAN à distance est terminée. Le contrôle utilisateur a été restauré.";
            if (eventDataField[2] == 2) return "Une session IDE-Redirection distante a été établie.";
            if (eventDataField[2] == 3) return "Session IDE-Redirection distante terminée. Le contrôle utilisateur a été restauré.";
        }

        if (eventSensorType == 36) {
            var handle = (eventDataField[1] << 24) + (eventDataField[2] << 16) + (eventDataField[3] << 8) + eventDataField[4];
            var nic = '#' + eventDataField[0];
            if (eventDataField[0] == 0xAA) nic = "câblé"; // TODO: Add wireless *****
            //if (eventDataField[0] == 0xAA) nic = "wireless";

            if (handle == 4294967293) { return "Tous les filtres de paquets reçus ont été mis en correspondance sur" + nic + " interface."; }
            if (handle == 4294967292) { return "Tous les filtres de paquets sortants ont été mis en correspondance sur" + nic + " interface."; }
            if (handle == 4294967290) { return "Le filtre de paquets usurpé a été mis en correspondance sur" + nic + " interface."; }
            return "Filtre" + handle + " a été apparié sur" + nic + " interface.";
        }

        if (eventSensorType == 192) {
            if (eventDataField[2] == 0) return "Politique de sécurité invoquée. Une partie ou la totalité du trafic réseau (TX) a été arrêtée.";
            if (eventDataField[2] == 2) return "Politique de sécurité invoquée. Une partie ou la totalité du trafic réseau (RX) a été arrêtée.";
            return "Politique de sécurité invoquée.";
        }

        if (eventSensorType == 193) {
            if ((eventDataField[0] == 0xAA) && (eventDataField[1] == 0x30) && (eventDataField[2] == 0x00) && (eventDataField[3] == 0x00)) { return "Demande de connexion à distance par l'utilisateur."; }
            if ((eventDataField[0] == 0xAA) && (eventDataField[1] == 0x20) && (eventDataField[2] == 0x03) && (eventDataField[3] == 0x01)) { return "Erreur EAC: essayez d'obtenir la posture alors que NAC dans Intel� AMT est désactivé."; } // eventDataField = 0xAA20030100000000
            if ((eventDataField[0] == 0xAA) && (eventDataField[1] == 0x20) && (eventDataField[2] == 0x04) && (eventDataField[3] == 0x00)) { return "Erreur HWA: erreur générale"; } // Used to be "Certificate revoked." but don"t know the source of this.
        }

        if (eventSensorType == 6) return "Authentification échouée" + (eventDataField[1] + (eventDataField[2] << 8)) + " fois. Le système peut être attaqué.";
        if (eventSensorType == 30) return "Pas de support de démarrage";
        if (eventSensorType == 32) return "Blocage du système d'exploitation ou interruption d'alimentation";
        if (eventSensorType == 35) {
            if (eventDataField[0] == 64) return "BIOS POST (Power On Self-Test) Watchdog Timeout."; // 64,2,252,84,89,0,0,0
            return "Échec de démarrage du système";
        }
        if (eventSensorType == 37) return "Le microprogramme du système a démarré (au moins un processeur s’exécute correctement).";
        return "Type de capteur inconnu #" + eventSensorType;
    }

// ###BEGIN###{AuditLog}

    // Useful link: https://software.intel.com/sites/manageability/AMT_Implementation_and_Reference_Guide/default.htm?turl=WordDocuments%2Fsecurityadminevents.htm

    var _AmtAuditStringTable =
    {
        16: "Administrateur de la sécurité",
        17: "RCO",
        18: "Gestionnaire de redirection",
        19: "Gestionnaire de mise à jour du micrologiciel",
        20: "Journal d'audit de sécurité",
        21: "Heure du réseau",
        22: "L'administration du réseau",
        23: "Administration du stockage",
        24: "Responsable de l'événement",
        25: "Gestionnaire de disjoncteurs",
        26: "Gestionnaire de présence d'agent",
        27: "Configuration sans fil",
        28: "EAC",
        29: "KVM",
        30: "Événements de participation des utilisateurs",
        32: "Masquage d'écran",
        33: "Événements de surveillance",
        1600: "Provisioning Started",
        1601: "Approvisionnement terminé",
        1602: "Entrée ACL ajoutée",
        1603: "Entrée ACL modifiée",
        1604: "Entrée ACL supprimée",
        1605: "Accès ACL avec des informations d'identification non valides",
        1606: "État d'entrée ACL",
        1607: "État TLS modifié",
        1608: "Jeu de certificats du serveur TLS",
        1609: "Certificat de serveur TLS Supprimer",
        1610: "Certificat racine sécurisé TLS ajouté",
        1611: "Suppression du certificat racine de confiance TLS",
        1612: "Jeu de clés prépartagées TLS",
        1613: "Paramètres Kerberos modifiés",
        1614: "Clé principale Kerberos modifiée",
        1615: "Réinitialisation des compteurs d'usure du flash",
        1616: "Groupe d'alimentation modifié",
        1617: "Définir le mode d'authentification du domaine",
        1618: "Mettre à niveau le client en mode de contrôle administrateur",
        1619: "Déprovisionnement démarré",
        1700: "Mise sous tension effectuée",
        1701: "Mise hors tension effectuée",
        1702: "Cycle d'alimentation exécuté",
        1703: "Réinitialisation effectuée",
        1704: "Définir les options de démarrage",
        1705: "Remote graceful power down initiated",
        1706: "Remote graceful reset initiated",
        1707: "Remote Standby initiated",
        1708: "Remote Hiberate initiated",
        1709: "Remote NMI initiated",
        1800: "Ouverture de la session IDER",
        1801: "Session IDER fermée",
        1802: "IDER activé",
        1803: "IDER désactivé",
        1804: "Ouverture de la session SoL",
        1805: "Session SoL fermée",
        1806: "SoL activé",
        1807: "SoL désactivé",
        1808: "Session KVM démarrée",
        1809: "Session KVM terminée",
        1810: "KVM activé",
        1811: "KVM désactivé",
        1812: "Le mot de passe VNC a échoué 3 fois",
        1900: "Mise à jour du firmware",
        1901: "Échec de la mise à jour du firmware",
        2000: "Journal d'audit de sécurité effacé",
        2001: "Politique d'audit de sécurité modifiée",
        2002: "Journal d'audit de sécurité désactivé",
        2003: "Journal d'audit de sécurité activé",
        2004: "Journal d'audit de sécurité exporté",
        2005: "Journal d'audit de sécurité récupéré",
        2100: "Intel&reg; ME Time Set",
        2200: "Ensemble de paramètres TCPIP",
        2201: "Ensemble de noms d'hôte",
        2202: "Ensemble de noms de domaine",
        2203: "Ensemble de paramètres VLAN",
        2204: "Ensemble de règles de liaison",
        2205: "Ensemble de paramètres IPv6",
        2300: "Ensemble d'attributs de stockage global",
        2301: "Stockage EACL modifié",
        2302: "Stockage FPACL modifié",
        2303: "Opération d'écriture de stockage",
        2400: "Alerte abonnée",
        2401: "Alerte désinscription",
        2402: "Journal des événements effacé",
        2403: "Journal des événements gelé",
        2500: "Filtre CB ajouté",
        2501: "Filtre CB retiré",
        2502: "Politique CB ajoutée",
        2503: "Politique CB supprimée",
        2504: "Ensemble de règles par défaut CB",
        2505: "Jeu d'options heuristiques CB",
        2506: "État heuristique CB effacé",
        2600: "Agent de surveillance ajouté",
        2601: "Agent de surveillance supprimé",
        2602: "Ensemble d'actions Agent Watchdog",
        2700: "Profil sans fil ajouté",
        2701: "Profil sans fil supprimé",
        2702: "Profil sans fil mis à jour",
        2703: "An existing profile sync was modified",
        2704: "An existing profile link preference was changed",
        2705: "Wireless profile share with UEFI enabled setting was changed",
        2800: "EAC Posture Signer SET",
        2801: "EAC activé",
        2802: "EAC désactivé",
        2803: "État de posture de l'EAC",
        2804: "Options de configuration EAC",
        2900: "Activation KVM activée",
        2901: "Activation KVM désactivée",
        2902: "Mot de passe KVM modifié",
        2903: "Consentement KVM réussi",
        2904: "Échec du consentement KVM",
        3000: "Modification de la politique d'adhésion",
        3001: "Envoyer un événement de code de consentement",
        3002: "Démarrer l'événement bloqué par opt-in",
        3301: "A user has modified the Watchdog Action settings",
        3302: "A user has modified a Watchdog to add, remove, or alter the Watchdog Action connected to it"
    }

    // Return human readable extended audit log data
    // TODO: Just put some of them here, but many more still need to be added, helpful link here:
    // https://software.intel.com/sites/manageability/AMT_Implementation_and_Reference_Guide/default.htm?turl=WordDocuments%2Fsecurityadminevents.htm
    obj.GetAuditLogExtendedDataStr = function (id, data) {
        if ((id == 1602 || id == 1604) && data.charCodeAt(0) == 0) { return data.substring(2, 2 + data.charCodeAt(1)); } // ACL Entry Added/Removed (Digest)
        if (id == 1603) { if (data.charCodeAt(1) == 0) { return data.substring(3); } return null; } // ACL Entry Modified
        if (id == 1605) { return ["Accès ME invalide", "Accès MEBx non valide"][data.charCodeAt(0)]; } // ACL Access with Invalid Credentials
        if (id == 1606) { var r = ["désactivé", "Activée"][data.charCodeAt(0)]; if (data.charCodeAt(1) == 0) { r += "," + data.substring(3); } return r;} // ACL Entry State
        if (id == 1607) { return "Éloigné" + ["NoAuth", "ServerAuth", "MutualAuth"][data.charCodeAt(0)] + ", Local" + ["NoAuth", "ServerAuth", "MutualAuth"][data.charCodeAt(1)]; } // TLS State Changed
        if (id == 1617) { return obj.RealmNames[ReadInt(data, 0)] + "," + ["NoAuth", "Auth", "désactivé"][data.charCodeAt(4)]; } // Set Realm Authentication Mode
        if (id == 1619) { return ["BIOS", "MEBx", "MEI local", "WSMAN local", "WSAMN distant"][data.charCodeAt(0)]; } // Intel AMT Unprovisioning Started
        if (id == 1900) { return "De" + ReadShort(data, 0) + '.' + ReadShort(data, 2) + '.' + ReadShort(data, 4) + '.' + ReadShort(data, 6) + " à" + ReadShort(data, 8) + '.' + ReadShort(data, 10) + '.' + ReadShort(data, 12) + '.' + ReadShort(data, 14); } // Firmware Updated
        if (id == 2100) { var t4 = new Date(); t4.setTime(ReadInt(data, 0) * 1000 + (new Date().getTimezoneOffset() * 60000)); return t4.toLocaleString(); } // Intel AMT Time Set
        if (id == 3000) { return "De" + ["Aucun", "KVM", "Tout"][data.charCodeAt(0)] + " à" + ["Aucun", "KVM", "Tout"][data.charCodeAt(1)]; } // Opt-In Policy Change
        if (id == 3001) { return ["Succès", "Échec 3 fois"][data.charCodeAt(0)]; } // Send Consent Code Event
        return null;
    }

    obj.GetAuditLog = function (func) {
        obj.AMT_AuditLog_ReadRecords(1, _GetAuditLog0, [func, []]);
    }

    function _GetAuditLog0(stack, name, responses, status, tag) {
        if (status != 200) { tag[0](obj, [], status); return; }
        var ptr, i, e, x, r = tag[1], t = new Date(), TimeStamp;

        if (responses.Body['RecordsReturned'] > 0) {
            responses.Body['EventRecords'] = MakeToArray(responses.Body['EventRecords']);

            for (i in responses.Body['EventRecords']) {
                e = null;
                try {
                    e = window.atob(responses.Body['EventRecords'][i]);
                } catch (e) {
                    console.log(e + ' ' + responses.Body['EventRecords'][i])
                }
                x = { 'AuditAppID': ReadShort(e, 0), 'EventID': ReadShort(e, 2), 'InitiatorType': e.charCodeAt(4) };
                x['AuditApp'] = _AmtAuditStringTable[x['AuditAppID']];
                x['Event'] = _AmtAuditStringTable[(x['AuditAppID'] * 100) + x['EventID']];
                if (!x['Event']) x['Event'] = '#' + x['EventID'];

                // Read and process the initiator
                if (x['InitiatorType'] == 0) {
                    // HTTP digest
                    var userlen = e.charCodeAt(5);
                    x['Initiator'] = e.substring(6, 6 + userlen);
                    ptr = 6 + userlen;
                }
                if (x['InitiatorType'] == 1) {
                    // Kerberos
                    x['KerberosUserInDomain'] = ReadInt(e, 5);
                    var userlen = e.charCodeAt(9);
                    x['Initiator'] = GetSidString(e.substring(10, 10 + userlen));
                    ptr = 10 + userlen;
                }
                if (x['InitiatorType'] == 2) {
                    // Local
                    x['Initiator'] = '<i>' + "Local" + '</i>';
                    ptr = 5;
                }
                if (x['InitiatorType'] == 3) {
                    // KVM Default Port
                    x['Initiator'] = '<i>' + "Port par défaut KVM" + '</i>';
                    ptr = 5;
                }

                // Read timestamp
                TimeStamp = ReadInt(e, ptr);
                x['Time'] = new Date((TimeStamp + (t.getTimezoneOffset() * 60)) * 1000);
                ptr += 4;

                // Read network access
                x['MCLocationType'] = e.charCodeAt(ptr++);
                var netlen = e.charCodeAt(ptr++);
                x['NetAddress'] = e.substring(ptr, ptr + netlen);

                // Read extended data
                ptr += netlen;
                var exlen = e.charCodeAt(ptr++);
                x['Ex'] = e.substring(ptr, ptr + exlen);
                x['ExStr'] = obj.GetAuditLogExtendedDataStr((x['AuditAppID'] * 100) + x['EventID'], x['Ex']);

                r.push(x);
            }
        }
        if (responses.Body['TotalRecordCount'] > r.length) {
            obj.AMT_AuditLog_ReadRecords(r.length + 1, _GetAuditLog0, [tag[0], r]);
        } else {
            tag[0](obj, r, status);
        }
    }

    // ###END###{AuditLog}

    return obj;
}


// ###BEGIN###{Certificates}

// Forge MD5
function hex_md5(str) { if (str == null) { str = ''; } return forge.md.md5.create().update(str).digest().toHex(); }

// ###END###{Certificates}

// ###BEGIN###{!Certificates}

// TinyMD5 from https://github.com/jbt/js-crypto

// Perform MD5 setup
var md5_k = [];
for (var i = 0; i < 64;) { md5_k[i] = 0 | (Math.abs(Math.sin(++i)) * 4294967296); }

// Perform MD5 on raw string and return hex
function hex_md5(str) {
    if (str == null) { str = ''; }
    var b, c, d, j,
    x = [],
    str2 = unescape(encodeURI(str)),
    a = str2.length,
    h = [b = 1732584193, c = -271733879, ~b, ~c],
    i = 0;

    for (; i <= a;) x[i >> 2] |= (str2.charCodeAt(i) || 128) << 8 * (i++ % 4);

    x[str = (a + 8 >> 6) * 16 + 14] = a * 8;
    i = 0;

    for (; i < str; i += 16) {
        a = h; j = 0;
        for (; j < 64;) {
            a = [
              d = a[3],
              ((b = a[1] | 0) +
                ((d = (
                  (a[0] +
                    [
                      b & (c = a[2]) | ~b & d,
                      d & b | ~d & c,
                      b ^ c ^ d,
                      c ^ (b | ~d)
                    ][a = j >> 4]
                  ) +
                  (md5_k[j] +
                    (x[[
                      j,
                      5 * j + 1,
                      3 * j + 5,
                      7 * j
                    ][a] % 16 + i] | 0)
                  )
                )) << (a = [
                  7, 12, 17, 22,
                  5, 9, 14, 20,
                  4, 11, 16, 23,
                  6, 10, 15, 21
                ][4 * a + j++ % 4]) | d >>> 32 - a)
              ),
              b,
              c
            ];
        }
        for (j = 4; j;) h[--j] = h[j] + a[j];
    }

    str = '';
    for (; j < 32;) str += ((h[j >> 3] >> ((1 ^ j++ & 7) * 4)) & 15).toString(16);
    return str;
}

// ###END###{!Certificates}

// Perform MD5 on raw string and return raw string result
function rstr_md5(str) { return hex2rstr(hex_md5(str)); }

/*
Convert arguments into selector set and body XML. Used by AMT_WiFiPortConfigurationService_UpdateWiFiSettings.
args = { 
	"WiFiEndpoint": {
		__parameterType: 'reference',
		__resourceUri: 'http://schemas.dmtf.org/wbem/wscim/1/cim-schema/2/CIM_WiFiEndpoint',
		Name: 'WiFi Endpoint 0'
	}, 
	"WiFiEndpointSettingsInput": 
	{
		__parameterType: 'instance',
		__namespace: 'http://schemas.dmtf.org/wbem/wscim/1/cim-schema/2/CIM_WiFiEndpointSettings',
		ElementName: document.querySelector('#editProfile-profileName').value,
		InstanceID: 'Intel(r) AMT:WiFi Endpoint Settings ' + document.querySelector('#editProfile-profileName').value,
		AuthenticationMethod: document.querySelector('#editProfile-networkAuthentication').value,
		//BSSType: 3, // Intel(r) AMT supports only infrastructure networks
		EncryptionMethod: document.querySelector('#editProfile-encryption').value,
		SSID: document.querySelector('#editProfile-networkName').value,
		Priority: 100,
		PSKPassPhrase: document.querySelector('#editProfile-passPhrase').value
	}, 
	"IEEE8021xSettingsInput": null, 
	"ClientCredential": null, 
	"CACredential": null 
}, 
*/
function execArgumentsToXml(args) {
	if ((args === undefined) || (args === null)) return null;
	var result = '';
	for (var argName in args) {
		var arg = args[argName];
		if (!arg) continue;
		if (arg['__parameterType'] === 'reference') { result += referenceToXml(argName, arg); }
		else { result += instanceToXml(argName, arg); }
		//if (arg['__isInstance']) result += instanceToXml(argName, arg);
	}
	return result;
}

/**
 * Convert JavaScript object into XML
 
	<r:WiFiEndpointSettingsInput xmlns:q="http://schemas.dmtf.org/wbem/wscim/1/cim-schema/2/CIM_WiFiEndpointSettings">
		<q:ElementName>Wireless-Profile-Admin</q:ElementName>
		<q:InstanceID>Intel(r) AMT:WiFi Endpoint Settings Wireless-Profile-Admin</q:InstanceID>
		<q:AuthenticationMethod>6</q:AuthenticationMethod>
		<q:EncryptionMethod>4</q:EncryptionMethod>
		<q:Priority>100</q:Priority>
		<q:PSKPassPhrase>xxxxxxxx</q:PSKPassPhrase>
	</r:WiFiEndpointSettingsInput>
 */
function instanceToXml(instanceName, inInstance) {
	if (inInstance === undefined || inInstance === null) return null;
	
	var hasNamespace = !!inInstance['__namespace'];
	var startTag = hasNamespace ? '<q:' : '<';
	var endTag = hasNamespace ? '</q:' : '</';
	var namespaceDef = hasNamespace ? (' xmlns:q="' + inInstance['__namespace'] + '"' ): '';
	var result = '<r:' + instanceName + namespaceDef + '>';
	if (typeof inInstance == 'string') {
	    result += inInstance;
	} else {
	    for (var prop in inInstance) {
	        if (!inInstance.hasOwnProperty(prop) || prop.indexOf('__') === 0) continue;

	        if (typeof inInstance[prop] === 'function' || Array.isArray(inInstance[prop])) continue;

	        if (typeof inInstance[prop] === 'object') {
	            //result += startTag + prop +'>' + instanceToXml('prop', inInstance[prop]) + endTag + prop +'>';
	            console.error('only convert one level down...');
	        } else {
	            result += startTag + prop + '>' + inInstance[prop].toString() + endTag + prop + '>';
	        }
	    }
	}
	result += '</r:' + instanceName + '>';
	return result;
}


/**
 * Convert a selector set into XML. Expect no nesting.
 * {
 * 	selectorName : selectorValue,
 * 	selectorName : selectorValue,
 *	... ...
 * }
 
	<r:WiFiEndpoint>
		<a:Address>http://192.168.1.103:16992/wsman</a:Address>
		<a:ReferenceParameters>
			<w:ResourceURI>http://schemas.dmtf.org/wbem/wscim/1/cim-schema/2/CIM_WiFiEndpoint</w:ResourceURI>
			<w:SelectorSet>
				<w:Selector Name="Name">WiFi Endpoint 0</w:Selector>
			</w:SelectorSet>
		</a:ReferenceParameters>
	</r:WiFiEndpoint>
			
 */
function referenceToXml(referenceName, inReference) {
	if(inReference === undefined || inReference === null ) return null;
	
	var result = '<r:' + referenceName + '><a:Address>/wsman</a:Address><a:ReferenceParameters><w:ResourceURI>'+ inReference['__resourceUri']+'</w:ResourceURI><w:SelectorSet>';
	for(var selectorName in inReference) {
		if (!inReference.hasOwnProperty(selectorName) || selectorName.indexOf('__') === 0) continue;
		
		if (typeof inReference[selectorName] === 'function' || 
			typeof inReference[selectorName] === 'object' ||
			Array.isArray(inReference[selectorName]) )
			continue;
		
		result += '<w:Selector Name="' + selectorName +'">' + inReference[selectorName].toString() + '</w:Selector>';
	}
	
	result += '</w:SelectorSet></a:ReferenceParameters></r:' + referenceName + '>';
	return result;
}

// Convert a byte array of SID into string
function GetSidString(sid) {
    var r = 'S-' + sid.charCodeAt(0) + '-' + sid.charCodeAt(7);
    for (var i = 2; i < (sid.length / 4) ; i++) r += '-' + ReadIntX(sid, i * 4);
    return r;
}

// Convert a SID readable string into bytes
function GetSidByteArray(sidString) {
    if (!sidString || sidString == null) return null;
    var sidParts = sidString.split('-');

    // Make sure the SID has at least 4 parts and starts with 'S'
    if (sidParts.length < 4 || (sidParts[0] != 's' && sidParts[0] != 'S')) return null;

    // Check that each part of the SID is really an integer
    for (var i = 1; i < sidParts.length; i++) { var y = parseInt(sidParts[i]); if (y != sidParts[i]) return null; sidParts[i] = y; }

    // Version (8 bit) + Id count (8 bit) + 48 bit in big endian -- DO NOT use bitwise right shift operator. JavaScript converts the number into a 32 bit integer before shifting. In real world, it's highly likely this part is always 0.
    var r = String.fromCharCode(sidParts[1]) + String.fromCharCode(sidParts.length - 3) + ShortToStr(Math.floor(sidParts[2] / Math.pow(2, 32))) + IntToStr((sidParts[2]) & 0xFFFF);

    // the rest are in 32 bit in little endian
    for (var i = 3; i < sidParts.length; i++) r += IntToStrX(sidParts[i]);
    return r;
}
