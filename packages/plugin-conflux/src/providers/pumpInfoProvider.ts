import { Provider, IAgentRuntime, Memory, State } from "@elizaos/core";
import { TokenQueries } from "../utils/subgraph/queries/token";
import { SubgraphClient } from "../utils/subgraph";

export interface PumpInfoProvider extends Provider {
    client: TokenQueries | null;
}

export const pumpInfoProviderGetter: PumpInfoProvider = {
    client: null,
    get: async (runtime: IAgentRuntime, message: Memory, _state?: State) => {
        if (!pumpInfoProviderGetter.client) {
            pumpInfoProviderGetter.client = new TokenQueries(
                new SubgraphClient({
                    url: runtime.getSetting("CONFLUX_MEME_SUBGRAPH_URL"),
                })
            );
        }

        return {
            client: pumpInfoProviderGetter.client,
        };
    },
};
