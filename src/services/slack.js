var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
import { WebClient } from '@slack/web-api';
var SlackService = /** @class */ (function () {
    function SlackService(clientId, clientSecret, redirectUri) {
        this.client = null;
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.redirectUri = redirectUri;
    }
    SlackService.prototype.setTokens = function (tokens) {
        this.client = new WebClient(tokens.accessToken);
    };
    SlackService.prototype.exchangeCodeForTokens = function (code) {
        return __awaiter(this, void 0, void 0, function () {
            var tempClient, response;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        tempClient = new WebClient();
                        return [4 /*yield*/, tempClient.oauth.v2.access({
                                client_id: this.clientId,
                                client_secret: this.clientSecret,
                                code: code,
                                redirect_uri: this.redirectUri,
                            })];
                    case 1:
                        response = _a.sent();
                        if (!response.ok || !response.access_token) {
                            throw new Error('Failed to exchange code for tokens');
                        }
                        return [2 /*return*/, {
                                accessToken: response.access_token,
                            }];
                }
            });
        });
    };
    SlackService.prototype.getMentions = function () {
        return __awaiter(this, arguments, void 0, function (limit) {
            var authTest, userId, response, error_1;
            var _a;
            if (limit === void 0) { limit = 20; }
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        if (!this.client)
                            throw new Error('Slack client not initialized');
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 4, , 5]);
                        return [4 /*yield*/, this.client.auth.test()];
                    case 2:
                        authTest = _b.sent();
                        userId = authTest.user_id;
                        return [4 /*yield*/, this.client.search.messages({
                                query: "<@".concat(userId, ">"),
                                sort: 'timestamp',
                                sort_dir: 'desc',
                                count: limit,
                            })];
                    case 3:
                        response = _b.sent();
                        if (!response.ok || !((_a = response.messages) === null || _a === void 0 ? void 0 : _a.matches)) {
                            return [2 /*return*/, []];
                        }
                        return [2 /*return*/, this.parseMessages(response.messages.matches, 'mention')];
                    case 4:
                        error_1 = _b.sent();
                        console.error('Failed to get Slack mentions:', error_1);
                        return [2 /*return*/, []];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    SlackService.prototype.getDirectMessages = function () {
        return __awaiter(this, arguments, void 0, function (limit) {
            var conversations, messages, _loop_1, this_1, _i, _a, channel, error_2;
            if (limit === void 0) { limit = 20; }
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        if (!this.client)
                            throw new Error('Slack client not initialized');
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 7, , 8]);
                        return [4 /*yield*/, this.client.conversations.list({
                                types: 'im',
                                limit: 50,
                            })];
                    case 2:
                        conversations = _b.sent();
                        if (!conversations.ok || !conversations.channels) {
                            return [2 /*return*/, []];
                        }
                        messages = [];
                        _loop_1 = function (channel) {
                            var history_1, parsedMessages;
                            return __generator(this, function (_c) {
                                switch (_c.label) {
                                    case 0: return [4 /*yield*/, this_1.client.conversations.history({
                                            channel: channel.id,
                                            limit: 5,
                                        })];
                                    case 1:
                                        history_1 = _c.sent();
                                        if (history_1.ok && history_1.messages) {
                                            parsedMessages = this_1.parseMessages(history_1.messages.map(function (msg) { return (__assign(__assign({}, msg), { channel: { id: channel.id, name: 'DM' } })); }), 'dm');
                                            messages.push.apply(messages, parsedMessages);
                                        }
                                        return [2 /*return*/];
                                }
                            });
                        };
                        this_1 = this;
                        _i = 0, _a = conversations.channels.slice(0, 10);
                        _b.label = 3;
                    case 3:
                        if (!(_i < _a.length)) return [3 /*break*/, 6];
                        channel = _a[_i];
                        return [5 /*yield**/, _loop_1(channel)];
                    case 4:
                        _b.sent();
                        _b.label = 5;
                    case 5:
                        _i++;
                        return [3 /*break*/, 3];
                    case 6: return [2 /*return*/, messages.slice(0, limit)];
                    case 7:
                        error_2 = _b.sent();
                        console.error('Failed to get Slack DMs:', error_2);
                        return [2 /*return*/, []];
                    case 8: return [2 /*return*/];
                }
            });
        });
    };
    SlackService.prototype.getUnreadThreads = function () {
        return __awaiter(this, arguments, void 0, function (limit) {
            var conversations, messages, _loop_2, this_2, _i, _a, channel, error_3;
            if (limit === void 0) { limit = 20; }
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        if (!this.client)
                            throw new Error('Slack client not initialized');
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 7, , 8]);
                        return [4 /*yield*/, this.client.conversations.list({
                                types: 'public_channel,private_channel',
                                limit: 50,
                            })];
                    case 2:
                        conversations = _b.sent();
                        if (!conversations.ok || !conversations.channels) {
                            return [2 /*return*/, []];
                        }
                        messages = [];
                        _loop_2 = function (channel) {
                            var history_2, threadMessages, parsedMessages;
                            return __generator(this, function (_c) {
                                switch (_c.label) {
                                    case 0: return [4 /*yield*/, this_2.client.conversations.history({
                                            channel: channel.id,
                                            limit: 10,
                                        })];
                                    case 1:
                                        history_2 = _c.sent();
                                        if (history_2.ok && history_2.messages) {
                                            threadMessages = history_2.messages.filter(function (msg) { return msg.thread_ts && msg.reply_count && msg.reply_count > 0; });
                                            parsedMessages = this_2.parseMessages(threadMessages.map(function (msg) { return (__assign(__assign({}, msg), { channel: { id: channel.id, name: channel.name } })); }), 'thread');
                                            messages.push.apply(messages, parsedMessages);
                                        }
                                        return [2 /*return*/];
                                }
                            });
                        };
                        this_2 = this;
                        _i = 0, _a = conversations.channels.slice(0, 10);
                        _b.label = 3;
                    case 3:
                        if (!(_i < _a.length)) return [3 /*break*/, 6];
                        channel = _a[_i];
                        return [5 /*yield**/, _loop_2(channel)];
                    case 4:
                        _b.sent();
                        _b.label = 5;
                    case 5:
                        _i++;
                        return [3 /*break*/, 3];
                    case 6: return [2 /*return*/, messages.slice(0, limit)];
                    case 7:
                        error_3 = _b.sent();
                        console.error('Failed to get Slack threads:', error_3);
                        return [2 /*return*/, []];
                    case 8: return [2 /*return*/];
                }
            });
        });
    };
    SlackService.prototype.getSavedItems = function () {
        return __awaiter(this, arguments, void 0, function (limit) {
            var response, messages, error_4;
            if (limit === void 0) { limit = 20; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.client)
                            throw new Error('Slack client not initialized');
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.client.stars.list({
                                limit: limit,
                            })];
                    case 2:
                        response = _a.sent();
                        if (!response.ok || !response.items) {
                            return [2 /*return*/, []];
                        }
                        messages = response.items
                            .filter(function (item) { return item.type === 'message'; })
                            .map(function (item) { return item.message; });
                        return [2 /*return*/, this.parseMessages(messages, 'saved')];
                    case 3:
                        error_4 = _a.sent();
                        console.error('Failed to get Slack saved items:', error_4);
                        return [2 /*return*/, []];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    SlackService.prototype.getImportantMessages = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _a, mentions, dms, saved, allMessages, uniqueMessages;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, Promise.all([
                            this.getMentions(10),
                            this.getDirectMessages(10),
                            this.getSavedItems(10),
                        ])];
                    case 1:
                        _a = _b.sent(), mentions = _a[0], dms = _a[1], saved = _a[2];
                        allMessages = __spreadArray(__spreadArray(__spreadArray([], mentions, true), dms, true), saved, true);
                        uniqueMessages = Array.from(new Map(allMessages.map(function (msg) { return [msg.id, msg]; })).values());
                        // Sort by timestamp (most recent first)
                        return [2 /*return*/, uniqueMessages
                                .sort(function (a, b) { return parseFloat(b.timestamp) - parseFloat(a.timestamp); })
                                .slice(0, 20)];
                }
            });
        });
    };
    SlackService.prototype.parseMessages = function (messages, type) {
        return messages.map(function (msg) {
            var _a, _b, _c;
            return ({
                id: "".concat(((_a = msg.channel) === null || _a === void 0 ? void 0 : _a.id) || msg.channel, "_").concat(msg.ts),
                type: type,
                text: msg.text || '',
                user: msg.user || '',
                userName: msg.username,
                channel: ((_b = msg.channel) === null || _b === void 0 ? void 0 : _b.id) || msg.channel || '',
                channelName: (_c = msg.channel) === null || _c === void 0 ? void 0 : _c.name,
                timestamp: msg.ts,
                permalink: msg.permalink,
                threadTs: msg.thread_ts,
            });
        });
    };
    SlackService.prototype.getUserInfo = function (userId) {
        return __awaiter(this, void 0, void 0, function () {
            var response, error_5;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.client)
                            throw new Error('Slack client not initialized');
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.client.users.info({ user: userId })];
                    case 2:
                        response = _a.sent();
                        if (!response.ok || !response.user) {
                            return [2 /*return*/, null];
                        }
                        return [2 /*return*/, {
                                name: response.user.name || '',
                                realName: response.user.real_name || '',
                            }];
                    case 3:
                        error_5 = _a.sent();
                        console.error('Failed to get user info:', error_5);
                        return [2 /*return*/, null];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    return SlackService;
}());
export { SlackService };
