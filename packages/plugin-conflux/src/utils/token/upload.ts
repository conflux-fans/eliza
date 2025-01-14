export async function downloadImage(imageUrl: string) {
    console.log("downloadImage: ", imageUrl);
    try {
        const response = await fetch(imageUrl);
        if (!response.ok) {
            throw new Error(`Failed to download image: ${response.statusText}`);
        }
        const blob = await response.blob();

        // 验证是否为图片
        if (!blob.type.startsWith("image/")) {
            throw new Error(`Invalid file type: ${blob.type}`);
        }

        // Convert blob to File object
        const fileName = `image.${blob.type.split("/")[1]}`;
        const file = new File([blob], fileName, { type: blob.type });

        return file;
    } catch (error) {
        console.error("Error downloading image:", error);
        throw new Error(`Failed to download image: ${error.message}`);
    }
}

export async function getImageCIDFromURL(helperURL: string, imageUrl: string) {
    const response = await fetch(helperURL + "/api/getCID", {
        method: "POST",
        redirect: 'follow',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ imageUrl }),
    });

    if (!response.ok) {
        const errorData = await response.text();
        throw new Error(errorData);
    }

    const data = await response.json();
    if (!data.cid) {
        throw new Error("Failed to get CID");
    }
    console.info("getImageCIDFromURL: ", data);
    return data.cid;
}

export async function uploadImageUsingURL(helperURL: string, imageUrl: string) {
    const response = await fetch(helperURL + "/api/uploadToIPFS", {
        method: "POST",
        redirect: 'follow',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ imageUrl }),
    });
    const data = await response.json();
    return data;
}

export async function getImageCID(apiURL: string, f: File) {
    const formData = new FormData();
    formData.append("image", f);

    try {
        const response = await fetch(apiURL + "/getCID", {
            method: "POST",
            body: formData,
        });

        // 先检查响应文本
        const responseText = await response.text();

        try {
            const data = JSON.parse(responseText);
            if (!data || !data.cid) {
                throw new Error("Invalid response: missing CID");
            }
            console.info("getImageCID: ", data);
            return data.cid;
        } catch (e) {
            throw new Error(`Server response: ${responseText}`);
        }
    } catch (error) {
        console.error("Error getting image CID:", error);
        throw new Error(`Failed to get image CID: ${error.message}`);
    }
}

export async function uploadImage(apiURL: string, f: File) {
    const formData = new FormData();
    formData.append("image", f);
    const response = await fetch(apiURL + "/uploadToIPFS", {
        method: "POST",
        body: formData,
    });
    const data = await response.json();
    return data.url;
}
