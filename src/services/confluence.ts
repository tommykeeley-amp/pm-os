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

export class ConfluenceService {
  private config: ConfluenceConfig;
  private baseUrl: string;

  constructor(config: ConfluenceConfig) {
    this.config = config;
    this.baseUrl = `https://${config.domain}/wiki/api/v2`;
  }

  private getAuthHeader(): string {
    const auth = Buffer.from(`${this.config.email}:${this.config.apiToken}`).toString('base64');
    return `Basic ${auth}`;
  }

  private async makeRequest(endpoint: string, options: RequestInit = {}): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': this.getAuthHeader(),
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Confluence API error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      await this.getSpaces();
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async getSpaces(): Promise<ConfluenceSpace[]> {
    const response = await this.makeRequest('/spaces?limit=100');
    return response.results.map((space: any) => ({
      key: space.key,
      name: space.name,
      id: space.id,
    }));
  }

  async createPage(request: CreatePageRequest): Promise<ConfluencePage> {
    const payload: any = {
      spaceId: await this.getSpaceIdByKey(request.spaceKey),
      status: 'current',
      title: request.title,
      body: {
        representation: 'storage',
        value: this.convertToStorageFormat(request.body),
      },
    };

    if (request.parentId) {
      payload.parentId = request.parentId;
    }

    const response = await this.makeRequest('/pages', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    return {
      id: response.id,
      title: response.title,
      spaceKey: request.spaceKey,
      url: this.getPageUrl(response.id),
    };
  }

  async getPage(pageId: string): Promise<ConfluencePage> {
    const response = await this.makeRequest(`/pages/${pageId}`);
    return {
      id: response.id,
      title: response.title,
      spaceKey: response.spaceKey,
      url: this.getPageUrl(response.id),
    };
  }

  async searchPages(query: string, spaceKey?: string): Promise<ConfluencePage[]> {
    let endpoint = `/pages?title=${encodeURIComponent(query)}`;
    if (spaceKey) {
      const spaceId = await this.getSpaceIdByKey(spaceKey);
      endpoint += `&space-id=${spaceId}`;
    }

    const response = await this.makeRequest(endpoint);
    return response.results.map((page: any) => ({
      id: page.id,
      title: page.title,
      spaceKey: page.spaceKey,
      url: this.getPageUrl(page.id),
    }));
  }

  private async getSpaceIdByKey(spaceKey: string): Promise<string> {
    const response = await this.makeRequest(`/spaces?keys=${spaceKey}`);
    if (!response.results || response.results.length === 0) {
      throw new Error(`Space with key "${spaceKey}" not found`);
    }
    return response.results[0].id;
  }

  private convertToStorageFormat(markdown: string): string {
    // Basic markdown to Confluence storage format conversion
    // In a real implementation, you'd want a proper markdown-to-confluence converter
    let html = markdown
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br/>');

    return `<p>${html}</p>`;
  }

  getPageUrl(pageId: string): string {
    return `https://${this.config.domain}/wiki/pages/${pageId}`;
  }
}
