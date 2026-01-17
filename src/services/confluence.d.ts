/**
 * Confluence API Service
 * Integrates with Atlassian Confluence Cloud REST API v2
 */
export interface ConfluenceConfig {
    domain: string;
    email: string;
    apiToken: string;
}
export interface CreatePageRequest {
    spaceKey: string;
    title: string;
    body: string;
    parentId?: string;
}
export interface ConfluencePage {
    id: string;
    title: string;
    spaceKey: string;
    url: string;
}
export interface ConfluenceSpace {
    key: string;
    name: string;
    id: string;
}
export declare class ConfluenceService {
    private config;
    private baseUrl;
    constructor(config: ConfluenceConfig);
    private getAuthHeader;
    private makeRequest;
    testConnection(): Promise<{
        success: boolean;
        error?: string;
    }>;
    getSpaces(): Promise<ConfluenceSpace[]>;
    createPage(request: CreatePageRequest): Promise<ConfluencePage>;
    getPage(pageId: string): Promise<ConfluencePage>;
    searchPages(query: string, spaceKey?: string): Promise<ConfluencePage[]>;
    private getSpaceIdByKey;
    private convertToStorageFormat;
    getPageUrl(pageId: string): string;
}
