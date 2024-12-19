export const pumpRecommendationTemplate = `
<goal>
Generate meme token recommendation for Conflux ConfiPump based on the user provided topics (max 3 recommendations)
</goal>

<context>
Recent messages:
{{recentMessages}}
</context>

<list>
{{tokenList}}
</list>
`;
