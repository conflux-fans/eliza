import {
    Action,
    IAgentRuntime,
    Memory,
    State,
    HandlerCallback,
    elizaLogger,
} from "@elizaos/core";
import { generateObject, composeContext, ModelClass } from "@elizaos/core";
import { createMemeTemplate } from "../templates/createMeme";
import { PumpSchema, isPumpContent, isPumpCreateContent } from "../types";
import { createToken } from "../utils/token/chain";

// Main ConfiPump action definition
export const createMeme: Action = {
    name: "CREATE_MEME",
    description:
        "Create meme coin on ConfiPump. This action needs token name, symbol, description and image url to initiate. If no enough parameters is provided, remind user to provide enough parameters.",
    similes: ["CREATE_TOKEN", "CONFI_PUMP"],
    examples: [
        // Create token example
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Create a new token called GLITCHIZA with symbol GLITCHIZA and generate a description about it. Photo: https://pbs.twimg.com/media/F68-12QX0AA4-8u?format=jpg&name=large",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Token GLITCHIZA (GLITCHIZA) created successfully!\nContract Address: 0x1234567890abcdef\n",
                    action: "CREATE_TOKEN",
                    content: {
                        tokenInfo: {
                            symbol: "GLITCHIZA",
                            address:
                                "EugPwuZ8oUMWsYHeBGERWvELfLGFmA1taDtmY8uMeX6r",
                            creator:
                                "9jW8FPr6BSSsemWPV22UUCzSqkVdTp6HTyPqeqyuBbCa",
                            name: "GLITCHIZA",
                            description: "A GLITCHIZA token",
                        },
                        amount: "1",
                    },
                },
            },
        ],
        // // Buy token example
        // [
        //     {
        //         user: "{{user1}}",
        //         content: {
        //             text: "Buy 0.00069 CFX worth of GLITCHIZA(0x1234567890abcdef)",
        //         },
        //     },
        //     {
        //         user: "{{user2}}",
        //         content: {
        //             text: "0.00069 CFX bought successfully!",
        //             action: "BUY_TOKEN",
        //             content: {
        //                 address: "0x1234567890abcdef",
        //                 amount: "0.00069",
        //             },
        //         },
        //     },
        // ],
        // // Sell token example
        // [
        //     {
        //         user: "{{user1}}",
        //         content: {
        //             text: "Sell 0.00069 CFX worth of GLITCHIZA(0x1234567890abcdef)",
        //         },
        //     },
        //     {
        //         user: "{{user2}}",
        //         content: {
        //             text: "0.00069 CFX sold successfully: 0x1234567890abcdef",
        //             action: "SELL_TOKEN",
        //             content: {
        //                 address: "0x1234567890abcdef",
        //                 amount: "0.00069",
        //             },
        //         },
        //     },
        // ],
    ],

    validate: async (runtime: IAgentRuntime, message: Memory) => {
        return true; // No extra validation needed
    },

    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state?: State,
        options?: { [key: string]: unknown },
        callback?: HandlerCallback
    ) => {
        let success = false;

        // Initialize or update state
        if (!state) {
            elizaLogger.warn("No state found, composing state");
            state = (await runtime.composeState(message)) as State;
        } else {
            state = await runtime.updateRecentMessageState(state);
        }

        // Generate content based on template
        const context = composeContext({
            state,
            template: createMemeTemplate,
        });

        const content = await generateObject({
            runtime,
            context,
            modelClass: ModelClass.LARGE,
            schema: PumpSchema,
        });

        if (!isPumpContent(content.object)) {
            throw new Error("Invalid content");
        }

        const contentObject = content.object;

        if (contentObject.action === "REJECT") {
            console.log("reject: ", contentObject.reason);
            if (callback) {
                callback({
                    text: `${contentObject.reason}`,
                });
            }
            return false;
        }

        if (!isPumpCreateContent(contentObject)) {
            elizaLogger.error("Invalid PumpCreateContent: ", contentObject);
            throw new Error("Invalid PumpCreateContent");
        }
        try {
            const callbackMessage = await createToken(runtime, contentObject);
            if (callback) {
                callback({
                    text: callbackMessage,
                    content: content.object,
                });
            }
            return true;
        } catch (error) {
            elizaLogger.error(`Error performing the action: ${error}`);
            if (callback) {
                callback({
                    text: `Failed to perform the action: ${content.object.action}: ${error}`,
                });
            }
        }

        return success;
    },
};
