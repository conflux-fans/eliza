import type { Tweet } from "agent-twitter-client";
import {
    composeContext,
    generateText,
    getEmbeddingZeroVector,
    type IAgentRuntime,
    ModelClass,
    stringToUuid,
    type UUID,
    truncateToCompleteSentence,
    parseJSONObjectFromText,
    extractAttributes,
    cleanJsonResponse,
} from "@elizaos/core";
import { elizaLogger } from "@elizaos/core";
import type { ClientBase } from "./base.ts";
import { fetchMediaData } from "./utils.ts";
import { DEFAULT_MAX_TWEET_LENGTH } from "./environment.ts";
import { MediaData } from "./types.ts";

const confiPumpUrl = process.env.CONFLUX_CONFI_PUMP_URL;
if (!confiPumpUrl) {
    throw new Error("CONFLUX_CONFI_PUMP_URL is not set");
}
const confiPumpHashtag = process.env.CONFLUX_CONFI_PUMP_HASHTAG;
if (!confiPumpHashtag) {
    throw new Error("CONFLUX_CONFI_PUMP_HASHTAG is not set");
}

const twitterPostSummaryTemplate = `
<persona>  
You are (@{{twitterUserName}}), an experienced blockchain enthusiast and seasoned researcher with years of expertise in cryptocurrency trading and blockchain technology. You are well-versed in blockchain jargon and adept at correcting factual errors with sharp, humorous remarks.  
</persona>  

<task>  
You will be provided with scanned tweets or content related to AI, DeFi, DApps, protocols, or trending topics involving $CFX, $BTC, $ETH, or other blockchain-related trends. You will also be provided with your history tweets. You need to select the most important 2 facts/views you didn't convey in your history tweets, and organize the most important ones into a well-structured tweet listing the most important facts/views. If multiple facts/views are related to the same topic, you can organize them in a proper format based on origianl tweet published time.

NOTE: You shall not summary the same or similar information if you (@{{twitterUserName}}) already conveyed it in history tweets.
</task>


<instructions>  
1. Focus on extracting the most relevant and actionable insights from the content.
2. Highlight any significant developments, trends, or market movements.  
3. Use concise and clear language, avoiding unnecessary jargon unless it is widely understood in the blockchain community.  
4. Always include "$" symbols when referencing tokens or cryptocurrencies.  
5. History tweets: Avoid conveying the same information if self has already conveyed it in history tweets; don't consistently use the same words in history tweets.
6. After the summary, you can add your brief comment (no more than 20 words).
</instructions>  

<guidelines>  
1. Prioritize accuracy and relevance in your summaries.  
2. Ensure all token names are prefixed with "$" for clarity.  
3. Avoid adding personal commentary or unrelated information.  
4. Keep the output concise and directly tied to the input content.  
5. Be cool, brief, confident, and humorous.  
6. No yapping. No 'here's what you asked for'. Output only the required summary.  
7. Use a calm tone.  
8. No more than 160 words.
</guidelines>

<selfHistoryTweets>
{{historyTweets}}
</selfHistoryTweets>

<tweetListToSummarize>
{{summaryTargetTweetList}}
</tweetListToSummarize>
`;

export class TwitterSummaryClient {
    client: ClientBase;
    runtime: IAgentRuntime;
    twitterUsername: string;
    private isDryRun: boolean;

