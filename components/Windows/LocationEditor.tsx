
import React, { useState } from 'react';
import { MapLocation, GameAttribute, AttributeType, AttributeVisibility, GameImage } from '../../types';
import { Button, Input, Label, TextArea } from '../ui/Button';
import { Save, Sparkles, Plus, Trash, MapPin, Upload } from 'lucide-react';
import { generateRandomFlagAvatar } from '../../assets/imageLibrary';
import { Window } from '../ui/Window';
import { ImageAttachmentList } from '../ui/ImageAttachmentList';
import { ImageUploadModal } from '../Modals/ImageUploadModal';
import { useImageAttachments } from '../../hooks/useImageAttachments';

interface LocationEditorProps {
  location?: MapLocation;
  onSave: (loc: MapLocation) => void;
  onClose: () => void;
}

export const LocationEditor: React.FC<LocationEditorProps> = ({ location, onSave, onClose }) => {
    const [loc, setLoc] = useState<MapLocation>(location ? JSON.parse(JSON.stringify(location)) : {
        id: `loc_${Date.now()}`,
        name: "新地点",
        description: "",
        coordinates: { x: 0, y: 0, z: 0 },
        isKnown: true,
        radius: 50,
        associatedNpcIds: [],
        attributes: {},
        images: []
    });

    // Avatar Upload State
    const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);

    // Use the hook for attachment images
    const { 
        images, 
        addImage, 
        removeImage, 
        isModalOpen: isAttachmentModalOpen, 
        openModal: openAttachmentModal, 
        closeModal: closeAttachmentModal,
        editingImage,
        editImage
    } = useImageAttachments(loc.images);

    const updateAttr = (key: string, field: keyof GameAttribute, val: any) => {
        setLoc(prev => ({
            ...prev,
            attributes: {
                ...prev.attributes,
                [key]: { ...prev.attributes![key], [field]: val }
            }
        }));
    };

    const addAttribute = () => {
        const id = `loc_attr_${Date.now()}`;
        setLoc(prev => ({
            ...prev,
            attributes: {
                ...prev.attributes,
                [id]: { id, name: '新属性', type: AttributeType.TEXT, value: '', visibility: AttributeVisibility.PUBLIC }
            }
        }));
    };

    const removeAttribute = (key: string) => {
        const newAttrs = { ...loc.attributes };
        delete newAttrs[key];
        setLoc(prev => ({ ...prev, attributes: newAttrs }));
    };

    const refreshAvatar = () => {
        setLoc(prev => ({ ...prev, avatarUrl: generateRandomFlagAvatar(true) }));
    };

    const handleAvatarUpdate = (image: GameImage) => {
        setLoc(prev => ({ ...prev, avatarUrl: image.base64 }));
        setIsAvatarModalOpen(false);
    };

    const handleSave = () => {
        // Merge the current hook images back into the location object
        onSave({
            ...loc,
            images: images
        });
    };

    return (
        <Window
            title={location ? '编辑地点' : '创建地点'}
            icon={<MapPin size={20}/>}
            onClose={onClose}
            maxWidth="max-w-3xl"
            height="max-h-[90vh]"
            zIndex={200}
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>取消</Button>
                    <Button onClick={handleSave}><Save size={16} className="mr-2"/> 保存</Button>
                </>
            }
        >
            {isAvatarModalOpen && (
                <ImageUploadModal 
                    onClose={() => setIsAvatarModalOpen(false)}
                    onConfirm={handleAvatarUpdate}
                    initialUrl={loc.avatarUrl}
                />
            )}

            {(isAttachmentModalOpen || editingImage) && (
                <ImageUploadModal 
                    onClose={closeAttachmentModal} 
                    onConfirm={addImage}
                    initialImage={editingImage}
                />
            )}

            <div className="space-y-6">
                {/* Image & Basic Info */}
                <div className="flex flex-col md:flex-row gap-6">
                    <div className="flex flex-col items-center gap-2 shrink-0">
                            {/* Avatar Click Area */}
                            <div 
                                className="w-24 h-24 relative group cursor-pointer rounded-xl overflow-hidden border-2 border-border hover:border-primary transition-all shadow-md"
                                onClick={() => setIsAvatarModalOpen(true)}
                                title="点击更换地点图"
                            >
                                {loc.avatarUrl ? (
                                    <img src={loc.avatarUrl} className="w-full h-full object-cover pixelated" style={{ imageRendering: 'pixelated' }} alt="Location Avatar"/>
                                ) : (
                                    <div className="w-full h-full bg-surface-highlight flex items-center justify-center text-muted">
                                        <MapPin size={32}/>
                                    </div>
                                )}
                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-xs gap-1">
                                    <Upload size={16}/>
                                    <span>更换</span>
                                </div>
                            </div>

                            <Button size="sm" variant="secondary" onClick={refreshAvatar} className="w-full flex justify-center">
                                <Sparkles size={14} className="mr-1"/> 随机
                            </Button>
                    </div>
                    
                    <div className="flex-1 space-y-4 min-w-0">
                        <div>
                            <Label>名称</Label>
                            <Input value={loc.name} onChange={e => setLoc({...loc, name: e.target.value})} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label>坐标 X</Label>
                                <Input type="number" value={loc.coordinates.x} onChange={e => setLoc({...loc, coordinates: {...loc.coordinates, x: parseFloat(e.target.value) || 0}})} />
                            </div>
                            <div>
                                <Label>坐标 Y</Label>
                                <Input type="number" value={loc.coordinates.y} onChange={e => setLoc({...loc, coordinates: {...loc.coordinates, y: parseFloat(e.target.value) || 0}})} />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="w-full">
                    <Label>描述</Label>
                    <TextArea 
                        rows={5}
                        value={loc.description} 
                        onChange={e => setLoc({...loc, description: e.target.value})} 
                        placeholder="地点描述..."
                        className="bg-surface-light w-full mb-2"
                    />
                    <ImageAttachmentList 
                        images={images}
                        onRemove={removeImage}
                        onAdd={openAttachmentModal}
                        onImageClick={editImage}
                        maxImages={4}
                        label="地点图片"
                    />
                </div>

                {/* Attributes */}
                <div className="bg-surface-light p-4 rounded border border-border">
                    <div className="flex justify-between items-center mb-4">
                        <Label>地点属性 (Attributes)</Label>
                        <Button size="sm" variant="secondary" onClick={addAttribute}><Plus size={14} className="mr-1"/> 添加属性</Button>
                    </div>
                    <div className="space-y-2">
                        {(Object.entries(loc.attributes || {}) as [string, GameAttribute][]).map(([key, attr]) => (
                            <div key={key} className="flex gap-2 items-center bg-surface p-2 rounded border border-border">
                                <Input className="h-8 w-24 text-xs" value={attr.name} onChange={e => updateAttr(key, 'name', e.target.value)} placeholder="Name"/>
                                <Input className="h-8 flex-1 text-xs" value={attr.value} onChange={e => updateAttr(key, 'value', e.target.value)} placeholder="Value"/>
                                <button onClick={() => removeAttribute(key)} className="text-muted hover:text-danger-fg p-1"><Trash size={16}/></button>
                            </div>
                        ))}
                        {Object.keys(loc.attributes || {}).length === 0 && (
                            <div className="text-center text-muted text-xs italic py-2">暂无自定义属性</div>
                        )}
                    </div>
                </div>
            </div>
        </Window>
    );
};
