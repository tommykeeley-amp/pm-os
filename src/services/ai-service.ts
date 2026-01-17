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

      // Get current context
      const now = new Date();
      const currentHour = now.getHours();
      const timeOfDay = currentHour < 12 ? 'morning' : currentHour < 17 ? 'afternoon' : 'evening';
      const dayOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][now.getDay()];

      // Create a comprehensive prompt for GPT to intelligently filter suggestions
      const prompt = `You are an intelligent task management assistant. It's ${timeOfDay} on ${dayOfWeek}. Analyze these suggestions and select the 5 MOST ACTIONABLE and RELEVANT tasks for RIGHT NOW.

${hasProjectTags ? `Current Projects: ${tagLabels.join(', ')}\n` : ''}
Task Suggestions:
${suggestions.map((s, i) => `${i + 1}. "${s.title}" (${s.source}) - ${s.context || 'no context'}`).join('\n')}

Select the 5 MOST IMPORTANT tasks considering:

✅ PRIORITIZE THESE:
1. **Urgency** - Deadlines, time-sensitive items, things needed TODAY
2. **Actionability** - Clear next steps (not vague or FYI)
3. **Impact** - Blocks other work, affects team, critical path items
4. **Timing** - Appropriate for ${timeOfDay} (complex work vs quick replies)
5. **Relevance** - ${hasProjectTags ? 'Matches current projects' : 'Core work responsibilities'}
6. **Sender/Source Importance** - From key stakeholders, leadership, or critical systems
7. **Recency** - Recently mentioned (today/yesterday) = likely more urgent
8. **Meeting Proximity** - Related to upcoming meetings (prep needed)
9. **Response Expected** - Someone waiting on you specifically
10. **Business Hours** - ${timeOfDay === 'evening' ? 'Prefer async tasks for evening' : 'Prefer collaborative tasks during work hours'}

❌ FILTER OUT:
- Informational emails (newsletters, updates, FYI)
- Routine calendar events (no prep needed, just attend)
- Messages that are just status updates
- Low-priority vague items with no clear action
- Tasks better suited for different times (deep work in morning, admin in afternoon)
- Duplicate or redundant items
- Tasks with unclear requirements (need more info first)
- Items that can wait until later this week

🎯 ADDITIONAL CONTEXT:
- ${timeOfDay === 'morning' ? 'Morning: Favor deep work, strategic tasks, creative work' : ''}
- ${timeOfDay === 'afternoon' ? 'Afternoon: Favor meetings prep, collaborative work, quick wins' : ''}
- ${timeOfDay === 'evening' ? 'Evening: Favor async work, planning, review tasks' : ''}
- ${dayOfWeek === 'Monday' ? 'Monday: Prioritize week planning, high-priority items' : ''}
- ${dayOfWeek === 'Friday' ? 'Friday: Prioritize week wrap-up, urgent closures' : ''}

For EACH of the 5 selected tasks:
- Score relevance from 1-10 (how actionable/important RIGHT NOW)
- ${hasProjectTags ? 'Identify matching project tags' : 'Leave matchedTags empty'}
- Brief reasoning (1 sentence)

Respond in JSON format:
{
  "selectedTasks": [
    {
      "taskIndex": 2,
      "relevanceScore": 9,
      "matchedTags": ["frontend", "API"],
      "reasoning": "Critical production bug needs immediate fix before EOD"
    }
  ]
}

ONLY return UP TO 5 tasks. If fewer than 5 are truly actionable right now, return fewer. Quality over quantity.`;

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