    constructor(client: ClientBase, runtime: IAgentRuntime) {
        this.client = client;
        this.runtime = runtime;
        this.twitterUsername = this.client.twitterConfig.TWITTER_USERNAME;
        this.isDryRun = this.client.twitterConfig.TWITTER_DRY_RUN;

        // Log configuration on initialization
        elizaLogger.log("Twitter Client Configuration:");
        elizaLogger.log(`- Username: ${this.twitterUsername}`);
        elizaLogger.log(
            `- Dry Run Mode: ${this.isDryRun ? "enabled" : "disabled"}`
        );
        elizaLogger.log(
            `- Summary Interval: ${this.client.twitterConfig.POST_SUMMARY_INTERVAL_MIN}-${this.client.twitterConfig.POST_SUMMARY_INTERVAL_MAX} minutes`
        );
        elizaLogger.log(
            `- Action Processing: ${
                this.client.twitterConfig.ENABLE_ACTION_PROCESSING
                    ? "enabled"
                    : "disabled"
            }`
        );
        elizaLogger.log(
            `- Action Interval: ${this.client.twitterConfig.ACTION_INTERVAL} minutes`
        );
        elizaLogger.log(
            `- Summary Immediately: ${
                this.client.twitterConfig.POST_IMMEDIATELY
                    ? "enabled"
                    : "disabled"
            }`
        );
        elizaLogger.log(
            `- Search Enabled: ${
                this.client.twitterConfig.TWITTER_SEARCH_ENABLE
                    ? "enabled"
                    : "disabled"
            }`
        );

        const targetUsers = this.client.twitterConfig.TWITTER_TARGET_USERS;
        if (targetUsers) {
            elizaLogger.log(`- Target Users: ${targetUsers}`);
        }

        if (this.isDryRun) {
            elizaLogger.log(
                "Twitter client initialized in dry run mode - no actual tweets should be posted"
            );
        }
    }

    async start() {
        if (!this.client.profile) {
            await this.client.init();
        }

        const generateNewSummaryTweetLoop = async () => {
            const lastPost = await this.runtime.cacheManager.get<{
                timestamp: number;
            }>("twitter/" + this.twitterUsername + "/lastSummary");

            const lastPostTimestamp = lastPost?.timestamp ?? 0;
            const minMinutes = this.client.twitterConfig.POST_SUMMARY_INTERVAL_MIN;
            const maxMinutes = this.client.twitterConfig.POST_SUMMARY_INTERVAL_MAX;
            const randomMinutes =
                Math.floor(Math.random() * (maxMinutes - minMinutes + 1)) +
                minMinutes;
            const delay = randomMinutes * 60 * 1000;

            if (Date.now() > lastPostTimestamp + delay) {
                await this.generateNewSummaryTweet();
                await this.runtime.cacheManager.set(
                    `twitter/${this.client.profile.username}/lastSummary`,
                    {
                        timestamp: Date.now(),
                    }
                );
            }

            setTimeout(() => {
                generateNewSummaryTweetLoop(); // Set up next iteration
            }, delay);

            elizaLogger.log(`Next summary tweet scheduled in ${randomMinutes} minutes`);
        };

        if (this.client.twitterConfig.POST_IMMEDIATELY) {
            await this.generateNewSummaryTweet();
        }

        await generateNewSummaryTweetLoop();

        elizaLogger.info("Tweet summary generation loop started");
    }

    createTweetObject(
        tweetResult: any,
        client: any,
        twitterUsername: string
    ): Tweet {
        return {
            id: tweetResult.rest_id,
            name: client.profile.screenName,
            username: client.profile.username,
            text: tweetResult.legacy.full_text,
            conversationId: tweetResult.legacy.conversation_id_str,
            createdAt: tweetResult.legacy.created_at,
            timestamp: new Date(tweetResult.legacy.created_at).getTime(),
            userId: client.profile.id,
            inReplyToStatusId: tweetResult.legacy.in_reply_to_status_id_str,
            permanentUrl: `https://twitter.com/${twitterUsername}/status/${tweetResult.rest_id}`,
            hashtags: [],
            mentions: [],
            photos: [],
            thread: [],
            urls: [],
            videos: [],
        } as Tweet;
    }

    async processAndCacheTweet(
        runtime: IAgentRuntime,
        client: ClientBase,
        tweet: Tweet,
        roomId: UUID,
        rawTweetContent: string
    ) {
        // Cache the last summary details
        await runtime.cacheManager.set(
            `twitter/${client.profile.username}/lastSummary`,
            {
                id: tweet.id,
                timestamp: Date.now(),
            }
        );

        // Cache the tweet
        await client.cacheTweet(tweet);

        // Log the posted tweet
        elizaLogger.log(`Tweet posted:\n ${tweet.permanentUrl}`);

        // Ensure the room and participant exist
        await runtime.ensureRoomExists(roomId);
        await runtime.ensureParticipantInRoom(runtime.agentId, roomId);

        // Create a memory for the tweet
        await runtime.messageManager.createMemory({
            id: stringToUuid(tweet.id + "-" + runtime.agentId),
            userId: runtime.agentId,
            agentId: runtime.agentId,
            content: {
                text: rawTweetContent.trim(),
                url: tweet.permanentUrl,
                source: "twitter",
            },
            roomId,
            embedding: getEmbeddingZeroVector(),
            createdAt: tweet.timestamp,
        });
    }

