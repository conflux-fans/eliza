import { shouldRespondFooter } from "@elizaos/core";

export const createMemeTemplate = `
Analyze the latest messages to extract parameters for creating a new token on Conflux ConfiPump:

{{formattedConversation}}

{{recentMessages}}

Required parameters:
1. Token Name: A unique and memorable name for the token
2. Token Symbol (Ticker): A short symbol/ticker
3. Token Description(can not be empty): A brief description explaining the token's purpose
4. Image: image URL found after "Photo:" in the message, typically from https://pbs.twimg.com/ domain

Please extract these parameters carefully. If any required parameter is missing or invalid:
- Reject the action with a clear explanation of what's missing
- Suggest what information the user needs to provide

For valid parameters:
- Name and Symbol should be appropriate and memorable, and symbol should be 3-6 characters without leading "$" character
- Description should be relevant to the token's theme
- Verify the image URL is from the correct domain
- Reject if the content contains pornography, violence, extremism, racism, and hatred, you should reject the request and explain reason: "The content you provided seems to contain inappropriate information. Please modify it and contact me again."
`;

export const shouldCreateMemeOnRecentHistoryTemplate =
    `# TASK
Evaluate whether {{agentName}} (@{{twitterUserName}}) should engage with this message based on the following criteria:

# EVALUATION CRITERIA
Sender History Analysis:
- Conduct a historical analysis of a sender's recent tweets to identify that includes violence, pornography, pyramid schemes, hate speech, or racial discrimination.
- Analyze the sender's recent tweets for explicit or implicit violations.
- Use natural language processing to detect nuanced language that may indicate harmful intent.

# CONTEXT
Sender's Recent Activity:
{{senderRecentTweets}}

# RESPONSE OPTIONS
- [RESPOND] - If the interaction appears legitimate and appropriate
- [IGNORE] - If the message does not require a response
- [STOP] - If sender shows concerning behavior or inappropriate content

# OUTPUT INSTRUCTION
Provide exactly one of the response options above based on your evaluation.` +
    shouldRespondFooter;
