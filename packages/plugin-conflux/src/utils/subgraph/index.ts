import { SubgraphClient, type SubgraphConfig } from "./client";
import { TokenQueries } from "./queries/token";

export class SubgraphSDK {
  private client: SubgraphClient;
  public token: TokenQueries;

  constructor(config: SubgraphConfig) {
    this.client = new SubgraphClient(config);
    this.token = new TokenQueries(this.client);
  }
}

export * from "./client";
export * from "./queries/token"; 