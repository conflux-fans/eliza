import pkg from "@apollo/client";
const { gql } = pkg;
import type { SubgraphClient } from "../client";
import { parseMetadata } from "../utils";

export interface TokenCreated {
    ts: string;
    creator: string;
    token: string;
    name: string;
    symbol: string;
    meta: string;
}

export interface TokenTransaction {
    id: string;
    ts: string;
    eth: string;
    amount: string;
    postPrice: string;
    token: string;
}

export interface TokenBought extends TokenTransaction {
    buyer: string;
}

export interface TokenSold extends TokenTransaction {
    seller: string;
}

export interface TokenTransactionsResponse {
    tokenBoughts: TokenBought[];
    tokenSolds: TokenSold[];
}

export interface ParsedTokenCreated extends Omit<TokenCreated, "meta"> {
    meta: {
        description: string;
        image: string;
        website: string | null;
        x: string | null;
        telegram: string | null;
    };
}

export class TokenQueries {
    constructor(private client: SubgraphClient) {}

    async getTokenCreateds(creator?: string): Promise<ParsedTokenCreated[]> {
        const GET_TOKEN_DATA = gql`
      query GetTokenData($creator: String) {
        tokenCreateds(where: ${creator ? "{ creator: $creator }" : "{}"}) {
          ts
          creator
          token
          name
          symbol
          meta
        }
      }
    `;

        const response = await this.client.getClient().query({
            query: GET_TOKEN_DATA,
            variables: creator ? { creator } : undefined,
            fetchPolicy: "network-only",
        });

        const parsed = response.data.tokenCreateds.map(
            (token: TokenCreated) => ({
                ...token,
                meta: parseMetadata(token.meta),
            })
        );
        return parsed;
    }

    async getTokenTransactions(
        tokenAddress: string,
        first: number = 1000,
        skip: number = 0
    ): Promise<TokenTransactionsResponse> {
        const GET_TOKEN_DATA = gql`
            query GetTokenData(
                $tokenAddress: String!
                $first: Int!
                $skip: Int!
            ) {
                tokenBoughts(
                    first: $first
                    skip: $skip
                    where: { token: $tokenAddress }
                ) {
                    id
                    ts
                    eth
                    amount
                    postPrice
                    buyer
                    token
                }
                tokenSolds(
                    first: $first
                    skip: $skip
                    where: { token: $tokenAddress }
                ) {
                    id
                    ts
                    eth
                    amount
                    postPrice
                    seller
                    token
                }
            }
        `;

        const response = await this.client.getClient().query({
            query: GET_TOKEN_DATA,
            variables: { tokenAddress, first, skip },
            fetchPolicy: "network-only",
        });

        return response.data;
    }
}
