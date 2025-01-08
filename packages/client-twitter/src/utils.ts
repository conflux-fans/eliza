import { Tweet } from "agent-twitter-client";
import { getEmbeddingZeroVector } from "@ai16z/eliza";
import { Content, Memory, UUID } from "@ai16z/eliza";
import { stringToUuid } from "@ai16z/eliza";
import { ClientBase } from "./base";
import { elizaLogger } from "@ai16z/eliza";
import { DEFAULT_MAX_TWEET_LENGTH } from "./environment";
import { Media } from "@ai16z/eliza";
import fs from "fs";
import path from "path";

export const wait = (minTime: number = 1000, maxTime: number = 3000) => {
    const waitTime =
        Math.floor(Math.random() * (maxTime - minTime + 1)) + minTime;
    return new Promise((resolve) => setTimeout(resolve, waitTime));
};

export const isValidTweet = (tweet: Tweet): boolean => {
    // Filter out tweets with too many hashtags, @s, or $ signs, probably spam or garbage
    const hashtagCount = (tweet.text?.match(/#/g) || []).length;
    const atCount = (tweet.text?.match(/@/g) || []).length;
    const dollarSignCount = (tweet.text?.match(/\$/g) || []).length;
    const totalCount = hashtagCount + atCount + dollarSignCount;

    return (
        hashtagCount <= 1 &&
        atCount <= 2 &&
        dollarSignCount <= 1 &&
        totalCount <= 3
    );
};

export async function buildConversationThread(
    tweet: Tweet,
    client: ClientBase,
    maxReplies: number = 10
): Promise<Tweet[]> {
    const thread: Tweet[] = [];
    const visited: Set<string> = new Set();

    async function processThread(currentTweet: Tweet, depth: number = 0) {
        elizaLogger.debug("Processing tweet:", {
            id: currentTweet.id,
            inReplyToStatusId: currentTweet.inReplyToStatusId,
            depth: depth,
        });

        if (!currentTweet) {
            elizaLogger.debug("No current tweet found for thread building");
            return;
        }

        // Stop if we've reached our reply limit
        if (depth >= maxReplies) {
            elizaLogger.debug("Reached maximum reply depth", depth);
            return;
        }

        // Handle memory storage
        const memory = await client.runtime.messageManager.getMemoryById(
            stringToUuid(currentTweet.id + "-" + client.runtime.agentId)
        );
        if (!memory) {
            const roomId = stringToUuid(
                currentTweet.conversationId + "-" + client.runtime.agentId
            );
            const userId = stringToUuid(currentTweet.userId);

            await client.runtime.ensureConnection(
                userId,
                roomId,
                currentTweet.username,
                currentTweet.name,
                "twitter"
            );

            await client.runtime.messageManager.createMemory({
                id: stringToUuid(
                    currentTweet.id + "-" + client.runtime.agentId
                ),
                agentId: client.runtime.agentId,
                content: {
                    text: currentTweet.text,
                    source: "twitter",
                    url: currentTweet.permanentUrl,
                    inReplyTo: currentTweet.inReplyToStatusId
                        ? stringToUuid(
                              currentTweet.inReplyToStatusId +
                                  "-" +
                                  client.runtime.agentId
                          )
                        : undefined,
                },
                createdAt: currentTweet.timestamp * 1000,
                roomId,
                userId:
                    currentTweet.userId === client.profile.id
                        ? client.runtime.agentId
                        : stringToUuid(currentTweet.userId),
                embedding: getEmbeddingZeroVector(),
            });
        }

        if (visited.has(currentTweet.id)) {
            elizaLogger.debug("Already visited tweet:", currentTweet.id);
            return;
        }

        visited.add(currentTweet.id);
        thread.unshift(currentTweet);

        elizaLogger.debug("Current thread state:", {
            length: thread.length,
            currentDepth: depth,
            tweetId: currentTweet.id,
        });

        // If there's a parent tweet, fetch and process it
        if (currentTweet.inReplyToStatusId) {
            elizaLogger.debug(
                "Fetching parent tweet:",
                currentTweet.inReplyToStatusId
            );
            try {
                const parentTweet = await client.twitterClient.getTweet(
                    currentTweet.inReplyToStatusId
                );

                if (parentTweet) {
                    elizaLogger.debug("Found parent tweet:", {
                        id: parentTweet.id,
                        text: parentTweet.text?.slice(0, 50),
                    });
                    await processThread(parentTweet, depth + 1);
                } else {
                    elizaLogger.debug(
                        "No parent tweet found for:",
                        currentTweet.inReplyToStatusId
                    );
                }
            } catch (error) {
                elizaLogger.error("Error fetching parent tweet:", {
                    tweetId: currentTweet.inReplyToStatusId,
                    error,
                });
            }
        } else {
            elizaLogger.debug(
                "Reached end of reply chain at:",
                currentTweet.id
            );
        }
    }

    await processThread(tweet, 0);

    elizaLogger.debug("Final thread built:", {
        totalTweets: thread.length,
        tweetIds: thread.map((t) => ({
            id: t.id,
            text: t.text?.slice(0, 50),
        })),
    });

    return thread;
}

export function getMediaType(attachment: Media) {
    if (attachment.contentType?.startsWith("video")) {
        return "video";
    } else if (attachment.contentType?.startsWith("image")) {
        return "image";
    } else {
        throw new Error(`Unsupported media type`);
    }
}

export async function sendTweet(
    client: ClientBase,
    content: Content,
    roomId: UUID,
    twitterUsername: string,
    inReplyTo: string
): Promise<Memory[]> {
    const tweetChunks = splitTweetContent(
        content.text,
        Number(client.runtime.getSetting("MAX_TWEET_LENGTH")) ||
            DEFAULT_MAX_TWEET_LENGTH
    );
    const sentTweets: Tweet[] = [];
    let previousTweetId = inReplyTo;

    for (const chunk of tweetChunks) {
        let mediaData: { data: Buffer; mediaType: string }[] | undefined;

        if (content.attachments && content.attachments.length > 0) {
            mediaData = await Promise.all(
                content.attachments.map(async (attachment: Media) => {
                    if (/^(http|https):\/\//.test(attachment.url)) {
                        // Handle HTTP URLs
                        const response = await fetch(attachment.url);
                        if (!response.ok) {
                            throw new Error(
                                `Failed to fetch file: ${attachment.url}`
                            );
                        }
                        const mediaBuffer = Buffer.from(
                            await response.arrayBuffer()
                        );
                        const mediaType = getMediaType(attachment);
                        return { data: mediaBuffer, mediaType };
                    } else if (fs.existsSync(attachment.url)) {
                        // Handle local file paths
                        const mediaBuffer = await fs.promises.readFile(
                            path.resolve(attachment.url)
                        );
                        const mediaType = getMediaType(attachment);
                        return { data: mediaBuffer, mediaType };
                    } else {
                        throw new Error(
                            `File not found: ${attachment.url}. Make sure the path is correct.`
                        );
                    }
                })
            );
        }
        const result = await client.requestQueue.add(
            async () =>
                await client.twitterClient.sendTweet(
                    chunk.trim(),
                    previousTweetId,
                    mediaData
                )
        );
        const body = await result.json();

        // if we have a response
        if (body?.data?.create_tweet?.tweet_results?.result) {
            // Parse the response
            const tweetResult = body.data.create_tweet.tweet_results.result;
            const finalTweet: Tweet = {
                id: tweetResult.rest_id,
                text: tweetResult.legacy.full_text,
                conversationId: tweetResult.legacy.conversation_id_str,
                timestamp:
                    new Date(tweetResult.legacy.created_at).getTime() / 1000,
                userId: tweetResult.legacy.user_id_str,
                inReplyToStatusId: tweetResult.legacy.in_reply_to_status_id_str,
                permanentUrl: `https://twitter.com/${twitterUsername}/status/${tweetResult.rest_id}`,
                hashtags: [],
                mentions: [],
                photos: [],
                thread: [],
                urls: [],
                videos: [],
            };
            sentTweets.push(finalTweet);
            previousTweetId = finalTweet.id;
        } else {
            console.error("Error sending chunk", chunk, "repsonse:", body);
        }

        // Wait a bit between tweets to avoid rate limiting issues
        await wait(1000, 2000);
    }

    const memories: Memory[] = sentTweets.map((tweet) => ({
        id: stringToUuid(tweet.id + "-" + client.runtime.agentId),
        agentId: client.runtime.agentId,
        userId: client.runtime.agentId,
        content: {
            text: tweet.text,
            source: "twitter",
            url: tweet.permanentUrl,
            inReplyTo: tweet.inReplyToStatusId
                ? stringToUuid(
                      tweet.inReplyToStatusId + "-" + client.runtime.agentId
                  )
                : undefined,
        },
        roomId,
        embedding: getEmbeddingZeroVector(),
        createdAt: tweet.timestamp * 1000,
    }));

    return memories;
}

function splitTweetContent(content: string, maxLength: number): string[] {
    const paragraphs = content.split("\n\n").map((p) => p.trim());
    const tweets: string[] = [];
    let currentTweet = "";

    for (const paragraph of paragraphs) {
        if (!paragraph) continue;

        if ((currentTweet + "\n\n" + paragraph).trim().length <= maxLength) {
            if (currentTweet) {
                currentTweet += "\n\n" + paragraph;
            } else {
                currentTweet = paragraph;
            }
        } else {
            if (currentTweet) {
                tweets.push(currentTweet.trim());
            }
            if (paragraph.length <= maxLength) {
                currentTweet = paragraph;
            } else {
                // Split long paragraph into smaller chunks
                const chunks = splitParagraph(paragraph, maxLength);
                tweets.push(...chunks.slice(0, -1));
                currentTweet = chunks[chunks.length - 1];
            }
        }
    }

    if (currentTweet) {
        tweets.push(currentTweet.trim());
    }

    return tweets;
}

function extractUrls(paragraph: string): {
    textWithPlaceholders: string;
    placeholderMap: Map<string, string>;
} {
    // 这里的正则仅作示例，可根据业务需要升级或改写
    const urlRegex = /https?:\/\/[^\s]+/g;
    const placeholderMap = new Map<string, string>();

    let urlIndex = 0;
    const textWithPlaceholders = paragraph.replace(urlRegex, (match) => {
        const placeholder = `<<URL_CONSIDERER_23_${urlIndex}>>`; // 占位符，不含. ? ! 等
        placeholderMap.set(placeholder, match);
        urlIndex++;
        return placeholder;
    });

    return { textWithPlaceholders, placeholderMap };
}

function splitSentencesAndWords(text: string, maxLength: number): string[] {
    // 这里按照“句号、问号、感叹号”拆分即可
    // 注意此时 text 中的 URL 已变成 `<<URL_xxx>>`，不会再被.分割
    const sentences = text.match(/[^\.!\?]+[\.!\?]+|[^\.!\?]+$/g) || [text];
    const chunks: string[] = [];
    let currentChunk = "";

    for (const sentence of sentences) {
        if ((currentChunk + " " + sentence).trim().length <= maxLength) {
            if (currentChunk) {
                currentChunk += " " + sentence;
            } else {
                currentChunk = sentence;
            }
        } else {
            // 放不下了，先把 currentChunk 推到结果
            if (currentChunk) {
                chunks.push(currentChunk.trim());
            }

            // 如果当前 sentence 本身就小于等于 maxLength
            if (sentence.length <= maxLength) {
                currentChunk = sentence;
            } else {
                // 需要再对 sentence 做“空格拆分”
                const words = sentence.split(" ");
                currentChunk = "";
                for (const word of words) {
                    if (
                        (currentChunk + " " + word).trim().length <= maxLength
                    ) {
                        if (currentChunk) {
                            currentChunk += " " + word;
                        } else {
                            currentChunk = word;
                        }
                    } else {
                        if (currentChunk) {
                            chunks.push(currentChunk.trim());
                        }
                        currentChunk = word;
                    }
                }
            }
        }
    }

    // 收尾
    if (currentChunk) {
        chunks.push(currentChunk.trim());
    }

    return chunks;
}

function restoreUrls(
    chunks: string[],
    placeholderMap: Map<string, string>
): string[] {
    return chunks.map((chunk) => {
        // 用正则把 chunk 中的所有 <<URL_xxx>> 都替换回去
        return chunk.replace(/<<URL_CONSIDERER_23_(\d+)>>/g, (match) => {
            const original = placeholderMap.get(match);
            return original || match; // 找不到就返回占位符本身（理论不会发生）
        });
    });
}

function splitParagraph(paragraph: string, maxLength: number): string[] {
    // 1) 提取URL并替换为占位符
    const { textWithPlaceholders, placeholderMap } = extractUrls(paragraph);

    // 2) 使用第一段的逻辑，先按句子拆分，再做二次拆分
    const splittedChunks = splitSentencesAndWords(
        textWithPlaceholders,
        maxLength
    );

    // 3) 将占位符替换回原始 URL
    const restoredChunks = restoreUrls(splittedChunks, placeholderMap);

    return restoredChunks;
}
