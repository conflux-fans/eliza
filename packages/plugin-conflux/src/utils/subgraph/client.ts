import pkg from "@apollo/client";
const { ApolloClient, InMemoryCache } = pkg;
import type { ApolloClient as ApolloClientType } from "@apollo/client";

export interface SubgraphConfig {
    url: string;
}

export class SubgraphClient {
    private client: ApolloClientType<any>;

    constructor(config: SubgraphConfig) {
        this.client = new ApolloClient({
            uri: config.url,
            cache: new InMemoryCache(),
        });
    }

    getClient() {
        return this.client;
    }

    async query(options: any) {
        console.log("Query:", options);
        const result = await this.client.query(options);
        console.log("Response:", result);
        return result;
    }
}
