import { SearchMode, Tweet } from "agent-twitter-client";
import {
    composeContext,
    generateMessageResponse,
    // generateShouldRespond,
    messageCompletionFooter,
    // shouldRespondFooter,
    Content,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    ModelClass,
    State,
    stringToUuid,
    elizaLogger,
    getEmbeddingZeroVector,
    IImageDescriptionService,
    ServiceType,
} from "@elizaos/core";
import { ClientBase } from "./base.ts";
import { buildConversationThread, sendQuoteTweet, wait } from "./utils.ts";

const ConfiPumpHashTag = process.env.CONFLUX_CONFI_PUMP_HASHTAG;

if (!ConfiPumpHashTag) {
    throw new Error("CONFLUX_CONFI_PUMP_HASHTAG is not set");
}

export const twitterMessageHandlerTemplate =
    `<persona>
You are a blockchain researcher with over 5 years of expertise in the cryptocurrency and blockchain industry. You specialize in analyzing social media content, particularly tweets, to identify trends and generate engaging, on-brand responses.
</persona>

<task>
Analyze a given tweet and identify if it contains information related to ConfiPump or meme coins. Based on the identified content, generate a concise, positive, casual, confident, and humorous response that aligns with the theme. Use an overly confident tone, avoid overly technical language, and ensure the response is no longer than 20 words. Include the #${ConfiPumpHashTag} hashtag where appropriate.
</task>

<guidelines>
1. Focus on identifying keywords or phrases related to ConfiPump or meme coins.
2. Maintain a lighthearted and confident tone throughout the response.
3. Ensure the response is concise and engaging, fitting within the 20-word limit.
4. Use the #${ConfiPumpHashTag} hashtag when the content aligns with the theme.
</guidelines>

<examples>
Example 1:
Tweet: "What happens after completing the bonding curve?

📌The total supply of #memecoins is fixed at 1 billion. A total of 800 million memecoins were minted, raising 57,000 CFX. From this amount, 570 CFX are deducted—half as a migration fee and half as a reward for the meme creator.

👨‍💻After this, the remaining 56,430 CFX and 200 million unreleased memecoins, will be added to the liquidity pool on
@SwappiDEX
 and then burned."
Response: "800M minted, 200M coins set for burn 🔥—the meme coin journey is just getting started! 🚀 #${ConfiPumpHashTag}"

Example 2:
Tweet: "Remember, in this market, 'HODL' stands for 'Hold On for Dear Life' while watching your investment do the moonwalk... or just walk off a cliff. 🐱💸"
Response: "HODL: where the only thing more unpredictable than the market is your emotions. 🚀💸 #${ConfiPumpHashTag}"
</examples>
` + messageCompletionFooter;

// export const twitterShouldQuoteTemplate = (targetUsersStr: string) =>
//     `# INSTRUCTIONS: Determine if {{agentName}} (@{{twitterUserName}}) should quote the message and participate in the conversation. Do not comment. Just respond with "true" or "false".

// Response options are RESPOND, IGNORE and STOP.

// PRIORITY RULE: ALWAYS RESPOND to these users regardless of topic or message content: ${targetUsersStr}. Topic relevance should be ignored for these users.

// For other users:
// - {{agentName}} should RESPOND to messages directed at them
// - {{agentName}} should RESPOND to conversations relevant to their background
// - {{agentName}} should RESPOND to conversations if they are positive about ConfiPump or Conflux
// - {{agentName}} should IGNORE irrelevant messages
// - {{agentName}} should IGNORE very short messages unless directly addressed
// - {{agentName}} should IGNORE messages that display negativity, such as slander, insults, or unfounded rumors.
// - {{agentName}} should STOP if asked to stop
// - {{agentName}} should STOP if conversation is concluded

// IMPORTANT:
// - {{agentName}} (aka @{{twitterUserName}}) is particularly sensitive about being annoying, so if there is any doubt, it is better to IGNORE than to RESPOND.
// - For users not in the priority list, {{agentName}} (@{{twitterUserName}}) should err on the side of IGNORE rather than RESPOND if in doubt.

