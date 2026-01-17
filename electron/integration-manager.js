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
import Store from 'electron-store';
import { CalendarService } from '../src/services/calendar';
import { GmailService } from '../src/services/gmail';
import { SlackService } from '../src/services/slack';
import { ContextEngine } from '../src/services/context-engine';
var store = new Store();
var IntegrationManager = /** @class */ (function () {
    function IntegrationManager(googleClientId, googleClientSecret, slackClientId, slackClientSecret, redirectUri) {
        this.googleClientId = googleClientId;
        this.googleClientSecret = googleClientSecret;
        this.slackClientId = slackClientId;
        this.slackClientSecret = slackClientSecret;
        this.redirectUri = redirectUri;
        this.calendarService = null;
        this.gmailService = null;
        this.slackService = null;
    }
    // Initialize services with stored tokens
    IntegrationManager.prototype.initialize = function () {
        return __awaiter(this, void 0, void 0, function () {
            var googleTokens, slackTokens;
            return __generator(this, function (_a) {
                googleTokens = this.getStoredTokens('google');
                if (googleTokens === null || googleTokens === void 0 ? void 0 : googleTokens.accessToken) {
                    this.calendarService = new CalendarService(this.googleClientId, this.googleClientSecret, this.redirectUri);
                    this.calendarService.setTokens(googleTokens);
                    this.gmailService = new GmailService(this.googleClientId, this.googleClientSecret, this.redirectUri);
                    this.gmailService.setTokens(googleTokens);
                }
                slackTokens = this.getStoredTokens('slack');
                if (slackTokens === null || slackTokens === void 0 ? void 0 : slackTokens.accessToken) {
                    this.slackService = new SlackService(this.slackClientId, this.slackClientSecret, this.redirectUri);
                    this.slackService.setTokens(slackTokens);
                }
                return [2 /*return*/];
            });
        });
    };
    // Exchange OAuth code for tokens (Google)
    IntegrationManager.prototype.connectGoogle = function (code) {
        return __awaiter(this, void 0, void 0, function () {
            var calendarService, tokens;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        calendarService = new CalendarService(this.googleClientId, this.googleClientSecret, this.redirectUri);
                        return [4 /*yield*/, calendarService.exchangeCodeForTokens(code)];
                    case 1:
                        tokens = _a.sent();
                        this.saveTokens('google', tokens);
                        // Initialize services
                        this.calendarService = calendarService;
                        this.calendarService.setTokens(tokens);
                        this.gmailService = new GmailService(this.googleClientId, this.googleClientSecret, this.redirectUri);
                        this.gmailService.setTokens(tokens);
                        return [2 /*return*/, tokens];
                }
            });
        });
    };
    // Exchange OAuth code for tokens (Slack)
    IntegrationManager.prototype.connectSlack = function (code) {
        return __awaiter(this, void 0, void 0, function () {
            var slackService, tokens;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        slackService = new SlackService(this.slackClientId, this.slackClientSecret, this.redirectUri);
                        return [4 /*yield*/, slackService.exchangeCodeForTokens(code)];
                    case 1:
                        tokens = _a.sent();
                        this.saveTokens('slack', tokens);
                        // Initialize service
                        this.slackService = slackService;
                        this.slackService.setTokens(tokens);
                        return [2 /*return*/, tokens];
                }
            });
        });
    };
    // Sync calendar events
    IntegrationManager.prototype.syncCalendar = function () {
        return __awaiter(this, void 0, void 0, function () {
            var events, error_1, events;
            var _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        if (!this.calendarService) {
                            throw new Error('Calendar service not initialized. Please connect Google account first.');
                        }
                        _c.label = 1;
                    case 1:
                        _c.trys.push([1, 3, , 7]);
                        return [4 /*yield*/, this.calendarService.getUpcomingEvents(7)];
                    case 2:
                        events = _c.sent();
                        return [2 /*return*/, events];
                    case 3:
                        error_1 = _c.sent();
                        if (!(((_a = error_1.message) === null || _a === void 0 ? void 0 : _a.includes('401')) || ((_b = error_1.message) === null || _b === void 0 ? void 0 : _b.includes('unauthorized')))) return [3 /*break*/, 6];
                        return [4 /*yield*/, this.refreshGoogleTokens()];
                    case 4:
                        _c.sent();
                        return [4 /*yield*/, this.calendarService.getUpcomingEvents(7)];
                    case 5:
                        events = _c.sent();
                        return [2 /*return*/, events];
                    case 6: throw error_1;
                    case 7: return [2 /*return*/];
                }
            });
        });
    };
    // Sync Gmail
    IntegrationManager.prototype.syncGmail = function () {
        return __awaiter(this, void 0, void 0, function () {
            var emails, error_2, emails;
            var _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        if (!this.gmailService) {
                            throw new Error('Gmail service not initialized. Please connect Google account first.');
                        }
                        _c.label = 1;
                    case 1:
                        _c.trys.push([1, 3, , 7]);
                        return [4 /*yield*/, this.gmailService.getImportantEmails(20)];
                    case 2:
                        emails = _c.sent();
                        return [2 /*return*/, emails];
                    case 3:
                        error_2 = _c.sent();
                        if (!(((_a = error_2.message) === null || _a === void 0 ? void 0 : _a.includes('401')) || ((_b = error_2.message) === null || _b === void 0 ? void 0 : _b.includes('unauthorized')))) return [3 /*break*/, 6];
                        return [4 /*yield*/, this.refreshGoogleTokens()];
                    case 4:
                        _c.sent();
                        return [4 /*yield*/, this.gmailService.getImportantEmails(20)];
                    case 5:
                        emails = _c.sent();
                        return [2 /*return*/, emails];
                    case 6: throw error_2;
                    case 7: return [2 /*return*/];
                }
            });
        });
    };
    // Sync Slack
    IntegrationManager.prototype.syncSlack = function () {
        return __awaiter(this, void 0, void 0, function () {
            var messages, error_3;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.slackService) {
                            throw new Error('Slack service not initialized. Please connect Slack account first.');
                        }
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.slackService.getImportantMessages()];
                    case 2:
                        messages = _a.sent();
                        return [2 /*return*/, messages];
                    case 3:
                        error_3 = _a.sent();
                        throw error_3;
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    // Generate smart suggestions
    IntegrationManager.prototype.getSmartSuggestions = function () {
        return __awaiter(this, void 0, void 0, function () {
            var calendarEvents, _a, emails, _b, slackMessages, _c, suggestions;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        if (!this.calendarService) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.syncCalendar().catch(function () { return []; })];
                    case 1:
                        _a = _d.sent();
                        return [3 /*break*/, 3];
                    case 2:
                        _a = [];
                        _d.label = 3;
                    case 3:
                        calendarEvents = _a;
                        if (!this.gmailService) return [3 /*break*/, 5];
                        return [4 /*yield*/, this.syncGmail().catch(function () { return []; })];
                    case 4:
                        _b = _d.sent();
                        return [3 /*break*/, 6];
                    case 5:
                        _b = [];
                        _d.label = 6;
                    case 6:
                        emails = _b;
                        if (!this.slackService) return [3 /*break*/, 8];
                        return [4 /*yield*/, this.syncSlack().catch(function () { return []; })];
                    case 7:
                        _c = _d.sent();
                        return [3 /*break*/, 9];
                    case 8:
                        _c = [];
                        _d.label = 9;
                    case 9:
                        slackMessages = _c;
                        suggestions = ContextEngine.generateSmartSuggestions(calendarEvents, emails, slackMessages);
                        return [2 /*return*/, suggestions];
                }
            });
        });
    };
    // Refresh Google tokens
    IntegrationManager.prototype.refreshGoogleTokens = function () {
        return __awaiter(this, void 0, void 0, function () {
            var newTokens;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.calendarService)
                            return [2 /*return*/];
                        return [4 /*yield*/, this.calendarService.getRefreshedTokens()];
                    case 1:
                        newTokens = _a.sent();
                        if (newTokens) {
                            this.saveTokens('google', newTokens);
                            this.calendarService.setTokens(newTokens);
                            if (this.gmailService) {
                                this.gmailService.setTokens(newTokens);
                            }
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    // Get stored tokens
    IntegrationManager.prototype.getStoredTokens = function (provider) {
        return {
            accessToken: store.get("".concat(provider, "_access_token")),
            refreshToken: store.get("".concat(provider, "_refresh_token")),
            expiresAt: store.get("".concat(provider, "_expires_at")),
        };
    };
    // Save tokens to store
    IntegrationManager.prototype.saveTokens = function (provider, tokens) {
        store.set("".concat(provider, "_access_token"), tokens.accessToken);
        if (tokens.refreshToken) {
            store.set("".concat(provider, "_refresh_token"), tokens.refreshToken);
        }
        if (tokens.expiresAt) {
            store.set("".concat(provider, "_expires_at"), tokens.expiresAt);
        }
    };
    // Check if services are connected
    IntegrationManager.prototype.isGoogleConnected = function () {
        return !!this.calendarService;
    };
    IntegrationManager.prototype.isSlackConnected = function () {
        return !!this.slackService;
    };
    return IntegrationManager;
}());
export { IntegrationManager };
