import { z } from "zod";

export const TransferSchema = z.object({
    to: z.string(),
    amount: z.number(), // use number ignoring decimals issue
});

export type TransferContent = z.infer<typeof TransferSchema>;

export const isTransferContent = (object: any): object is TransferContent => {
    if (TransferSchema.safeParse(object).success) {
        return true;
    }
    console.error("Invalid content: ", object);
    return false;
};

export const PumpRecommendationSchema = z.object({
    tokenList: z.array(
        z.object({
            symbol: z.string(),
            name: z.string(),
            address: z.string(),
            reason: z.string(),
        })
    ),
});

export type PumpRecommendationContent = z.infer<
    typeof PumpRecommendationSchema
>;

export const isPumpRecommendationContent = (
    object: any
): object is PumpRecommendationContent => {
    if (PumpRecommendationSchema.safeParse(object).success) {
        return true;
    }
    console.error("Invalid content: ", object);
    return false;
};

export const PumpRejectSchema = z.object({
    action: z.literal("REJECT"),
    reason: z.string(),
});

export const PumpCreateSchema = z.object({
    action: z.literal("CREATE_TOKEN"),
    params: z.object({
        symbol: z.string(),
        name: z.string(),
        description: z.string(),
        imageUrl: z.string(),
    }),
});

export const PumpBuySchema = z.object({
    action: z.literal("BUY_TOKEN"),
    params: z.object({
        tokenAddress: z.string(),
        value: z.number(),
    }),
});

export const PumpSellSchema = z.object({
    action: z.literal("SELL_TOKEN"),
    params: z.object({
        tokenAddress: z.string(),
        value: z.number(),
    }),
});

export const PumpSchema = z.union([
    PumpCreateSchema,
    // PumpBuySchema,
    // PumpSellSchema,
    PumpRejectSchema,
]);

export type PumpContent = z.infer<typeof PumpSchema>;
export type PumpCreateContent = z.infer<typeof PumpCreateSchema>;
export type PumpBuyContent = z.infer<typeof PumpBuySchema>;
export type PumpSellContent = z.infer<typeof PumpSellSchema>;

export function isPumpContent(object: any): object is PumpContent {
    if (PumpSchema.safeParse(object).success) {
        return true;
    }
    console.error("Invalid content: ", object);
    return false;
}

export function isPumpCreateContent(object: any): object is PumpCreateContent {
    return PumpCreateSchema.safeParse(object).success;
}

export function isPumpBuyContent(object: any): object is PumpBuyContent {
    return PumpBuySchema.safeParse(object).success;
}

export function isPumpSellContent(object: any): object is PumpSellContent {
    return PumpSellSchema.safeParse(object).success;
}
