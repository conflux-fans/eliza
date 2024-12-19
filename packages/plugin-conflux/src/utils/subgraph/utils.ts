export function parseMetadata(metaString: string) {
  try {
    const metaData = JSON.parse(metaString);
    return {
      description: metaData.description || "",
      image: metaData.image || metaString || "",
      website: metaData.website || null,
      x: metaData.x || null,
      telegram: metaData.telegram || null,
    };
  } catch {
    return {
      description: "",
      image: metaString || "",
    };
  }
} 