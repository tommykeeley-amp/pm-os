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
   * Use AI to intelligently filter suggestions to the most actionable ones
   */
  async filterActionableSuggestions(
    suggestions: Suggestion[],
    projectTags: TaskTag[]
  ): Promise<ScoredSuggestion[]> {
    if (!this.isAvailable()) {
      return suggestions.map(s => ({ ...s, relevanceScore: 0, matchedTags: [] }));
    }

    try {
      const tagLabels = projectTags.map(t => t.label);
      const hasProjectTags = projectTags.length > 0;

      // Create a comprehensive prompt for GPT to intelligently filter suggestions
      const prompt = `You are an intelligent task management assistant. Analyze these suggestions and select the 5 MOST ACTIONABLE and RELEVANT tasks.

${hasProjectTags ? `Current Projects: ${tagLabels.join(', ')}\n` : ''}
Task Suggestions:
${suggestions.map((s, i) => `${i + 1}. "${s.title}" (${s.source}) - ${s.context || 'no context'}`).join('\n')}

Select the 5 MOST IMPORTANT tasks that:
1. Require immediate action or response
2. Are clearly actionable (not just FYI)
3. Have deadlines or time sensitivity
4. ${hasProjectTags ? 'Match current project work' : 'Are high-priority work items'}
5. Represent genuine work that needs to be done

DO NOT include:
- Informational emails that don't require action
- Calendar events that are just attendance (no prep needed)
- Messages that are just updates/FYI
- Low-priority or vague items

For EACH of the 5 selected tasks:
- Score relevance from 1-10 (how actionable/important)
- ${hasProjectTags ? 'Identify matching project tags' : 'Leave matchedTags empty'}

Respond in JSON format:
{
  "selectedTasks": [
    {
      "taskIndex": 2,
      "relevanceScore": 9,
      "matchedTags": ["frontend", "API"],
      "reasoning": "Needs immediate response about production bug"
    }
  ]
}

ONLY return 5 tasks maximum. Be selective and smart.`;

      const response = await this.openai!.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'You are an expert at prioritizing tasks and identifying actionable work. Be selective and only suggest tasks that truly require action.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 1500,
      });

      const content = response.choices[0].message.content;
      if (!content) {
        throw new Error('No response from AI');
      }

      console.log('[AIService] AI Response:', content);

      const result = JSON.parse(content);

      // Map only the selected tasks back
      const selectedSuggestions: ScoredSuggestion[] = result.selectedTasks.map((task: any) => {
        const originalSuggestion = suggestions[task.taskIndex];
        return {
          ...originalSuggestion,
          relevanceScore: task.relevanceScore || 0,
          matchedTags: task.matchedTags || [],
        };
      });

      console.log(`[AIService] AI selected ${selectedSuggestions.length} actionable tasks from ${suggestions.length} suggestions`);

      return selectedSuggestions;
    } catch (error) {
      console.error('[AIService] Failed to filter suggestions:', error);
      // Fallback to no scoring
      return suggestions.slice(0, 5).map(s => ({ ...s, relevanceScore: 0, matchedTags: [] }));
    }
  }

  /**
   * Legacy method - redirects to new intelligent filtering
   */
  async matchSuggestionsToTags(
    suggestions: Suggestion[],
    projectTags: TaskTag[]
  ): Promise<ScoredSuggestion[]> {
    return this.filterActionableSuggestions(suggestions, projectTags);
  }
}

// Singleton instance
export const aiService = new AIService();
