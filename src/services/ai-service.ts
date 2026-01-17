import OpenAI from 'openai';

interface TaskTag {
  label: string;
  color: string;
}

interface Suggestion {
  id: string;
  title: string;
  source: string;
  context?: string;
  priority?: string;
  dueDate?: string;
}

interface ScoredSuggestion extends Suggestion {
  relevanceScore: number;
  matchedTags: string[];
}

export class AIService {
  private openai: OpenAI | null = null;
  private isInitialized = false;

  constructor() {
    // Initialize will be called when API key is available
  }

  async initialize(apiKey: string) {
    if (!apiKey || apiKey === 'your_openai_api_key_here') {
      console.log('[AIService] No valid API key provided, AI features disabled');
      this.isInitialized = false;
      return;
    }

    try {
      this.openai = new OpenAI({
        apiKey,
        dangerouslyAllowBrowser: true, // Note: In production, API calls should go through backend
      });
      this.isInitialized = true;
      console.log('[AIService] Initialized successfully');
    } catch (error) {
      console.error('[AIService] Failed to initialize:', error);
      this.isInitialized = false;
    }
  }

  isAvailable(): boolean {
    return this.isInitialized && this.openai !== null;
  }

  /**
   * Use AI to match suggestions to project tags
   */
  async matchSuggestionsToTags(
    suggestions: Suggestion[],
    projectTags: TaskTag[]
  ): Promise<ScoredSuggestion[]> {
    if (!this.isAvailable() || projectTags.length === 0) {
      return suggestions.map(s => ({ ...s, relevanceScore: 0, matchedTags: [] }));
    }

    try {
      const tagLabels = projectTags.map(t => t.label);

      // Create a prompt for GPT to analyze suggestions
      const prompt = `You are a task management assistant. Analyze these task suggestions and match them to project tags based on semantic relevance.

Project Tags: ${tagLabels.join(', ')}

Task Suggestions:
${suggestions.map((s, i) => `${i + 1}. "${s.title}" (${s.source}) - ${s.context || 'no context'}`).join('\n')}

For each task, identify which project tag(s) it relates to (if any) and give it a relevance score from 0-10. Consider:
- Keywords and context
- Semantic meaning (e.g., "authentication" relates to "security")
- Type of work (calendar events, emails, Slack messages)

Respond in JSON format:
{
  "matches": [
    {
      "taskIndex": 0,
      "relevanceScore": 8,
      "matchedTags": ["tag1", "tag2"]
    }
  ]
}`;

      const response = await this.openai!.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'You are a helpful task management assistant.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 1000,
      });

      const content = response.choices[0].message.content;
      if (!content) {
        throw new Error('No response from AI');
      }

      const result = JSON.parse(content);

      // Map results back to suggestions
      return suggestions.map((suggestion, index) => {
        const match = result.matches.find((m: any) => m.taskIndex === index);
        return {
          ...suggestion,
          relevanceScore: match?.relevanceScore || 0,
          matchedTags: match?.matchedTags || [],
        };
      });
    } catch (error) {
      console.error('[AIService] Failed to match suggestions:', error);
      // Fallback to no scoring
      return suggestions.map(s => ({ ...s, relevanceScore: 0, matchedTags: [] }));
    }
  }
}

// Singleton instance
export const aiService = new AIService();