    async handleNoteTweet(
        client: ClientBase,
        content: string,
        tweetId?: string,
        mediaData?: MediaData[]
    ) {
        try {
            const noteTweetResult = await client.requestQueue.add(
                async () =>
                    await client.twitterClient.sendNoteTweet(
                        content,
                        tweetId,
                        mediaData
                    )
            );

            if (noteTweetResult.errors && noteTweetResult.errors.length > 0) {
                // Note Tweet failed due to authorization. Falling back to standard Tweet.
                const truncateContent = truncateToCompleteSentence(
                    content,
                    this.client.twitterConfig.MAX_TWEET_LENGTH
                );
                return await this.sendStandardTweet(
                    client,
                    truncateContent,
                    tweetId
                );
            } else {
                return noteTweetResult.data.notetweet_create.tweet_results
                    .result;
            }
        } catch (error) {
            throw new Error(`Note Tweet failed: ${error}`);
        }
    }

    async sendStandardTweet(
        client: ClientBase,
        content: string,
        tweetId?: string,
        mediaData?: MediaData[]
    ) {
        try {
            const standardTweetResult = await client.requestQueue.add(
                async () =>
                    await client.twitterClient.sendTweet(
                        content,
                        tweetId,
                        mediaData
                    )
            );
            const body = await standardTweetResult.json();
            if (!body?.data?.create_tweet?.tweet_results?.result) {
                elizaLogger.error(`Error sending tweet; Bad response:`);
                elizaLogger.error(body);
                return;
            }
            return body.data.create_tweet.tweet_results.result;
        } catch (error) {
            elizaLogger.error(`Error sending standard Tweet: ${error}`);
            throw error;
        }
    }

    async postTweet(
        runtime: IAgentRuntime,
        client: ClientBase,
        tweetTextForPosting: string,
        roomId: UUID,
        rawTweetContent: string,
        twitterUsername: string,
        mediaData?: MediaData[]
    ) {
        try {
            elizaLogger.log(`Posting new tweet:\n`);

            let result;

            if (tweetTextForPosting.length > DEFAULT_MAX_TWEET_LENGTH) {
                result = await this.handleNoteTweet(
                    client,
                    tweetTextForPosting,
                    undefined,
                    mediaData
                );
            } else {
                result = await this.sendStandardTweet(
                    client,
                    tweetTextForPosting,
                    undefined,
                    mediaData
                );
            }

            const tweet = this.createTweetObject(
                result,
                client,
                twitterUsername
            );

            await this.processAndCacheTweet(
                runtime,
                client,
                tweet,
                roomId,
                rawTweetContent
            );
        } catch (error) {
            elizaLogger.error(`Error sending tweet: ${error}`);
        }
    }

    async getFormattedSummaryTargetTweetList(): Promise<string> {
        if (this.client.twitterConfig.TWITTER_SUMMARY_TARGET_USERS.length === 0) {
            return "";
        }

        let formattedTweetList = "";
        let index = 1;

        elizaLogger.log("Summary target tweet list: " + this.client.twitterConfig.TWITTER_SUMMARY_TARGET_USERS);

        for (const targetUser of this.client.twitterConfig.TWITTER_SUMMARY_TARGET_USERS) {
            const tweets = this.client.twitterClient.getTweets(
                targetUser,
                10
            );
            for await (const tweet of tweets) {
                // latest 1 day
                if (tweet.timestamp && tweet.timestamp * 1000 > Date.now() - 24 * 60 * 60 * 1000) {
                    formattedTweetList += `${index}. ${tweet.username}: ${tweet.text}\n`;
                    index++;
                } else {
                    elizaLogger.log(`Skipping tweet from ${tweet.username} because it's older than 1 day (${new Date(tweet.timestamp * 1000).toLocaleString()})`);
                }
            }
        }

        elizaLogger.log("Formatted summary target tweet list: " + formattedTweetList);

        return formattedTweetList;
    }

