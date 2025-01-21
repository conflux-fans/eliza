import {
    Action,
    IAgentRuntime,
    Memory,
    State,
    HandlerCallback,
    elizaLogger,
} from "@elizaos/core";
import {
    generateObject,
    generateShouldRespond,
    composeContext,
    ModelClass,
} from "@elizaos/core";
import {
    createMemeTemplate,
    shouldCreateMemeTemplate,
} from "../templates/createMeme";
import { PumpSchema, isPumpContent, isPumpCreateContent } from "../types";
import { createToken } from "../utils/token/chain";

// Track daily meme creation count per user
interface UserMemeCount {
    count: number;
    lastResetDate: number;
}
const userMemeCounts: Map<string, UserMemeCount> = new Map();

function resetDailyCountIfNeeded(username: string) {
    const now = new Date();
    const todayStart = now.setHours(0, 0, 0, 0);

    const userCount = userMemeCounts.get(username);
    if (!userCount || todayStart > userCount.lastResetDate) {
        userMemeCounts.set(username, {
            count: 0,
            lastResetDate: todayStart,
        });
    }
}

async function canCreateMeme(runtime: IAgentRuntime, state: State) {
    if (!runtime.getSetting("CONFLUX_MEME_CREATE_TWITTER_RESTRICTION")) {
        return true;
    }

    if (!state.senderUsername) {
        elizaLogger.error("Missing senderUsername in state");
        return false;
    }

    const username = state.senderUsername as string;
    resetDailyCountIfNeeded(username);

    const userCount = userMemeCounts.get(username);
    const dailyLimit = Number(
        runtime.getSetting(
            "CONFLUX_MEME_CREATE_TWITTER_RESTRICTION_DAILY_LIMIT"
        ) || 1
    );

    if (userCount && userCount.count >= dailyLimit) {
        elizaLogger.warn(
            `Daily meme creation limit (${dailyLimit}) reached for user ${username}`
        );
        throw new Error(
            `Daily meme creation limit (${dailyLimit}) reached for user ${username}`
        );
    }

    // Check if required state values exist
    if (!state.senderFollowersCount) {
        elizaLogger.error("Missing senderFollowersCount in state");
        return false;
    }

    if (!state.senderRecentTweets) {
        elizaLogger.error("Missing senderRecentTweets in state");
        return false;
    }

    if (!state.senderCreatedAt) {
        elizaLogger.error("Missing senderCreatedAt in state");
        return false;
    }
    const senderFollowersCount = state.senderFollowersCount as number;
    // const senderRecentTweets = state.senderRecentTweets as any[];
    const senderCreatedAt = state.senderCreatedAt as number;

    elizaLogger.info(
        `senderFollowersCount (${typeof senderFollowersCount}): `,
        senderFollowersCount
    );
    elizaLogger.info(
        `senderCreatedAt (${senderCreatedAt.constructor.name}): `,
        senderCreatedAt
    );

    if (
        senderFollowersCount <
        Number(
            runtime.getSetting(
                "CONFLUX_MEME_CREATE_TWITTER_RESTRICTION_MIN_FOLLOWERS"
            )
        )
    ) {
        throw new Error(`Do not have enough followers to create a meme`);
    }

    const minDaysPeriod = Number(
        runtime.getSetting(
            "CONFLUX_MEME_CREATE_TWITTER_RESTRICTION_MIN_CREATED_DAY_PERIOD"
        )
    );
    const daysDiff = (Date.now() - senderCreatedAt) / (1000 * 60 * 60 * 24);
    if (daysDiff < minDaysPeriod) {
        throw new Error(
            `Need to wait for ${minDaysPeriod} days since you created your account to create a meme`
        );
    }

    const context = composeContext({
        state,
        template: shouldCreateMemeTemplate,
    });

    const shouldRespond = await generateShouldRespond({
        runtime,
        context,
        modelClass: ModelClass.SMALL,
    });

    if (shouldRespond !== "RESPOND") {
        elizaLogger.warn("Should not respond");
        return false;
    }

    return true;
}

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

        try {
            // Initialize or update state
            if (!state) {
                elizaLogger.warn("No state found, composing state");
                state = (await runtime.composeState(message)) as State;
            } else {
                state = await runtime.updateRecentMessageState(state);
            }

            if (!(await canCreateMeme(runtime, state))) {
                throw new Error("Not allowed to create coin.");
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
            const callbackMessage = await createToken(runtime, contentObject);

            // Increment daily count for the user after successful creation
            if (runtime.getSetting("CONFLUX_MEME_CREATE_TWITTER_RESTRICTION")) {
                const username = state.senderUsername as string;
                const userCount = userMemeCounts.get(username);
                if (userCount) {
                    userCount.count++;
                    userMemeCounts.set(username, userCount);
                }
            }

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
                    text: `Failed to perform the action: ${error}`,
                });
            }
        }

        return success;
    },
};
