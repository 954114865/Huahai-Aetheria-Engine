
import { GameImage } from "../../types";
import { interleaveImages } from "./promptUtils";

export class ImageContextBuilder {
    private imageMap: Record<string, GameImage> = {};

    /**
     * Register a single image and return its placeholder string.
     */
    register(img: GameImage): string {
        this.imageMap[img.id] = img;
        return `[[IMG:${img.id}]]`;
    }

    /**
     * Register a list of images and return a formatted context string.
     * Example: "\n[外观参考图]: (你看到的：描述) [[IMG:id]] [ImageID: id]"
     * Note: [ImageID: ...] is crucial for the model to reference the image back in JSON.
     */
    registerList(imgs: GameImage[] | undefined, label: string = "参考图"): string {
        if (!imgs || imgs.length === 0) return "";
        return "\n[" + label + "]: " + imgs.map(img => {
            const descPart = img.description ? `(你看到：${img.description}) ` : "";
            return `${descPart}${this.register(img)} [ImageID: ${img.id}]`;
        }).join(" ");
    }

    /**
     * Appends registered images to the end of a text block.
     * Useful for user requests or triggers.
     */
    registerAndAppend(text: string, imgs: GameImage[] | undefined, label: string = "附图"): string {
        if (!imgs || imgs.length === 0) return text;
        const imgTags = imgs.map(img => {
            const descPart = img.description ? `(${label}：${img.description}) ` : "";
            return `\n${descPart}${this.register(img)} [ImageID: ${img.id}]`;
        }).join("");
        return text + imgTags;
    }

    /**
     * Replaces placeholders in the text with actual image parts for the AI model.
     */
    interleave(promptText: string): any[] {
        return interleaveImages(promptText, this.imageMap);
    }
}
