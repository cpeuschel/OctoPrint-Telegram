/*
 * View model for OctoPrint-Telegram
 *
 * Author: Fabian Schlenz
 * License: AGPLv3
 */
$(function() {
    function TelegramViewModel(parameters) {
        var self = this;

        // assign the injected parameters, e.g.:
        // self.loginStateViewModel = parameters[0];
        //if(parameters!=null)
            self.settings = parameters[0];
        //else
         //   self.settings=self.settings;
        console.log(String(self.settings));

        // TODO: Implement your plugin's view model here.
        
        self.chatListHelper = new ItemListHelper(
            "known_chats",
            {
                "title": function(a, b) {
                    if(a.title.toLocaleLowerCase() < b.title.toLocaleLowerCase()) return -1;
                    if(a.title.toLocaleLowerCase() > b.title.toLocaleLowerCase()) return 1;
                    return 0;
                }
            },
            {},
            "title",
            [],
            [],
            999);

        self.cmdCnt = 0;
        self.msgCnt = 0;
        self.reloadPending = 0;
        self.reloadUsr = ko.observable(false);
        self.connection_state_str = ko.observable("Unknown");
        self.isloading = ko.observable(false);
        self.errored = ko.observable(false);
        self.token_state_str = ko.observable("Unknown");
    	self.editChatDialog = undefined;        
    	self.currChatID = "Unknown";
        self.currChatTitle = ko.observable("Unknown");
        self.bind_cmd = {};
    
        self.requestData = function(ignore,update) {
            ignore = typeof ignore !== 'undefined' ? ignore : false;
            update = typeof update !== 'undefined' ? update : false;

            if (update)
                urlPath = "plugin/telegram?id="+self.currChatID+"&cmd="+$('#telegram-acccmd-chkbox-box').prop( "checked" )+"&note="+$('#telegram-notify-chkbox-box').prop( "checked" );
            else
                urlPath = "plugin/telegram";
            if(self.reloadUsr() || ignore){
                $.ajax({
                    url: API_BASEURL + urlPath,
                    type: "GET",
                    dataType: "json",
                    success: self.fromResponse
                });
                
               if(!ignore) self.reloadPending = setTimeout(self.requestData,20000);
            }
            else
                self.reloadPending = setTimeout(self.requestData,500);
        };

        self.requestBindings = function() {
            $.ajax({
                url: API_BASEURL + "plugin/telegram?bindings=true",
                type: "GET",
                dataType: "json",
                success: self.fromBindings
            });      
        };

        self.fromBindings = function(response){
            self.bind_cmd = response.bind_cmd;
            $("#telegram_msg_list").empty();
            keys = response.messages.sort();
            
            for(var id in keys) {
                $('#telegram_msg_list').append('<div class="control-group" id="telegramMsgText'+self.msgCnt+'"><label class="control-label">... '+keys[id]+'</label><div class="controls"><textarea rows="4" class="block" data-bind="value: settings.settings.plugins.telegram.messages.'+keys[id]+'.text"></textarea><label class="checkbox"><input type="checkbox" data-bind="checked: settings.settings.plugins.telegram.messages.'+keys[id]+'.image" />Send with Image</label></div></div>');
                ko.applyBindings(self, $("#telegramMsgText"+self.msgCnt++)[0]);
            }
        }
    

        self.updateChat = function(data) {
            self.requestData(true,true);
            self.editChatDialog.modal("hide");
        }
    
        self.testToken = function(data, event) {
            self.isloading(true);
            console.log("Testing token " + $('#settings_plugin_telegram_token').val());
            $.ajax({
                url: API_BASEURL + "plugin/telegram",
                type: "POST",
                dataType: "json",
                data: JSON.stringify({ "command": "testToken", "token": $('#settings_plugin_telegram_token').val()}),
                contentType: "application/json",
                success: self.testResponse
            });
        }
        
        self.testResponse = function(response) {
            self.isloading(false);
            self.token_state_str(response.connection_state_str);
            self.errored(!response.ok);
        }
        
        self.fromResponse = function(response) {
            self.isloading(false);
            if(response === undefined) return;
            if(response.hasOwnProperty("connection_state_str"))
                self.connection_state_str(response.connection_state_str);
            if(response.hasOwnProperty("connection_ok"))
                self.errored(!response.connection_ok);
            var entries = response.chats;
            if (entries === undefined) return;
            var array = [];
            for(var id in entries) {
                var data = entries[id];
                data['id'] = id;
                if(data['new'])
                    data['newUsr']=true;
                else
                    data['newUsr'] = false;
                if(!('accept_commands' in data)) data['accept_commands'] = false;
                if(!('send_notifications' in data)) data['send_notifications'] = false;
                array.push(data);
            }
            self.chatListHelper.updateItems(array);
            for(var id in entries) {
                $.ajax({ 
                    url : API_BASEURL + "plugin/telegram?img=true&id=" + id, 
                    type: "GET",
                    dataType: "json",
                    processData : false,
                }).always(function(b64data){
                    $("#IMAGE_"+b64data.id).attr("src", "data:image/jpg;base64,"+b64data.result);
                });
                
            }
        };



        self.showEditChatDialog = function(data) {
            if (data === undefined) return;
            //ko.cleanNode($("#telegram-acccmd-chkbox-box")[0]);
            $("#telegram-acccmd-chkbox").empty();
            $('#telegram-acccmd-chkbox').append('<input id="telegram-acccmd-chkbox-box" type="checkbox" data-bind="checked: settings.settings.plugins.telegram.chats[\''+data['id']+'\'][\'accept_commands\']"> Allow to send commands ');
            ko.applyBindings(self, $("#telegram-acccmd-chkbox-box")[0]);

            //ko.cleanNode($("#telegram-notify-chkbox-box")[0]);
            $("#telegram-notify-chkbox").empty();
            $('#telegram-notify-chkbox').append('<input id="telegram-notify-chkbox-box" type="checkbox" data-bind="checked: settings.settings.plugins.telegram.chats[\''+data['id']+'\'][\'send_notifications\']"> Send notifications');
            ko.applyBindings(self, $("#telegram-notify-chkbox-box")[0]);
            self.currChatTitle(data.title);
            self.currChatID = data.id;

            if(!data.private)
                document.getElementById("telegram-groupNotify-hint").innerHTML="When this is enabled, users with command access can send commands from this group. No other users in this group can send commands.";
            else
                document.getElementById("telegram-groupNotify-hint").innerHTML="After enabling this option, you have to set permissions for individual commands by klicking the blue checkbox in the list.";
            
	        self.editChatDialog.modal("show");
        }

        self.showEditCmdDialog = function(data,option) {
            if (data === undefined) return;
            self.currChatTitle("Edit " + option + ": " +data.title);
            for(self.cmdCnt;self.cmdCnt>0;self.cmdCnt--)
                $("#telegram-cmd-chkbox"+(self.cmdCnt-1)).remove();
            keys = Object.keys(data[option]);
            keys.sort();
            for(var id in keys) {
                if( self.bind_cmd.indexOf(keys[id]) < 0){
                    $("#telegram-cmd-chkbox-grp").append('<span id="telegram-cmd-chkbox'+self.cmdCnt+'"><label class="checkbox"><input  type="checkbox" data-bind="checked: settings.settings.plugins.telegram.chats[\''+data['id']+'\'][\''+option+'\'][\''+keys[id]+'\']"> <span>'+keys[id]     +'</span><label></span>');
                    ko.applyBindings(self, $("#telegram-cmd-chkbox"+self.cmdCnt++)[0]);
                }
            }
            self.editCmdDialog.modal("show");
        }

        self.delChat = function(data) {
            if (data === undefined) return;
            if (confirm('Do you really want to delete ' + data.title)){
                self.isloading(true);
                data['command'] = "delChat";
                data['ID'] = data.id
                console.log("Delete Chat Data " + String(data['ID']));
                $.ajax({
                    url: API_BASEURL + "plugin/telegram",
                    type: "POST",
                    dataType: "json",
                    data: JSON.stringify(data),
                    contentType: "application/json",
                    success: self.fromResponse
                });
            }
        }

        self.onSettingsHidden = function() {
            clearTimeout(self.reloadPending);
        }

        self.onSettingsShown = function() {
            self.requestData(true,false);
            self.requestData();
            self.requestBindings();
            self.editChatDialog = $("#settings-telegramDialogEditChat");
            self.editCmdDialog = $("#settings-telegramDialogEditCommands");
        }

        self.onServerDisconnect = function(){
            clearTimeout(self.reloadPending);
        }

        self.onDataUpdaterReconnect = function(){
            if(self.reloadUsr())
                self.requestData();
            else
                self.requestData(true,false);
                self.requestData();
            self.requestBindings();
        }

    }

    // view model class, parameters for constructor, container to bind to
    OCTOPRINT_VIEWMODELS.push([
        TelegramViewModel,

        // e.g. loginStateViewModel, settingsViewModel, ...
        [ "settingsViewModel" ],

        // e.g. #settings_plugin_telegram, #tab_plugin_telegram, ...
        [ '#settings_plugin_telegram' ]
    ]);
});
