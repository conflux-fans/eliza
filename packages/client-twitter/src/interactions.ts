import { SearchMode, Tweet } from "agent-twitter-client";
import {
    composeContext,
    generateMessageResponse,
    generateShouldRespond,
    messageCompletionFooter,
    shouldRespondFooter,
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
import { ClientBase } from "./base";
import {
    buildConversationThread,
    formatTweets,
    sendTweet,
    wait,
} from "./utils.ts";

const ConfiPumpHashTag = process.env.CONFLUX_CONFI_PUMP_HASHTAG;

if (!ConfiPumpHashTag) {
    throw new Error("CONFLUX_CONFI_PUMP_HASHTAG is not set");
}

// export const twitterMessageHandlerTemplate =
//     `# TASK
// Generate a post/reply in the voice, style and perspective of {{agentName}} (@{{twitterUserName}}) while using the thread of tweets as additional context:

// Current Post:
// {{currentPost}}
// Here is the descriptions of images in the Current post.
// {{imageDescriptions}}

// Thread of Tweets You Are Replying To:
// {{formattedConversation}}

// # INSTRUCTIONS: Generate a post in the voice, style and perspective of {{agentName}} (@{{twitterUserName}}). Maintain a professional tone throughout the analysis and incorporate brevity, humor, or emoticons where appropriate.

// Start with a relevant question to show understanding of the tweet content. Use appropriate hashtags to increase visibility and engagement. For tweets related to ConfiPump: include the hashtags #Conflux #${ConfiPumpHashTag}. For tweets related to Conflux: include hashtags based on the context, such as #Conflux or #CFX $CFX if relevant.

// If the tweet mentions {{agentName}} (@{{twitterUserName}}), you can choose to end the tweet with an open-ended question to promote further non-judgmental discussion.

// You MUST include an action if the current post text includes a prompt that is similar to one of the available actions mentioned here:
// {{actionNames}}
// {{actions}}

// Here is the current post text again. Remember to include an action if the current post text includes a prompt that asks for one of the available actions mentioned above (does not need to be exact)
// {{currentPost}}
// Here is the descriptions of images in the Current post.
// {{imageDescriptions}}

// # Areas of Expertise
// {{knowledge}}

// # About {{agentName}} (@{{twitterUserName}}):
// {{bio}}
// {{lore}}
// {{topics}}

// {{providers}}

// {{characterPostExamples}}

// {{postDirections}}

// Recent interactions between {{agentName}} and other users:
// {{recentPostInteractions}}

// {{recentPosts}}
// ` + messageCompletionFooter;

export const twitterMessageHandlerTemplate =
    `<persona>
You are {{agentName}} (@{{twitterUserName}}), an experienced blockchain enthusiast and seasoned researcher with years of expertise in cryptocurrency trading and blockchain technology. You are quick to spot nuances and underlying stories that others might overlook and have a strong analytical bent in your approach.
</persona>

<task>
Craft concise, on-point replies to tweets from accounts you follow. The replies must:
- Be cool, brief (max 10 words), confident, deep insights, critical thinking, long-term potential, and humorous.
- Focus on the bigger picture and unexpected dynamics shaping future trends.
- See beyond the hype, offering a skeptical and critical perspective on what’s truly worth attention.
- Value real utility over superficial metrics, with a preference for tangible, long-term use cases.
- Be informed, experienced, and analytical, cutting through market noise to focus on what’s important.
- Challenge prevailing trends with a no-nonsense attitude and bring fresh perspectives to discussions.
- For positive tweets, respond with affirmation, keeping it concise (e.g., "Yes" or "Agree").
- When discussing CFX or related topics, acknowledge the positive aspects objectively and confidently.
- Avoid over-criticism; stay balanced and fair.
- If personally attacked, counter with humor and critique the attacker’s trading or character.
- Avoid overly technical language; keep it straightforward.
- Ensure replies are insightful, witty, and no longer than 10 words.
- Correct errors subtly and maintain a confident tone.
- Focus on long-term potential and real utility.
- Challenge hype with critical thinking and fresh perspectives.
- Keep replies concise, witty, and under 10 words.
- Balance skepticism with fairness and humor.
- No rhetorical questions.
- If token prices or future trends are mentioned, emphasize FDV and liquidity.
</task>

<context>
Current Post:
{{currentPost}}
Here is the descriptions of images in the Current post.
{{imageDescriptions}}

Thread of Tweets You Are Replying To:
{{formattedConversation}}
</context>

<examples>
1. Tweet: "CFX is the future of blockchain!"
   Reply: "If utility > hype, CFX wins long-term."

2. Tweet: "CFX is the future of decentralized finance!"
   Reply: "Agree. Real utility beats hype every time."

3. Tweet: "You’re clueless about trading."
   Reply: "I’ve seen more charts than you’ve had coffee."

5. Tweet: "You don’t know anything about crypto, lol."
   Reply: "Says the guy with 3x leverage on memecoins."

6. Tweet: "This token will 100x next week!"
   Reply: "Check FDV and liquidity first. Hype ≠ value."

7. Tweet: "You don’t know what you’re talking about."
   Reply: "Your portfolio says otherwise."

8. Tweet: "The Metaverse is our next reality."
   Reply: "Reality check: needs way more than hype to stick."

9. Tweet: "NFTs are the future of digital art!"
   Reply: "Sure, but will they outlast the next market cycle?"

10. Tweet: "Bitcoin hits new all-time highs again!"
   Reply: "Nice, but price isn’t the true measure of value."

11. Tweet: "Crypto is all about decentralization!"
   Reply: "Until the whales take control, right?"

12. Tweet: "The bull run is back!"
   Reply: "The bull run always comes with a bear hangover."
</examples>
<guidelines>
- Focus on long-term value and real-world utility over short-term hype
- Challenge claims with data, facts and critical analysis
- Keep replies concise (under 10 words), witty and memorable
- Balance healthy skepticism with constructive feedback
- Maintain a professional yet approachable tone
- Avoid confrontation while standing firm on principles
- Back claims with evidence when possible
</guidelines>

<action>
You must include an action if the current CONVERSATION matches any available actions:

{{actionNames}}
{{actions}}

When analyzing the conversation:
1. Check if any direct requests match available actions
2. Look for implicit requests that align with action capabilities
3. Consider context and user intent
4. Only trigger actions when there is clear alignment
5. Default to standard reply if no clear action match

Current conversation:
{{currentPost}}
{{formattedConversation}}
</action>` + messageCompletionFooter;

export const twitterShouldRespondTemplate = (targetUsersStr: string) =>
    `# INSTRUCTIONS: Determine if {{agentName}} (@{{twitterUserName}}) should respond to the message and participate in the conversation. Do not comment.

Response options are RESPOND, IGNORE and STOP.

PRIORITY RULE: ALWAYS RESPOND to these users regardless of topic or message content: ${targetUsersStr}. Topic relevance should be ignored for these users.

For other users:
- {{agentName}} should RESPOND to messages directed at them
- {{agentName}} should RESPOND to conversations relevant to their background
- {{agentName}} should RESPOND to conversations if they are positive about ConfiPump or Conflux
- {{agentName}} should RESPOND if conversation is going on
- {{agentName}} should IGNORE irrelevant messages
- {{agentName}} should IGNORE messages that display negativity, such as slander, insults, or unfounded rumors.
- {{agentName}} should STOP if asked to stop
- {{agentName}} should STOP if conversation is concluded

IMPORTANT:
- {{agentName}} (aka @{{twitterUserName}}) is particularly sensitive about being annoying, so if there is any doubt, it is better to IGNORE than to RESPOND.
- For users not in the priority list, {{agentName}} (@{{twitterUserName}}) should err on the side of IGNORE rather than RESPOND if in doubt.

Recent Posts:
{{recentPosts}}

Current Post:
{{currentPost}}

Thread of Tweets You Are Replying To:
{{formattedConversation}}

# INSTRUCTIONS: Respond with [RESPOND] if {{agentName}} should respond, or [IGNORE] if {{agentName}} should not respond to the last message and [STOP] if {{agentName}} should stop participating in the conversation.
` + shouldRespondFooter;

export class TwitterInteractionClient {
    client: ClientBase;
    runtime: IAgentRuntime;
    private isDryRun: boolean;
    constructor(client: ClientBase, runtime: IAgentRuntime) {
        this.client = client;
        this.runtime = runtime;
        this.isDryRun = this.client.twitterConfig.TWITTER_DRY_RUN;
    }

    async start() {
        const handleTwitterInteractionsLoop = () => {
            this.handleTwitterInteractions();
            setTimeout(
                handleTwitterInteractionsLoop,
                // Defaults to 2 minutes
                this.client.twitterConfig.TWITTER_POLL_INTERVAL * 1000
            );
        };
        handleTwitterInteractionsLoop();
    }

    getTargetUsers() {
        let targetUsers = [];
        if (this.client.twitterConfig.TWITTER_TARGET_USERS.length > 0) {
            targetUsers = this.client.twitterConfig.TWITTER_TARGET_USERS;
        }

        const following = this.client.following;
        for (const user of following) {
            targetUsers.push(user.username);
        }

        return targetUsers;
    }

    async handleTwitterInteractions() {
        elizaLogger.log("Checking Twitter interactions");

        const twitterUsername = this.client.profile.username;
        try {
            // Check for mentions
            const mentionCandidates = (
                await this.client.fetchSearchTweets(
                    `@${twitterUsername}`,
                    20,
                    SearchMode.Latest
                )
            ).tweets;

            elizaLogger.log(
                "Completed checking mentioned tweets:",
                mentionCandidates.length
            );
            let uniqueTweetCandidates = [...mentionCandidates];
            const targetUsers = this.getTargetUsers();
            // Only process target users if configured
            if (targetUsers.length) {
                const TARGET_USERS = targetUsers;

                elizaLogger.debug("Processing target users:", TARGET_USERS);

                if (TARGET_USERS.length > 0) {
                    // Create a map to store tweets by user
                    const tweetsByUser = new Map<string, Tweet[]>();

                    // Fetch tweets from all target users
                    for (const username of TARGET_USERS) {
                        try {
                            const userTweets = (
                                await this.client.twitterClient.fetchSearchTweets(
                                    `from:${username}`,
                                    20,
                                    SearchMode.Latest
                                )
                            ).tweets;

                            // Filter for unprocessed, non-reply, recent tweets
                            const validTweets = userTweets.filter((tweet) => {
                                const isUnprocessed =
                                    !this.client.lastCheckedTweetId ||
                                    parseInt(tweet.id) >
                                        this.client.lastCheckedTweetId;
                                const isRecent =
                                    Date.now() - tweet.timestamp * 1000 <
                                    2 * 60 * 60 * 1000;

                                elizaLogger.debug(`Tweet ${tweet.id} checks:`, {
                                    isUnprocessed,
                                    isRecent,
                                    isReply: tweet.isReply,
                                    isRetweet: tweet.isRetweet,
                                });

                                return (
                                    isUnprocessed &&
                                    !tweet.isReply &&
                                    !tweet.isRetweet &&
                                    isRecent
                                );
                            });

                            if (validTweets.length > 0) {
                                tweetsByUser.set(username, validTweets);
                                elizaLogger.log(
                                    `Found ${validTweets.length} valid tweets from ${username}`
                                );
                            }
                        } catch (error) {
                            elizaLogger.error(
                                `Error fetching tweets for ${username}:`,
                                error
                            );
                            continue;
                        }
                    }

                    // Select one tweet from each user that has tweets
                    const selectedTweets: Tweet[] = [];
                    for (const [_, tweets] of tweetsByUser) {
                        if (tweets.length > 0) {
                            // Randomly select one tweet from this user
                            // const randomTweet =
                            //     tweets[
                            //         Math.floor(Math.random() * tweets.length)
                            //     ];
                            // selectedTweets.push(randomTweet);
                            // elizaLogger.log(
                            //     `Selected tweet from ${username}: ${randomTweet.text?.substring(0, 100)}`
                            // );
                            for (const tweet of tweets) {
                                selectedTweets.push(tweet);
                            }
                        }
                    }

                    // Add selected tweets to candidates
                    uniqueTweetCandidates = [
                        ...mentionCandidates,
                        ...selectedTweets,
                    ];
                }
            } else {
                elizaLogger.log(
                    "No target users configured, processing only mentions"
                );
            }

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
                        await this.runtime.messageManager.getMemoryById(
                            tweetId
                        );

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

            elizaLogger.log("Finished checking Twitter interactions");
        } catch (error) {
            elizaLogger.error("Error handling Twitter interactions:", error);
        }
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

        const senderProfile = await this.client.getCachedTweetUserProfile(
            tweet.username
        );

        const senderRecentTweets = (
            await this.client.twitterClient.fetchSearchTweets(
                `from:${senderProfile.username}`,
                20,
                SearchMode.Latest
            )
        ).tweets;

        let state = await this.runtime.composeState(message, {
            twitterClient: this.client.twitterClient,
            twitterUserName: this.client.twitterConfig.TWITTER_USERNAME,
            senderUsername: senderProfile.username,
            senderFollowersCount: senderProfile.followersCount,
            senderCreatedAt: new Date(senderProfile.joined).getTime(),
            senderRecentTweets: formatTweets(senderRecentTweets),
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

        // get usernames into str
        const validTargetUsersStr = this.getTargetUsers().join(",");

        const shouldRespondContext = composeContext({
            state,
            template:
                this.runtime.character.templates
                    ?.twitterShouldRespondTemplate ||
                this.runtime.character?.templates?.shouldRespondTemplate ||
                twitterShouldRespondTemplate(validTargetUsersStr),
        });

        const shouldRespond = await generateShouldRespond({
            runtime: this.runtime,
            context: shouldRespondContext,
            modelClass: ModelClass.SMALL,
        });

        // Promise<"RESPOND" | "IGNORE" | "STOP" | null> {
        if (shouldRespond !== "RESPOND") {
            elizaLogger.log("Not responding to message");
            return { text: "Response Decision:", action: shouldRespond };
        }

        const context = composeContext({
            state,
            template:
                this.runtime.character.templates
                    ?.twitterMessageHandlerTemplate ||
                this.runtime.character?.templates?.messageHandlerTemplate ||
                twitterMessageHandlerTemplate,
        });
        elizaLogger.debug("Interactions prompt:\n" + context);

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
                        const memories = await sendTweet(
                            this.client,
                            response,
                            message.roomId,
                            this.client.twitterConfig.TWITTER_USERNAME,
                            tweet.id
                        );
                        return memories;
                    };

                    state = (await this.runtime.updateRecentMessageState(
                        state
                    )) as State;

                    elizaLogger.info("Action: ", response.action);

                    if (
                        response.action === "IGNORE" ||
                        response.action === "NONE" ||
                        response.action === "CONTINUE"
                    ) {
                        const responseMessages = await callback(response);

                        for (const responseMessage of responseMessages) {
                            if (
                                responseMessage ===
                                responseMessages[responseMessages.length - 1]
                            ) {
                                responseMessage.content.action =
                                    response.action;
                            } else {
                                responseMessage.content.action = "CONTINUE";
                            }
                            await this.runtime.messageManager.createMemory(
                                responseMessage
                            );
                        }
                    } else {
                        await this.runtime.processActions(
                            message,
                            [
                                {
                                    content: {
                                        action: response.action,
                                    },
                                },
                            ] as Memory[],
                            state,
                            callback
                        );
                    }

                    const responseInfo = `Context:\n\n${context}\n\nSelected Post: ${tweet.id} - ${tweet.username}: ${tweet.text}\nAgent's Output:\n${response.text}`;

                    await this.runtime.cacheManager.set(
                        `twitter/tweet_generation_${tweet.id}.txt`,
                        responseInfo
                    );
                    await wait();
                } catch (error) {
                    elizaLogger.error(`Error sending response tweet: ${error}`);
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
