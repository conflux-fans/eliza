import {
    Action,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    State,
} from "@elizaos/core";
import { generateText, composeContext, ModelClass } from "@elizaos/core";
import { pumpRecommendationTemplate } from "../templates/pumpRecommendation";

interface TokenInfo {
    address: `0x${string}`;
    name: string;
    symbol: string;
    description: string;
    progress: number;
}

async function getTokenList(elizaHelperUrl: string): Promise<TokenInfo[]> {
    const response = await fetch(`${elizaHelperUrl}/api/getTokenList`);
    const data = await response.json();
    return data["tokenList"];
}

export const recommend: Action = {
    name: "RECOMMEND",
    description:
        "Generate meme token recommendation for Conflux ConfiPump based on the user request",
    similes: ["RECOMMEND_CONFI_PUMP"],
    examples: [],

    validate: async (runtime: IAgentRuntime, message: Memory) => {
        return runtime.getSetting("CONFLUX_MEME_SUBGRAPH_URL") !== "";
    },

    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state?: State,
        options?: { [key: string]: unknown },
        callback?: HandlerCallback
    ) => {
        let success = false;

        const tokenList = await getTokenList(
            runtime.getSetting("CONFLUX_ELIZA_HELPER_URL")
        );

        // Initialize or update state
        if (!state) {
            state = (await runtime.composeState(message, {
                tokenList: tokenList
                    .map((token) => {
                        return `${token.progress}% $${token.symbol} (${token.name}) ${token.address} - ${token.description}`;
                    })
                    .join("\n"),
            })) as State;
        } else {
            state = await runtime.updateRecentMessageState(state);
            state.tokenList = tokenList
                .map((token) => {
                    return `${token.progress}% $${token.symbol} (${token.name}) ${token.address} - ${token.description}`;
                })
                .join("\n");
        }

        // Generate content based on template
        const context = composeContext({
            state,
            template: pumpRecommendationTemplate,
        });

        console.log(context);

        const responseText = await generateText({
            runtime,
            context,
            modelClass: ModelClass.LARGE,
        });

        try {
            success = true;

            if (callback) {
                callback({
                    text: responseText,
                });
            }
        } catch (error) {
            console.error(`Error performing the action: ${error}`);
            if (callback) {
                callback({
                    text: `Failed to perform the recommendation: ${error}`,
                });
            }
        }

        return success;
    },
};