    async generateNewSummaryTweet() {
        elizaLogger.info("Generating new summary tweet");

        try {
            const roomId = stringToUuid(
                "twitter_generate_room-" + this.client.profile.username
            );
            await this.runtime.ensureUserExists(
                this.runtime.agentId,
                this.client.profile.username,
                this.runtime.character.name,
                "twitter"
            );

            const topics = this.runtime.character.topics.join(", ");

            const formattedSummaryTargetTweetList = await this.getFormattedSummaryTargetTweetList();

            if (formattedSummaryTargetTweetList.length === 0) {
                elizaLogger.log("No summary target tweet list found");
                return;
            }

            // returns AsyncGenerator<Tweet>
            const latestTweets = this.client.twitterClient.getTweets(
                this.twitterUsername,
                10
            );

            let formattedTweetList = "";

            let index = 1;
            for await (const tweet of latestTweets) {
                formattedTweetList += `${index}.(${new Date(tweet.timestamp).toLocaleString()}) ${tweet.username}: ${tweet.text}\n`;
                index++;
            }

            // const formattedConversation = latestTweets.map((tweet) => {

            // console.log("tokenList", tokenList);

            const maxTweetLength = this.client.twitterConfig.MAX_TWEET_LENGTH;
            const state = await this.runtime.composeState(
                {
                    userId: this.runtime.agentId,
                    roomId: roomId,
                    agentId: this.runtime.agentId,
                    content: {
                        text: topics || "",
                        action: "TWEET",
                    },
                },
                {
                    twitterUserName: this.client.profile.username,
                    summaryTargetTweetList: formattedSummaryTargetTweetList,
                    historyTweets: formattedTweetList,
                    maxTweetLength,
                }
            );

            const context = composeContext({
                state,
                template:
                    twitterPostSummaryTemplate,
            });

            elizaLogger.debug("generate summary tweet prompt:\n" + context);

            const response = await generateText({
                runtime: this.runtime,
                context,
                modelClass: ModelClass.REASONING,
            });

            const rawTweetContent = cleanJsonResponse(response);

            // First attempt to clean content
            let tweetTextForPosting = null;
            let mediaData = null;

            // Try parsing as JSON first
            const parsedResponse = parseJSONObjectFromText(rawTweetContent);
            if (parsedResponse?.text) {
                tweetTextForPosting = parsedResponse.text;
            }

            if (
                parsedResponse?.attachments &&
                parsedResponse?.attachments.length > 0
            ) {
                mediaData = await fetchMediaData(parsedResponse.attachments);
            }

            // Try extracting text attribute
            if (!tweetTextForPosting) {
                const parsingText = extractAttributes(rawTweetContent, [
                    "text",
                ]).text;
                if (parsingText) {
                    tweetTextForPosting = truncateToCompleteSentence(
                        extractAttributes(rawTweetContent, ["text"]).text,
                        this.client.twitterConfig.MAX_TWEET_LENGTH
                    );
                }
            }

            // Use the raw text
            if (!tweetTextForPosting) {
                tweetTextForPosting = rawTweetContent;
            }

            // Truncate the content to the maximum tweet length specified in the environment settings, ensuring the truncation respects sentence boundaries.
            if (maxTweetLength) {
                tweetTextForPosting = truncateToCompleteSentence(
                    tweetTextForPosting,
                    maxTweetLength
                );
            }

            const removeQuotes = (str: string) =>
                str.replace(/^['"](.*)['"]$/, "$1");

            const fixNewLines = (str: string) => str.replaceAll(/\\n/g, "\n\n"); //ensures double spaces

            // Final cleaning
            tweetTextForPosting = removeQuotes(
                fixNewLines(tweetTextForPosting)
            );

            if (this.isDryRun) {
                elizaLogger.info(
                    `Dry run: would have posted tweet: ${tweetTextForPosting}`
                );
                return;
            }

            try {
                elizaLogger.log(
                    `Posting new tweet:\n ${tweetTextForPosting}`
                );
                this.postTweet(
                    this.runtime,
                    this.client,
                    tweetTextForPosting,
                    roomId,
                    rawTweetContent,
                    this.twitterUsername,
                    mediaData
                );
                
            } catch (error) {
                elizaLogger.error(`Error sending tweet: ${error}`);
            }
        } catch (error) {
            elizaLogger.error(`Error generating summary tweet: ${error}`);
        }
    }
}
