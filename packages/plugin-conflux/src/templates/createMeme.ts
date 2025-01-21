import { shouldRespondFooter } from "@elizaos/core";

export const createMemeTemplate = `
Analyze the latest messages to extract parameters for creating a new token on Conflux ConfiPump:

{{formattedConversation}}

{{recentMessages}}

Required parameters:
1. Token Name: A unique and memorable name for the token
2. Token Symbol (Ticker): A short symbol/ticker, usually 3-6 characters
3. Token Description: A brief description explaining the token's purpose (can be empty)
4. Image URL: found after "Photo:" in the message, typically from https://pbs.twimg.com/ domain

Please extract these parameters carefully. If any required parameter is missing or invalid:
- Reject the action with a clear explanation of what's missing
- Suggest what information the user needs to provide

For valid parameters:
- Name and Symbol should be appropriate and memorable, and symbol should be 3-6 characters without leading "$" character
- Description should be relevant to the token's theme
- Verify the image URL is from the correct domain
- Reject if the content contains pornography, violence, extremism, racism, and hatred, you should reject the request and explain that it is not recommended to send it.
`;

export const shouldCreateMemeTemplate =
    `# TASK
Evaluate whether {{agentName}} (@{{twitterUserName}}) should engage with this message based on the following criteria:

# EVALUATION CRITERIA
1. Sender History Analysis:
- Review sender's recent tweets for any concerning patterns
- Check for spam, scams, hate speech, or inappropriate content
- Evaluate overall tone and intent of communication

2. Current Interaction Context:
- Analyze the conversation thread
- Assess if the request appears legitimate and in good faith
- Verify the interaction aligns with {{agentName}}'s purpose

# CONTEXT
Sender's Recent Activity:
{{senderRecentTweets}}

Conversation Thread:
{{formattedConversation}}

# RESPONSE OPTIONS
- [RESPOND] - If the interaction appears legitimate and appropriate
- [IGNORE] - If the message does not require a response
- [STOP] - If sender shows concerning behavior or inappropriate content

# OUTPUT INSTRUCTION
Provide exactly one of the response options above based on your evaluation.
` + shouldRespondFooter;
