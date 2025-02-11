import { SearchMode, type Tweet } from "agent-twitter-client";
import {
    composeContext,
    generateMessageResponse,
    generateShouldRespond,
    messageCompletionFooter,
    shouldRespondFooter,
    type Content,
    type HandlerCallback,
    type IAgentRuntime,
    type Memory,
    ModelClass,
    type State,
    stringToUuid,
    elizaLogger,
    getEmbeddingZeroVector,
    type IImageDescriptionService,
    ServiceType,
} from "@elizaos/core";
import { ClientBase } from "./base";
import {
    buildConversationThread,
    formatTweets,
    sendTweet,
    wait,
} from "./utils.ts";
import { z } from "zod";

export const needToBlacklistTemplate =
`<task>
Determine if the user is a bot or spammer and should be blacklisted. If user recent tweets contain malicious attacks, rumors, insults or defamation of accounts related to "Conflux" or "ConfiPump". The latest tweet states that the account has been stolen or abandoned.
</task>

<recentTweets>
{{recentTweets}}
</recentTweets>
`;

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

export class TwitterFollowClient {
    client: ClientBase;
    runtime: IAgentRuntime;
    private isDryRun: boolean;
    constructor(client: ClientBase, runtime: IAgentRuntime) {
        this.client = client;
        this.runtime = runtime;
        this.isDryRun = this.client.twitterConfig.TWITTER_DRY_RUN;
    }

    async start() {
        // start loop
        while (true) {
            await this.startFollow();
            await wait(1000 * 60 * 60 * 24);
        }
    }

    async startFollow() {
        const followers = this.client.followers;
        for (const follower of followers) {
            // if (true) {
            if (follower.isBlueVerified) {
                for (const following of this.client.following) {
                    if (following.userId === follower.userId) {
                        continue;
                    }
                    if (await this.isBlacklisted(follower.userId)) {
                        continue;
                    }
                    elizaLogger.log(`Following ${follower.username}`);
                    await this.client.follow(follower.username);
                }
            }
        }
    }

    // async startBlacklist() {
    //     const followings = this.client.following;
    // }

    // async needToBlacklist(userId: string) {
    //     const schema = z.object({
    //         needToBlacklist: z.boolean(),
    //     });

    //     // const recentTweets = await this.client.getRecentTweets(userId, 10);
    // }

    async blacklistUser(userId: string) {
        await this.runtime.cacheManager.set(
            `twitter/blacklist/${userId}`, {
                "blacklisted": true,
            }
        );
    }

    async isBlacklisted(userId: string) {
        const blacklisted = await this.runtime.cacheManager.get<{
            blacklisted: boolean;
        }>(`twitter/blacklist/${userId}`);
        return blacklisted?.blacklisted;
    }
}
