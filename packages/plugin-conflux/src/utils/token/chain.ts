import { IAgentRuntime, elizaLogger } from "@elizaos/core";
import {
    createPublicClient,
    createWalletClient,
    http,
    parseEther,
    encodeFunctionData,
    parseEventLogs,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { confluxESpaceTestnet, confluxESpace } from "viem/chains";
import { PumpCreateContent } from "../../types";
import { getImageCIDFromURL, uploadImageUsingURL } from "../token/upload";
import MEMEABI from "../../abi/meme";
import ERC20ABI from "../../abi/erc20";

export function chainFromRuntime(runtime: IAgentRuntime) {
    const isTestnet = runtime.getSetting("CONFLUX_IS_TESTNET") === "true";
    return isTestnet ? confluxESpaceTestnet : confluxESpace;
}

function publicClientFromRuntime(runtime: IAgentRuntime) {
    return createPublicClient({
        transport: http(runtime.getSetting("CONFLUX_ESPACE_RPC_URL")),
        chain: chainFromRuntime(runtime),
    });
}

function walletClientFromRuntime(runtime: IAgentRuntime) {
    return createWalletClient({
        transport: http(runtime.getSetting("CONFLUX_ESPACE_RPC_URL")),
        chain: chainFromRuntime(runtime),
    });
}

function memeContractAddressFromRuntime(runtime: IAgentRuntime) {
    return runtime.getSetting("CONFLUX_MEME_CONTRACT_ADDRESS") as `0x${string}`;
}

function accountFromRuntime(runtime: IAgentRuntime) {
    return privateKeyToAccount(
        runtime.getSetting("CONFLUX_ESPACE_PRIVATE_KEY") as `0x${string}`
    );
}

// Helper function to check and approve token allowance if needed
export async function ensureAllowance(
    runtime: IAgentRuntime,
    tokenAddress: `0x${string}`,
    amount: bigint
) {
    const memeAddress = memeContractAddressFromRuntime(runtime);
    const account = accountFromRuntime(runtime);
    const publicClient = publicClientFromRuntime(runtime);
    const walletClient = walletClientFromRuntime(runtime);

    console.log(
        `Checking allowance: token: ${tokenAddress} meme: ${memeAddress} amount: ${amount}`
    );

    const allowance = await publicClient.readContract({
        address: tokenAddress,
        abi: ERC20ABI,
        functionName: "allowance",
        args: [account.address, memeAddress],
    });

    console.log("allowance:", allowance);

    if (allowance < amount) {
        console.log(
            `allowance(${allowance}) is less than amount(${amount}), approving...`
        );

        const hash = await walletClient.sendTransaction({
            account,
            to: tokenAddress,
            data: encodeFunctionData({
                abi: ERC20ABI,
                functionName: "approve",
                args: [memeAddress, amount - allowance],
            }),
            chain: chainFromRuntime(runtime),
            kzg: null,
        });

        console.log(`Approving hash: ${hash}`);
        await publicClient.waitForTransactionReceipt({ hash });
        console.log(`Approving success: ${hash}`);
    } else {
        console.log(`No need to approve`);
    }
}

interface TokenCreationResult {
    tokenAddress: string;
    hash: string;
}

export async function createToken(
    runtime: IAgentRuntime,
    contentObject: PumpCreateContent
): Promise<string> {
    // 1. Prepare metadata
    const { name, symbol, description, imageUrl } = contentObject.params;
    elizaLogger.log(
        "[Plugin Conflux] creating token with params: ",
        name,
        symbol,
        description,
        imageUrl
    );

    // 2. Get image CID and create metadata
    const cid = await getImageCIDFromURL(
        runtime.getSetting("CONFLUX_ELIZA_HELPER_URL"),
        imageUrl
    );
    const meta = JSON.stringify({ description, image: cid });

    // 3. Prepare transaction data
    const data = encodeFunctionData({
        abi: MEMEABI,
        functionName: "newToken",
        args: [name, symbol, meta],
    });
    const value = parseEther("10");

    // 4. Execute transaction and get token address
    const memeContractAddress = memeContractAddressFromRuntime(runtime);
    const result = await executeTokenCreation(
        runtime,
        memeContractAddress,
        data,
        value
    );

    // 5. Schedule image upload
    scheduleImageUpload(runtime, imageUrl);

    const confiPumpUrl = runtime.getSetting("CONFLUX_CONFI_PUMP_URL") as string;

    // 6. Return success message
    return formatSuccessMessage(confiPumpUrl, name, result.tokenAddress);
}

async function executeTokenCreation(
    runtime: IAgentRuntime,
    memeContractAddress: `0x${string}`,
    data: string,
    value: bigint
): Promise<TokenCreationResult> {
    const hash = await sendTransaction(
        runtime,
        memeContractAddress,
        data,
        value
    );
    const publicClient = publicClientFromRuntime(runtime);

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const memeLogs = receipt.logs.filter((log) => log.address === receipt.to);

    const tokenCreatedEvents = parseEventLogs({
        abi: MEMEABI,
        logs: memeLogs,
    });

    const tokenAddress = tokenCreatedEvents.find(
        (event) => event.eventName === "TokenCreated"
    ).args.token;

    console.log("tokenAddress:", tokenAddress);

    return { tokenAddress, hash };
}

function scheduleImageUpload(runtime: IAgentRuntime, imageUrl: string): void {
    setTimeout(async () => {
        await uploadImageUsingURL(
            runtime.getSetting("CONFLUX_ELIZA_HELPER_URL"),
            imageUrl
        );
        console.log("[Plugin Conflux] image uploaded");
    }, 90000);
}

function formatSuccessMessage(
    confiPumpUrl: string,
    tokenName: string,
    tokenAddress: string
): string {
    return `Token ${tokenName} created successfully!\nCheck: ${confiPumpUrl}/tokens/${tokenAddress}`;
}

async function sendTransaction(
    runtime: IAgentRuntime,
    to: `0x${string}`,
    data: any,
    value: bigint
): Promise<`0x${string}`> {
    const account = accountFromRuntime(runtime);
    const walletClient = walletClientFromRuntime(runtime);

    return await walletClient.sendTransaction({
        account,
        to,
        data,
        chain: chainFromRuntime(runtime),
        kzg: null,
        value,
    });
}
