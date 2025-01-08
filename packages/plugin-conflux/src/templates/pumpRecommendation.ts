const confiPumpUrl = process.env.CONFLUX_CONFI_PUMP_URL;
if (!confiPumpUrl) {
    throw new Error("CONFLUX_CONFI_PUMP_URL is not set");
}

export const pumpRecommendationTemplate = `
<goal>
Generate meme token recommendation for Conflux ConfiPump based on the user provided topics (1~2 recommendations) and state why. The user might specify graduate or ungraduate tokens, if not specified, should consider both "graduate" and "ungraduate" tokens. Should provide token link in the form of ${confiPumpUrl}/tokens/<token_address>.

Don't explicitly mention the progress of the token.
Don't use markdown format.
</goal>

<context>
Recent messages:
{{recentMessages}}
</context>

<list>
The token list is in the form of "<progress>% <ticker>(<name>) <address> - <description>". The progress is a number between 0 and 100. People buy tokens and so the progress rises. If the progress is greater than 80%, the token will be considered as "graduate".

{{tokenList}}
</list>
`;
