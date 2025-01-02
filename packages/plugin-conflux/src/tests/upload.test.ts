import { describe, it, expect } from "vitest";
import { downloadImage, getImageCID } from "../utils/token/upload";

describe("Upload utilities", () => {
    describe("getImageCID", () => {
        it("should successfully get CID for an image", async () => {
            const file = await downloadImage(
                "https://pbs.twimg.com/media/GgGFFJDasAAA3vR.jpg"
            );
            // const imageFile = new File(["test image"], "test.jpg", {
            //     type: "image/jpeg",
            // });

            const result = await getImageCID(
                "https://pic-test.confipump.fun",
                file
            );
            expect(typeof result).toBe("string");
            expect(result).toBeTruthy();
        });
    });
});
