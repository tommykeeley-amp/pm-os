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
import { google } from 'googleapis';
var GmailService = /** @class */ (function () {
    function GmailService(clientId, clientSecret, redirectUri) {
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.redirectUri = redirectUri;
        this.oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    }
    GmailService.prototype.setTokens = function (tokens) {
        this.oauth2Client.setCredentials({
            access_token: tokens.accessToken,
            refresh_token: tokens.refreshToken,
            expiry_date: tokens.expiresAt,
        });
    };
    GmailService.prototype.exchangeCodeForTokens = function (code) {
        return __awaiter(this, void 0, void 0, function () {
            var tokens;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.oauth2Client.getToken(code)];
                    case 1:
                        tokens = (_a.sent()).tokens;
                        return [2 /*return*/, {
                                accessToken: tokens.access_token,
                                refreshToken: tokens.refresh_token,
                                expiresAt: tokens.expiry_date,
                            }];
                }
            });
        });
    };
    GmailService.prototype.getUnreadEmails = function () {
        return __awaiter(this, arguments, void 0, function (maxResults) {
            var gmail_1, response, messages, emailPromises, error_1;
            var _this = this;
            var _a;
            if (maxResults === void 0) { maxResults = 20; }
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 2, , 5]);
                        gmail_1 = google.gmail({ version: 'v1', auth: this.oauth2Client });
                        return [4 /*yield*/, gmail_1.users.messages.list({
                                userId: 'me',
                                q: 'is:unread in:inbox category:primary',
                                maxResults: maxResults,
                            })];
                    case 1:
                        response = _b.sent();
                        messages = response.data.messages || [];
                        emailPromises = messages.map(function (msg) { return __awaiter(_this, void 0, void 0, function () {
                            var details;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, gmail_1.users.messages.get({
                                            userId: 'me',
                                            id: msg.id,
                                            format: 'full',
                                        })];
                                    case 1:
                                        details = _a.sent();
                                        return [2 /*return*/, this.parseEmailMessage(details.data)];
                                }
                            });
                        }); });
                        return [2 /*return*/, Promise.all(emailPromises)];
                    case 2:
                        error_1 = _b.sent();
                        if (!(((_a = error_1.response) === null || _a === void 0 ? void 0 : _a.status) === 401)) return [3 /*break*/, 4];
                        return [4 /*yield*/, this.oauth2Client.refreshAccessToken()];
                    case 3:
                        _b.sent();
                        return [2 /*return*/, this.getUnreadEmails(maxResults)];
                    case 4: throw error_1;
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    GmailService.prototype.getStarredEmails = function () {
        return __awaiter(this, arguments, void 0, function (maxResults) {
            var gmail_2, response, messages, emailPromises, error_2;
            var _this = this;
            var _a;
            if (maxResults === void 0) { maxResults = 20; }
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 2, , 5]);
                        gmail_2 = google.gmail({ version: 'v1', auth: this.oauth2Client });
                        return [4 /*yield*/, gmail_2.users.messages.list({
                                userId: 'me',
                                q: 'is:starred',
                                maxResults: maxResults,
                            })];
                    case 1:
                        response = _b.sent();
                        messages = response.data.messages || [];
                        emailPromises = messages.map(function (msg) { return __awaiter(_this, void 0, void 0, function () {
                            var details;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, gmail_2.users.messages.get({
                                            userId: 'me',
                                            id: msg.id,
                                            format: 'full',
                                        })];
                                    case 1:
                                        details = _a.sent();
                                        return [2 /*return*/, this.parseEmailMessage(details.data)];
                                }
                            });
                        }); });
                        return [2 /*return*/, Promise.all(emailPromises)];
                    case 2:
                        error_2 = _b.sent();
                        if (!(((_a = error_2.response) === null || _a === void 0 ? void 0 : _a.status) === 401)) return [3 /*break*/, 4];
                        return [4 /*yield*/, this.oauth2Client.refreshAccessToken()];
                    case 3:
                        _b.sent();
                        return [2 /*return*/, this.getStarredEmails(maxResults)];
                    case 4: throw error_2;
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    GmailService.prototype.getImportantEmails = function () {
        return __awaiter(this, arguments, void 0, function (maxResults) {
            var gmail_3, twoDaysAgo, timestamp, response, messages, emailPromises, error_3;
            var _this = this;
            var _a;
            if (maxResults === void 0) { maxResults = 20; }
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 2, , 5]);
                        gmail_3 = google.gmail({ version: 'v1', auth: this.oauth2Client });
                        twoDaysAgo = new Date();
                        twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
                        timestamp = Math.floor(twoDaysAgo.getTime() / 1000);
                        return [4 /*yield*/, gmail_3.users.messages.list({
                                userId: 'me',
                                q: "(is:unread OR is:starred) in:inbox after:".concat(timestamp),
                                maxResults: maxResults,
                            })];
                    case 1:
                        response = _b.sent();
                        messages = response.data.messages || [];
                        emailPromises = messages.map(function (msg) { return __awaiter(_this, void 0, void 0, function () {
                            var details;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, gmail_3.users.messages.get({
                                            userId: 'me',
                                            id: msg.id,
                                            format: 'full',
                                        })];
                                    case 1:
                                        details = _a.sent();
                                        return [2 /*return*/, this.parseEmailMessage(details.data)];
                                }
                            });
                        }); });
                        return [2 /*return*/, Promise.all(emailPromises)];
                    case 2:
                        error_3 = _b.sent();
                        if (!(((_a = error_3.response) === null || _a === void 0 ? void 0 : _a.status) === 401)) return [3 /*break*/, 4];
                        return [4 /*yield*/, this.oauth2Client.refreshAccessToken()];
                    case 3:
                        _b.sent();
                        return [2 /*return*/, this.getImportantEmails(maxResults)];
                    case 4: throw error_3;
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    GmailService.prototype.parseEmailMessage = function (message) {
        var _a, _b;
        var headers = message.payload.headers;
        var getHeader = function (name) {
            var header = headers.find(function (h) { return h.name.toLowerCase() === name.toLowerCase(); });
            return (header === null || header === void 0 ? void 0 : header.value) || '';
        };
        var isUnread = ((_a = message.labelIds) === null || _a === void 0 ? void 0 : _a.includes('UNREAD')) || false;
        var isStarred = ((_b = message.labelIds) === null || _b === void 0 ? void 0 : _b.includes('STARRED')) || false;
        return {
            id: message.id,
            threadId: message.threadId,
            subject: getHeader('Subject'),
            from: getHeader('From'),
            snippet: message.snippet,
            date: getHeader('Date'),
            isUnread: isUnread,
            isStarred: isStarred,
            labels: message.labelIds || [],
        };
    };
    GmailService.prototype.getRefreshedTokens = function () {
        return __awaiter(this, void 0, void 0, function () {
            var credentials, error_4;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, this.oauth2Client.refreshAccessToken()];
                    case 1:
                        credentials = (_a.sent()).credentials;
                        return [2 /*return*/, {
                                accessToken: credentials.access_token,
                                refreshToken: credentials.refresh_token,
                                expiresAt: credentials.expiry_date,
                            }];
                    case 2:
                        error_4 = _a.sent();
                        console.error('Failed to refresh tokens:', error_4);
                        return [2 /*return*/, null];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    return GmailService;
}());
export { GmailService };