// Recent Posts:
// {{recentPosts}}

// Current Post:
// {{currentPost}}

// Thread of Tweets You Are Replying To:
// {{formattedConversation}}

// # INSTRUCTIONS: Respond with [RESPOND] if {{agentName}} should respond, or [IGNORE] if {{agentName}} should not respond to the last message and [STOP] if {{agentName}} should stop participating in the conversation.
// ` + shouldRespondFooter;

export class TwitterQuoteClient {
    client: ClientBase;
    runtime: IAgentRuntime;
    private isDryRun: boolean;
    constructor(client: ClientBase, runtime: IAgentRuntime) {
        this.client = client;
        this.runtime = runtime;
        this.isDryRun = this.client.twitterConfig.TWITTER_DRY_RUN;
    }

    async start() {
        const handleTwitterQuoteLoop = async () => {
            try {
                await this.handleTwitterQuote();
            } catch (error) {
                elizaLogger.error(`Error in handleTwitterQuote: ${error}`);
            }
            setTimeout(
                handleTwitterQuoteLoop,
                // Defaults to 2 minutes
                this.client.twitterConfig.TWITTER_POLL_INTERVAL * 1000
            );
        };
        handleTwitterQuoteLoop();
    }

    getTargetUsers() {
        let targetUsers = [];
        if (this.client.twitterConfig.TWITTER_QUOTE_TARGET_USERS.length > 0) {
            targetUsers = this.client.twitterConfig.TWITTER_QUOTE_TARGET_USERS;
        }

        return targetUsers;
    }

    async getCandidateTweets() {
        const candidateTweets: Tweet[] = [];
        for (const targetUser of this.getTargetUsers()) {
            const tweets = await this.client.twitterClient.fetchSearchTweets(
                `from:${targetUser}`,
                10,
                SearchMode.Latest
            );
            candidateTweets.push(...tweets.tweets);
        }
        const validTweets = candidateTweets.filter((tweet) => {
            const isUnprocessed =
                !this.client.lastCheckedTweetId ||
                parseInt(tweet.id) > this.client.lastCheckedTweetId;
            const isRecent =
                Date.now() - tweet.timestamp * 1000 < 2 * 60 * 60 * 1000;

            elizaLogger.debug(`Tweet ${tweet.id} checks:`, {
                isUnprocessed,
                isRecent,
                isReply: tweet.isReply,
                isRetweet: tweet.isRetweet,
            });

            return (
                isUnprocessed && !tweet.isReply && !tweet.isRetweet && isRecent
            );
        });
        return validTweets;
    }

    async handleTwitterQuote() {
        elizaLogger.log("Checking Twitter Quote");
        const uniqueTweetCandidates = await this.getCandidateTweets();

        // Sort tweet candidates by ID in ascending order
        uniqueTweetCandidates
            .sort((a, b) => a.id.localeCompare(b.id))
            .filter((tweet) => tweet.userId !== this.client.profile.id);

        // for each tweet candidate, handle the tweet
        for (const tweet of uniqueTweetCandidates) {
            if (
                !this.client.lastCheckedTweetId ||
                BigInt(tweet.id) > this.client.lastCheckedTweetId
            ) {
                // Generate the tweetId UUID the same way it's done in handleTweet
                const tweetId = stringToUuid(
                    tweet.id + "-" + this.runtime.agentId
                );

                // Check if we've already processed this tweet
                const existingResponse =
                    await this.runtime.messageManager.getMemoryById(tweetId);

                if (existingResponse) {
                    elizaLogger.log(
                        `Already responded to tweet ${tweet.id}, skipping`
                    );
                    continue;
                }
                elizaLogger.log("New Tweet found", tweet.permanentUrl);

                const roomId = stringToUuid(
                    tweet.conversationId + "-" + this.runtime.agentId
                );

                const userIdUUID =
                    tweet.userId === this.client.profile.id
                        ? this.runtime.agentId
                        : stringToUuid(tweet.userId!);

                await this.runtime.ensureConnection(
                    userIdUUID,
                    roomId,
                    tweet.username,
                    tweet.name,
                    "twitter"
                );

                const thread = await buildConversationThread(
                    tweet,
                    this.client
                );

                const message = {
                    content: {
                        text: tweet.text,
                        attachments: tweet.photos.map((p) => ({
                            id: p.id,
                            url: p.url,
                            title: p.alt_text || "",
                            source: "twitter",
                            description: p.alt_text || "",
                            text: p.alt_text || "",
                            contentType: "photo",
                        })),
                    },
                    agentId: this.runtime.agentId,
                    userId: userIdUUID,
                    roomId,
                };

                await this.handleTweet({
                    tweet,
                    message,
                    thread,
                });

                // Update the last checked tweet ID after processing each tweet
                this.client.lastCheckedTweetId = BigInt(tweet.id);
            } else {
                elizaLogger.debug(
                    "Skipping tweet because it has already been processed",
                    tweet.id
                );
            }
        }

        // Save the latest checked tweet ID to the file
        await this.client.cacheLatestCheckedTweetId();

        elizaLogger.log("Finished checking Twitter quote");
    }

