import { describe, it, expect, beforeEach } from "vitest";
import { TokenQueries } from "../utils/subgraph/queries/token";
import { SubgraphClient } from "../utils/subgraph/client";

describe("TokenQueries", () => {
    let client: SubgraphClient;
    let tokenQueries: TokenQueries;

    beforeEach(() => {
        // Set up the actual subgraph client
        const subgraphUrl =
            "https://testnet.congraph.io/subgraphs/name/0x3d4fb1cf/meme-subgraph";
        client = new SubgraphClient({ url: subgraphUrl });
        tokenQueries = new TokenQueries(client);
    });

    describe("getTokenCreateds", () => {
        it("should fetch tokens without creator filter", async () => {
            const result = await tokenQueries.getTokenCreateds();

            // Verify the structure of the response
            expect(Array.isArray(result)).toBe(true);
            if (result.length > 0) {
                const token = result[0];
                expect(token).toHaveProperty("ts");
                expect(token).toHaveProperty("creator");
                expect(token).toHaveProperty("token");
                expect(token).toHaveProperty("name");
                expect(token).toHaveProperty("symbol");
                expect(token).toHaveProperty("meta");

            }
        });

        it("should fetch tokens with creator filter", async () => {
            // First get a valid creator address from unfiltered results
            const allTokens = await tokenQueries.getTokenCreateds();
            if (allTokens.length === 0) {
                console.warn("No tokens found in subgraph to test with");
                return;
            }

            const creator = allTokens[0].creator;
            const result = await tokenQueries.getTokenCreateds(creator);

            expect(Array.isArray(result)).toBe(true);
            result.forEach((token) => {
                expect(token.creator).toBe(creator);
            });
        });

        it("should handle pagination with first and skip", async () => {
            // Get first batch
            const firstBatch = await tokenQueries.getTokenTransactions(
                "0x1234567890123456789012345678901234567890", // Replace with a known token address
                5, // first
                0 // skip
            );

            // Verify response structure
            expect(firstBatch).toHaveProperty("tokenBoughts");
            expect(firstBatch).toHaveProperty("tokenSolds");
            expect(Array.isArray(firstBatch.tokenBoughts)).toBe(true);
            expect(Array.isArray(firstBatch.tokenSolds)).toBe(true);

            if (firstBatch.tokenBoughts.length > 0) {
                const transaction = firstBatch.tokenBoughts[0];
                expect(transaction).toHaveProperty("id");
                expect(transaction).toHaveProperty("ts");
                expect(transaction).toHaveProperty("eth");
                expect(transaction).toHaveProperty("amount");
                expect(transaction).toHaveProperty("postPrice");
                expect(transaction).toHaveProperty("buyer");
                expect(transaction).toHaveProperty("token");
            }
        });

        it("should handle non-existent creator address", async () => {
            const nonExistentCreator =
                "0x0000000000000000000000000000000000000000";
            const result =
                await tokenQueries.getTokenCreateds(nonExistentCreator);

            expect(Array.isArray(result)).toBe(true);
            expect(result.length).toBe(0);
        });
    });
});
