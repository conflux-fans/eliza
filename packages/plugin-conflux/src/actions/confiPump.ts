import {
    Action,
    IAgentRuntime,
    Memory,
    State,
    HandlerCallback,
    elizaLogger,
} from "@elizaos/core";
import { generateObject, composeContext, ModelClass } from "@elizaos/core";
import {
    createPublicClient,
    createWalletClient,
    http,
    encodeFunctionData,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { parseUnits, getAddress } from "viem/utils";
import { confiPumpTemplate } from "../templates/confiPump";
import {
    PumpSchema,
    isPumpContent,
    isPumpBuyContent,
    isPumpCreateContent,
    isPumpSellContent,
} from "../types";
import {
    createToken,
    ensureAllowance,
    chainFromRuntime,
} from "../utils/token/chain";
import MEMEABI from "../abi/meme";

// Sample command:

// Main ConfiPump action definition
export const confiPump: Action = {
    name: "CONFI_PUMP",
    description:
        "Perform actions on ConfiPump, especially create a new meme token. This action needs token name, symbol, description and image url.",
    similes: ["CREATE_TOKEN"],
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
            state = (await runtime.composeState(message)) as State;
        } else {
            state = await runtime.updateRecentMessageState(state);
        }

        // Generate content based on template
        const context = composeContext({
            state,
            template: confiPumpTemplate,
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

        // Setup clients and account
        const rpcUrl = runtime.getSetting("CONFLUX_ESPACE_RPC_URL");
        const account = privateKeyToAccount(
            runtime.getSetting("CONFLUX_ESPACE_PRIVATE_KEY") as `0x${string}`
        );
        const walletClient = createWalletClient({
            transport: http(rpcUrl),
        });

        const contentObject = content.object;
        let data: any;
        let value: bigint;

        if (contentObject.action === "REJECT") {
            console.log("reject: ", contentObject.reason);
            if (callback) {
                callback({
                    text: `Action rejected: ${contentObject.reason}`,
                });
            }
            return false;
        }

        try {
            // Handle different action types
            switch (contentObject.action) {
                case "CREATE_TOKEN":
                    if (!isPumpCreateContent(contentObject)) {
                        elizaLogger.error(
                            "Invalid PumpCreateContent: ",
                            contentObject
                        );
                        throw new Error("Invalid PumpCreateContent");
                    }
                    const callbackMessage = await createToken(
                        runtime,
                        contentObject
                    );
                    if (callback) {
                        callback({
                            text: callbackMessage,
                            content: content.object,
                        });
                    }
                    return true;
                    // elizaLogger.log(
                    //     "[Plugin Conflux] creating token with params: ",
                    //     contentObject.params.name,
                    //     contentObject.params.symbol,
                    //     contentObject.params.description,
                    //     contentObject.params.imageUrl
                    // );
                    // const cid = await getImageCIDFromURL(
                    //     runtime.getSetting("CONFLUX_ELIZA_HELPER_URL"),
                    //     contentObject.params.imageUrl
                    // );
                    // const meta = JSON.stringify({
                    //     description: contentObject.params.description,
                    //     image: cid,
                    // });

                    // // set timeout to upload (90 seconds)
                    // setTimeout(async () => {
                    //     await uploadImageUsingURL(
                    //         runtime.getSetting("CONFLUX_ELIZA_HELPER_URL"),
                    //         contentObject.params.imageUrl
                    //     );
                    //     console.log("[Plugin Conflux] image uploaded");
                    // }, 90000);

                    // data = encodeFunctionData({
                    //     abi: MEMEABI,
                    //     functionName: "newToken",
                    //     args: [
                    //         contentObject.params.name,
                    //         contentObject.params.symbol,
                    //         meta,
                    //     ],
                    // });
                    // value = parseEther("10");
                    break;

                case "BUY_TOKEN":
                    if (!isPumpBuyContent(contentObject)) {
                        elizaLogger.error(
                            "Invalid PumpBuyContent: ",
                            contentObject
                        );
                        throw new Error("Invalid PumpBuyContent");
                    }
                    value = parseUnits(
                        contentObject.params.value.toString(),
                        18
                    );
                    elizaLogger.log(
                        "buying: ",
                        contentObject.params.tokenAddress,
                        value
                    );
                    data = encodeFunctionData({
                        abi: MEMEABI,
                        functionName: "buy",
                        args: [
                            contentObject.params.tokenAddress as `0x${string}`,
                            account.address,
                            0n,
                            false,
                        ],
                    });
                    break;

                case "SELL_TOKEN":
                    if (!isPumpSellContent(contentObject)) {
                        elizaLogger.error(
                            "Invalid PumpSellContent: ",
                            contentObject
                        );
                        throw new Error("Invalid PumpSellContent");
                    }
                    const tokenAddress = getAddress(
                        contentObject.params.tokenAddress as `0x${string}`
                    );
                    elizaLogger.log(
                        "selling: ",
                        tokenAddress,
                        account.address,
                        contentObject.params.value
                    );
                    const amountUnits = parseUnits(
                        contentObject.params.value.toString(),
                        18
                    );

                    await ensureAllowance(
                        runtime,
                        tokenAddress as `0x${string}`,
                        amountUnits
                    );

                    data = encodeFunctionData({
                        abi: MEMEABI,
                        functionName: "sell",
                        args: [tokenAddress, amountUnits, 0n],
                    });
                    value = 0n;
                    break;
            }

            // Simulate and execute transaction
            const publicClient = createPublicClient({
                transport: http(rpcUrl),
                chain: chainFromRuntime(runtime),
            });

            const memeContractAddress = runtime.getSetting(
                "CONFLUX_MEME_CONTRACT_ADDRESS"
            ) as `0x${string}`;

            const simulate = await publicClient.call({
                to: memeContractAddress,
                data,
                value,
                account,
            });
            elizaLogger.log("simulate: ", simulate);

            const hash = await walletClient.sendTransaction({
                account,
                to: memeContractAddress,
                data,
                chain: chainFromRuntime(runtime),
                kzg: null,
                value,
            });

            success = true;

            if (callback) {
                console.log("callback: ", callback);
                callback({
                    text: `Perform the action successfully: ${content.object.action}: ${hash}`,
                    content: content.object,
                });
            }
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
