
import { useState, useCallback } from 'react';
import { GameImage } from '../types';

export const useImageAttachments = (initialImages: GameImage[] = []) => {
    const [images, setImages] = useState<GameImage[]>(initialImages);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingImage, setEditingImage] = useState<GameImage | undefined>(undefined);

    // Save or Add
    const addImage = useCallback((img: GameImage) => {
        setImages(prev => {
            const exists = prev.some(i => i.id === img.id);
            if (exists) {
                // Edit mode: Replace
                return prev.map(i => i.id === img.id ? img : i);
            }
            // Add mode: Append
            return [...prev, img];
        });
        setEditingImage(undefined);
    }, []);

    const removeImage = useCallback((id: string) => {
        setImages(prev => prev.filter(i => i.id !== id));
    }, []);

    const clearImages = useCallback(() => {
        setImages([]);
    }, []);

    const openModal = useCallback(() => {
        setEditingImage(undefined);
        setIsModalOpen(true);
    }, []);

    const editImage = useCallback((img: GameImage) => {
        setEditingImage(img);
        setIsModalOpen(true);
    }, []);

    const closeModal = useCallback(() => {
        setIsModalOpen(false);
        setEditingImage(undefined);
    }, []);

    return {
        images,
        setImages,
        isModalOpen,
        openModal,
        closeModal,
        addImage, // Logic now handles both add and update based on ID
        removeImage,
        clearImages,
        editingImage,
        editImage
    };
};
