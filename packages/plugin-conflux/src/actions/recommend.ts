import {
    Action,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    State,
} from "@ai16z/eliza";
import { generateObject, composeContext, ModelClass } from "@ai16z/eliza";
import {
    PumpInfoProvider,
    pumpInfoProviderGetter,
} from "../providers/pumpInfoProvider";
import {
    PumpRecommendationSchema,
    isPumpRecommendationContent,
} from "../types";
import { pumpRecommendationTemplate } from "../templates/pumpRecommendation";

export const recommend: Action = {
    name: "RECOMMEND",
    description:
        "Generate meme token recommendation for Conflux ConfiPump based on the user provided topics",
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

        const pumpInfoProvider = (await pumpInfoProviderGetter.get(
            runtime,
            message,
            state
        )) as PumpInfoProvider;

        const tokenList = await pumpInfoProvider.client.getTokenCreateds();

        // Initialize or update state
        if (!state) {
            state = (await runtime.composeState(message, {
                tokenList: JSON.stringify(tokenList),
            })) as State;
        } else {
            state = await runtime.updateRecentMessageState(state);
            state.tokenList = JSON.stringify(
                tokenList.map((token) => ({
                    name: token.name,
                    symbol: token.symbol,
                    address: token.token,
                    meta: token.meta,
                }))
            );
        }

        // Generate content based on template
        const context = composeContext({
            state,
            template: pumpRecommendationTemplate,
        });

        console.log(context);

        const content = await generateObject({
            runtime,
            context,
            modelClass: ModelClass.LARGE,
            schema: PumpRecommendationSchema,
        });

        if (!isPumpRecommendationContent(content.object)) {
            throw new Error("Invalid content");
        }

        const contentObject = content.object;

        try {
            success = true;

            if (callback) {
                callback({
                    text: `Here are the tokens that I recommend for you: ${contentObject.tokenList
                        .map((token) => {
                            return `${token.address} ${token.symbol} (${token.name}): ${token.description}`;
                        })
                        .join(", ")}`,
                    content: content.object,
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