    private async handleTweet({
        tweet,
        message,
        thread,
    }: {
        tweet: Tweet;
        message: Memory;
        thread: Tweet[];
    }) {
        if (tweet.userId === this.client.profile.id) {
            // console.log("skipping tweet from bot itself", tweet.id);
            // Skip processing if the tweet is from the bot itself
            return;
        }

        if (!message.content.text) {
            elizaLogger.log("Skipping Tweet with no text", tweet.id);
            return { text: "", action: "IGNORE" };
        }

        elizaLogger.log("Processing Tweet: ", tweet.id);
        const formatTweet = (tweet: Tweet) => {
            let formatted = `  ID: ${tweet.id}
  From: ${tweet.name} (@${tweet.username})
  Text: ${tweet.text}
  `;
            if (tweet.photos.length != 0) {
                formatted += `  Photos: ${tweet.photos.map((p) => p.url).join(", ")}`;
            }
            return formatted;
        };
        const currentPost = formatTweet(tweet);

        elizaLogger.debug("Thread: ", thread);
        const formattedConversation = thread
            .map(
                (tweet) => `@${tweet.username} (${new Date(
                    tweet.timestamp * 1000
                ).toLocaleString("en-US", {
                    hour: "2-digit",
                    minute: "2-digit",
                    month: "short",
                    day: "numeric",
                })}):
        ${tweet.text}${tweet.photos.length > 0 ? `\nPhoto: ${tweet.photos.map((p) => p.url).join(", ")}` : ""}`
            )
            .join("\n\n");

        elizaLogger.debug("formattedConversation: ", formattedConversation);

        const imageDescriptionsArray = [];
        try {
            elizaLogger.debug("Getting images");
            for (const photo of tweet.photos) {
                elizaLogger.debug(photo.url);
                const description = await this.runtime
                    .getService<IImageDescriptionService>(
                        ServiceType.IMAGE_DESCRIPTION
                    )
                    .describeImage(photo.url);
                imageDescriptionsArray.push(description);
            }
        } catch (error) {
            // Handle the error
            elizaLogger.error("Error Occured during describing image: ", error);
        }

        let state = await this.runtime.composeState(message, {
            twitterClient: this.client.twitterClient,
            twitterUserName: this.client.twitterConfig.TWITTER_USERNAME,
            currentPost,
            formattedConversation,
            imageDescriptions:
                imageDescriptionsArray.length > 0
                    ? `\nImages in Tweet:\n${imageDescriptionsArray
                          .map(
                              (desc, i) =>
                                  `Image ${i + 1}: Title: ${desc.title}\nDescription: ${desc.description}`
                          )
                          .join("\n\n")}`
                    : "",
        });

        // check if the tweet exists, save if it doesn't
        const tweetId = stringToUuid(tweet.id + "-" + this.runtime.agentId);
        const tweetExists =
            await this.runtime.messageManager.getMemoryById(tweetId);

        if (!tweetExists) {
            elizaLogger.log("tweet does not exist, saving");
            const userIdUUID = stringToUuid(tweet.userId as string);
            const roomId = stringToUuid(tweet.conversationId);

            const message = {
                id: tweetId,
                agentId: this.runtime.agentId,
                content: {
                    text: tweet.text,
                    url: tweet.permanentUrl,
                    inReplyTo: tweet.inReplyToStatusId
                        ? stringToUuid(
                              tweet.inReplyToStatusId +
                                  "-" +
                                  this.runtime.agentId
                          )
                        : undefined,
                    attachments: tweet.photos.map((p) => ({
                        id: p.id,
                        url: p.url,
                        title: p.alt_text || "",
                        source: "twitter",
                        description: p.alt_text || "",
                        text: p.alt_text || "",
                        contentType: "photo",
                    })),
                },
                userId: userIdUUID,
                roomId,
                createdAt: tweet.timestamp * 1000,
            };
            this.client.saveRequestMessage(message, state);
        }

        // // get usernames into str
        // const validTargetUsersStr = this.getTargetUsers().join(",");

        // const shouldRespondContext = composeContext({
        //     state,
        //     template:
        //         this.runtime.character.templates
        //             ?.twitterShouldRespondTemplate ||
        //         this.runtime.character?.templates?.shouldRespondTemplate ||
        //         twitterShouldQuoteTemplate(validTargetUsersStr),
        // });

        // const shouldRespond = await generateShouldRespond({
        //     runtime: this.runtime,
        //     context: shouldRespondContext,
        //     modelClass: ModelClass.SMALL,
        // });

        // // Promise<"RESPOND" | "IGNORE" | "STOP" | null> {
        // if (shouldRespond !== "RESPOND") {
        //     elizaLogger.log("Not responding to message");
        //     return { text: "Response Decision:", action: shouldRespond };
        // }

        const context = composeContext({
            state,
            template:
                this.runtime.character.templates
                    ?.twitterMessageHandlerTemplate ||
                this.runtime.character?.templates?.messageHandlerTemplate ||
                twitterMessageHandlerTemplate,
        });
        elizaLogger.debug("Quote prompt:\n" + context);

        const response = await generateMessageResponse({
            runtime: this.runtime,
            context,
            modelClass: ModelClass.LARGE,
        });

        const removeQuotes = (str: string) =>
            str.replace(/^['"](.*)['"]$/, "$1");

        const stringId = stringToUuid(tweet.id + "-" + this.runtime.agentId);

        response.inReplyTo = stringId;

        response.text = removeQuotes(response.text);

        // elizaLogger.debug("Response: ", response);

        if (response.text) {
            if (this.isDryRun) {
                elizaLogger.info(
                    `Dry run: Selected Post: ${tweet.id} - ${tweet.username}: ${tweet.text}\nAgent's Output:\n${response.text}`
                );
            } else {
                try {
                    const callback: HandlerCallback = async (
                        response: Content
                    ) => {
                        const memories = await sendQuoteTweet(
                            this.client,
                            response,
                            message.roomId,
                            this.client.twitterConfig.TWITTER_USERNAME,
                            tweet.id
                        );
                        return memories;
                    };

                    const responseMessages = await callback(response);

                    state = (await this.runtime.updateRecentMessageState(
                        state
                    )) as State;

                    for (const responseMessage of responseMessages) {
                        if (
                            responseMessage ===
                            responseMessages[responseMessages.length - 1]
                        ) {
                            responseMessage.content.action = response.action;
                        } else {
                            responseMessage.content.action = "CONTINUE";
                        }
                        await this.runtime.messageManager.createMemory(
                            responseMessage
                        );
                    }

                    // await this.runtime.processActions(
                    //     message,
                    //     responseMessages,
                    //     state,
                    //     callback
                    // );

                    const responseInfo = `Context:\n\n${context}\n\nSelected Post: ${tweet.id} - ${tweet.username}: ${tweet.text}\nAgent's Output:\n${response.text}`;

                    await this.runtime.cacheManager.set(
                        `twitter/tweet_generation_${tweet.id}.txt`,
                        responseInfo
                    );
                    await wait();
                } catch (error) {
                    elizaLogger.error(`Error quote tweet: ${error}`);
                }
            }
        }
    }

    async buildConversationThread(
        tweet: Tweet,
        maxReplies: number = 10
    ): Promise<Tweet[]> {
        const thread: Tweet[] = [];
        const visited: Set<string> = new Set();

        async function processThread(currentTweet: Tweet, depth: number = 0) {
            elizaLogger.log("Processing tweet:", {
                id: currentTweet.id,
                inReplyToStatusId: currentTweet.inReplyToStatusId,
                depth: depth,
            });

            if (!currentTweet) {
                elizaLogger.log("No current tweet found for thread building");
                return;
            }

            if (depth >= maxReplies) {
                elizaLogger.log("Reached maximum reply depth", depth);
                return;
            }

            // Handle memory storage
            const memory = await this.runtime.messageManager.getMemoryById(
                stringToUuid(currentTweet.id + "-" + this.runtime.agentId)
            );
            if (!memory) {
                const roomId = stringToUuid(
                    currentTweet.conversationId + "-" + this.runtime.agentId
                );
                const userId = stringToUuid(currentTweet.userId);

                await this.runtime.ensureConnection(
                    userId,
                    roomId,
                    currentTweet.username,
                    currentTweet.name,
                    "twitter"
                );

                this.runtime.messageManager.createMemory({
                    id: stringToUuid(
                        currentTweet.id + "-" + this.runtime.agentId
                    ),
                    agentId: this.runtime.agentId,
                    content: {
                        text: currentTweet.text,
                        source: "twitter",
                        url: currentTweet.permanentUrl,
                        inReplyTo: currentTweet.inReplyToStatusId
                            ? stringToUuid(
                                  currentTweet.inReplyToStatusId +
                                      "-" +
                                      this.runtime.agentId
                              )
                            : undefined,
                    },
                    createdAt: currentTweet.timestamp * 1000,
                    roomId,
                    userId:
                        currentTweet.userId === this.twitterUserId
                            ? this.runtime.agentId
                            : stringToUuid(currentTweet.userId),
                    embedding: getEmbeddingZeroVector(),
                });
            }

            if (visited.has(currentTweet.id)) {
                elizaLogger.log("Already visited tweet:", currentTweet.id);
                return;
            }

            visited.add(currentTweet.id);
            thread.unshift(currentTweet);

            elizaLogger.debug("Current thread state:", {
                length: thread.length,
                currentDepth: depth,
                tweetId: currentTweet.id,
            });

            if (currentTweet.inReplyToStatusId) {
                elizaLogger.log(
                    "Fetching parent tweet:",
                    currentTweet.inReplyToStatusId
                );
                try {
                    const parentTweet = await this.twitterClient.getTweet(
                        currentTweet.inReplyToStatusId
                    );

                    if (parentTweet) {
                        elizaLogger.log("Found parent tweet:", {
                            id: parentTweet.id,
                            text: parentTweet.text?.slice(0, 50),
                        });
                        await processThread(parentTweet, depth + 1);
                    } else {
                        elizaLogger.log(
                            "No parent tweet found for:",
                            currentTweet.inReplyToStatusId
                        );
                    }
                } catch (error) {
                    elizaLogger.log("Error fetching parent tweet:", {
                        tweetId: currentTweet.inReplyToStatusId,
                        error,
                    });
                }
            } else {
                elizaLogger.log(
                    "Reached end of reply chain at:",
                    currentTweet.id
                );
            }
        }

        // Need to bind this context for the inner function
        await processThread.bind(this)(tweet, 0);

        elizaLogger.debug("Final thread built:", {
            totalTweets: thread.length,
            tweetIds: thread.map((t) => ({
                id: t.id,
                text: t.text?.slice(0, 50),
            })),
        });

        return thread;
    }
}
