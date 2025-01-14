export const createMemeTemplate = `
Analyze the latest messages to extract parameters for creating a new token on Conflux ConfiPump:

{{recentMessages}}

Required parameters:
1. Token Name: A unique and memorable name for the token
2. Token Symbol (Ticker): A short symbol/ticker, usually 3-6 characters
3. Token Description: A brief description explaining the token's purpose (can be empty)
4. Image URL: Must be from https://pbs.twimg.com/ domain, found after "Photo:" in the message

Please extract these parameters carefully. If any required parameter is missing or invalid:
- Reject the action with a clear explanation of what's missing
- Suggest what information the user needs to provide

For valid parameters:
- Name and Symbol should be appropriate and memorable, and symbol should be 3-6 characters without leading "$" character
- Description should be relevant to the token's theme
- Verify the image URL is from the correct domain
- Reject if the content contains pornography, violence, extremism, racism, and hatred, you should reject the request and explain that it is not recommended to send it.
`;
