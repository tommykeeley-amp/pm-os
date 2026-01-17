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
var JiraService = /** @class */ (function () {
    function JiraService(config) {
        this.config = config;
        this.baseUrl = "https://".concat(config.domain, "/rest/api/3");
    }
    JiraService.prototype.getAuthHeader = function () {
        var credentials = Buffer.from("".concat(this.config.email, ":").concat(this.config.apiToken)).toString('base64');
        return "Basic ".concat(credentials);
    };
    JiraService.prototype.makeRequest = function (endpoint_1) {
        return __awaiter(this, arguments, void 0, function (endpoint, options) {
            var url, response, errorText;
            if (options === void 0) { options = {}; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        url = "".concat(this.baseUrl).concat(endpoint);
                        return [4 /*yield*/, fetch(url, __assign(__assign({}, options), { headers: __assign({ 'Authorization': this.getAuthHeader(), 'Content-Type': 'application/json', 'Accept': 'application/json' }, options.headers) }))];
                    case 1:
                        response = _a.sent();
                        if (!!response.ok) return [3 /*break*/, 3];
                        return [4 /*yield*/, response.text()];
                    case 2:
                        errorText = _a.sent();
                        throw new Error("Jira API error: ".concat(response.status, " ").concat(response.statusText, " - ").concat(errorText));
                    case 3: return [2 /*return*/, response.json()];
                }
            });
        });
    };
    /**
     * Test connection to Jira
     */
    JiraService.prototype.testConnection = function () {
        return __awaiter(this, void 0, void 0, function () {
            var error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, this.makeRequest('/myself')];
                    case 1:
                        _a.sent();
                        return [2 /*return*/, true];
                    case 2:
                        error_1 = _a.sent();
                        console.error('Jira connection test failed:', error_1);
                        return [2 /*return*/, false];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get current user info
     */
    JiraService.prototype.getCurrentUser = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.makeRequest('/myself')];
            });
        });
    };
    /**
     * Get all accessible projects
     */
    JiraService.prototype.getProjects = function () {
        return __awaiter(this, void 0, void 0, function () {
            var response;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.makeRequest('/project/search')];
                    case 1:
                        response = _a.sent();
                        return [2 /*return*/, response.values || []];
                }
            });
        });
    };
    /**
     * Get issue types for a project
     */
    JiraService.prototype.getIssueTypes = function (projectKey) {
        return __awaiter(this, void 0, void 0, function () {
            var response;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.makeRequest("/project/".concat(projectKey))];
                    case 1:
                        response = _a.sent();
                        return [2 /*return*/, response.issueTypes || []];
                }
            });
        });
    };
    /**
     * Create a Jira issue
     */
    JiraService.prototype.createIssue = function (request) {
        return __awaiter(this, void 0, void 0, function () {
            var payload, response;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        payload = {
                            fields: {
                                project: {
                                    key: request.projectKey,
                                },
                                summary: request.summary,
                                description: request.description ? {
                                    type: 'doc',
                                    version: 1,
                                    content: [
                                        {
                                            type: 'paragraph',
                                            content: [
                                                {
                                                    type: 'text',
                                                    text: request.description,
                                                },
                                            ],
                                        },
                                    ],
                                } : undefined,
                                issuetype: {
                                    name: request.issueType,
                                },
                                priority: request.priority ? {
                                    name: request.priority,
                                } : undefined,
                            },
                        };
                        return [4 /*yield*/, this.makeRequest('/issue', {
                                method: 'POST',
                                body: JSON.stringify(payload),
                            })];
                    case 1:
                        response = _a.sent();
                        return [2 /*return*/, this.getIssue(response.key)];
                }
            });
        });
    };
    /**
     * Get a specific issue by key
     */
    JiraService.prototype.getIssue = function (issueKey) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.makeRequest("/issue/".concat(issueKey))];
            });
        });
    };
    /**
     * Get issues assigned to current user
     */
    JiraService.prototype.getMyIssues = function () {
        return __awaiter(this, arguments, void 0, function (maxResults) {
            var jql, response;
            if (maxResults === void 0) { maxResults = 20; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        jql = 'assignee = currentUser() AND status != Done ORDER BY updated DESC';
                        return [4 /*yield*/, this.makeRequest("/search?jql=".concat(encodeURIComponent(jql), "&maxResults=").concat(maxResults))];
                    case 1:
                        response = _a.sent();
                        return [2 /*return*/, response.issues || []];
                }
            });
        });
    };
    /**
     * Get recently updated issues
     */
    JiraService.prototype.getRecentIssues = function () {
        return __awaiter(this, arguments, void 0, function (maxResults) {
            var jql, response;
            if (maxResults === void 0) { maxResults = 20; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        jql = 'updated >= -7d ORDER BY updated DESC';
                        return [4 /*yield*/, this.makeRequest("/search?jql=".concat(encodeURIComponent(jql), "&maxResults=").concat(maxResults))];
                    case 1:
                        response = _a.sent();
                        return [2 /*return*/, response.issues || []];
                }
            });
        });
    };
    /**
     * Update issue status
     */
    JiraService.prototype.updateIssueStatus = function (issueKey, transitionId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.makeRequest("/issue/".concat(issueKey, "/transitions"), {
                            method: 'POST',
                            body: JSON.stringify({
                                transition: {
                                    id: transitionId,
                                },
                            }),
                        })];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Add comment to issue
     */
    JiraService.prototype.addComment = function (issueKey, comment) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.makeRequest("/issue/".concat(issueKey, "/comment"), {
                            method: 'POST',
                            body: JSON.stringify({
                                body: {
                                    type: 'doc',
                                    version: 1,
                                    content: [
                                        {
                                            type: 'paragraph',
                                            content: [
                                                {
                                                    type: 'text',
                                                    text: comment,
                                                },
                                            ],
                                        },
                                    ],
                                },
                            }),
                        })];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get issue URL
     */
    JiraService.prototype.getIssueUrl = function (issueKey) {
        return "https://".concat(this.config.domain, "/browse/").concat(issueKey);
    };
    return JiraService;
}());
export { JiraService };
