# Interview Scorecard Generator

Generate structured interview scorecards from Granola meeting notes.

## Description
This skill helps you create comprehensive interview scorecards by analyzing meeting notes from Granola. It generates a recommendation and detailed evaluation across key categories.

## How to Use
1. Make sure you have a Granola meeting recorded
2. In Strategize, select the "granola" context
3. Type: "Create an interview scorecard for [candidate name] from my recent meeting"

## Output Format

The scorecard will include:

### Overall Recommendation
Choose one of:
- **Definitely Not** - Clear no-hire signal
- **No** - Does not meet bar
- **Yes** - Meets bar, would hire
- **Strong Yes** - Exceeds bar, strong hire signal

### Structured Evaluation

**Conclusions**
- Summary of overall assessment
- Key takeaways from the interview
- Final thoughts on candidate fit

**Pros**
- Strengths demonstrated during the interview
- Positive signals and standout qualities
- Skills and experience that align well with role

**Cons**
- Concerns or gaps identified
- Areas where candidate fell short
- Skills or experience that need development

**Things to Follow Up On**
- Questions that need clarification
- Areas to probe in next round
- References or examples to verify

## Instructions for Claude

When generating an interview scorecard:

1. **Fetch Meeting Data**: Use the Granola MCP to retrieve the meeting transcript and notes
   - Ask user which meeting if multiple recent meetings exist
   - Confirm the candidate name and role being interviewed for

2. **Analyze the Interview**: Review the meeting transcript for:
   - Technical skills and competencies discussed
   - Behavioral signals and soft skills
   - Answers to key interview questions
   - Questions the candidate asked
   - Overall engagement and communication style

3. **Make a Recommendation**: Based on the analysis, determine:
   - Does the candidate meet the bar for this role?
   - What's the confidence level in this assessment?
   - Choose appropriate recommendation tier

4. **Structure the Output**: Format as follows:

```markdown
# Interview Scorecard: [Candidate Name]

**Role**: [Position]
**Interviewer**: [Your Name]
**Date**: [Interview Date]

---

## Overall Recommendation: [Definitely Not / No / Yes / Strong Yes]

---

## Conclusions

[2-3 paragraphs summarizing the overall assessment. Include the big picture view of the candidate, how they compare to the bar for the role, and any key decision factors.]

---

## Pros

- [Strength 1 with specific example from interview]
- [Strength 2 with specific example from interview]
- [Strength 3 with specific example from interview]
- [Additional strengths as relevant]

---

## Cons

- [Concern 1 with specific example from interview]
- [Concern 2 with specific example from interview]
- [Concern 3 with specific example from interview]
- [Additional concerns as relevant]

---

## Things to Follow Up On

- [Question or area to probe further]
- [Reference check or verification needed]
- [Skill or experience to validate in next round]
- [Additional follow-ups as relevant]

---

**Notes**: [Any additional context, caveats, or observations that don't fit above categories]
```

5. **Be Specific**: Always include:
   - Concrete examples from the interview transcript
   - Direct quotes when relevant
   - Specific technical details discussed
   - Quantifiable signals when available

6. **Be Balanced**: Ensure the scorecard is:
   - Fair and objective
   - Based on evidence from the interview
   - Comprehensive (covering both strengths and concerns)
   - Actionable (clear next steps)

## Example Prompts

- "Generate an interview scorecard for Jane Doe from my meeting yesterday"
- "Create a scorecard for the PM interview I just completed"
- "Pull my last Granola meeting and write up an interview scorecard"
- "Interview scorecard for John Smith - Product Manager role"

## Tips

- The more detailed your Granola notes, the better the scorecard
- Include role requirements in your prompt for better context
- Review and edit the generated scorecard before sharing
- Use specific examples to justify your recommendation
