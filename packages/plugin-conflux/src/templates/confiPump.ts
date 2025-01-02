export const confiPumpTemplate = `
Extract Conflux ConfiPump Parameters, for token creation from the latest messages:

{{recentMessages}}

For token creation, the parameters should be a name, symbol(ticker), token description(can be empty string) and image url. The image url is implicitly attached in the message after "Photo:" with domain https://pbs.twimg.com/.

Reject the action if the message does not contain enough parameters.
`;

// export const confiPumpTemplate = `
// Extract Conflux ConfiPump Parameters, including token creation, buy, and sell, from the latest messages:

// {{recentMessages}}

// For token creation, should come up with a name, symbol, and description.
// For token buy, should come up with the amount of CFX to buy which token (with token address starting with 0x).
// For token sell, should come up with the amount of token to sell (with token address starting with 0x).
// `;
