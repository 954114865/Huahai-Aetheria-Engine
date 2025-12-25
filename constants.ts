
import { AttributeType, AttributeVisibility, ContextSegment, GameAttribute } from "./types";

export const GAME_CONSTANTS = {
    DEFAULT_MAX_TOKENS: 1024,
    DEFAULT_TEMPERATURE: 1.0,
};

export const MAP_CONSTANTS = {
    CHUNK_SIZE: 1000, // Meters
    VISUALIZER_GRID_SIZE: 20, // Optimized: Reduced from 50 to 20 for mobile performance (84% less polygons)
    SEA_LEVEL: 10,
    PEAK_HEIGHT: 200,
};

// Setup initial state helpers
export const initialAttributes: Record<string, GameAttribute> = {
  '健康': { id: '健康', name: '健康', type: AttributeType.NUMBER, value: 50, visibility: AttributeVisibility.PUBLIC },
  '体能': { id: '体能', name: '体能', type: AttributeType.NUMBER, value: 50, visibility: AttributeVisibility.PUBLIC },
  '快感': { id: '快感', name: '快感', type: AttributeType.NUMBER, value: 50, visibility: AttributeVisibility.PUBLIC },
  '活跃': { id: '活跃', name: '活跃', type: AttributeType.NUMBER, value: 50, visibility: AttributeVisibility.PUBLIC },
  '能量': { id: '能量', name: '能量', type: AttributeType.NUMBER, value: 50, visibility: AttributeVisibility.PRIVATE },
  '创造点': { id: '创造点', name: '创造点', type: AttributeType.NUMBER, value: 50, visibility: AttributeVisibility.PUBLIC },
  '状态': { id: '状态', name: '状态', type: AttributeType.TEXT, value: '正常', visibility: AttributeVisibility.PUBLIC },
};

export const initialWorldAttributes: Record<string, GameAttribute> = {
  worldTime: { id: 'worldTime', name: '世界时间', type: AttributeType.TEXT, value: '2077:1:1:08:00:00', visibility: AttributeVisibility.PUBLIC },
  world_status: { id: 'world_status', name: '状态', type: AttributeType.TEXT, value: '日间阴天', visibility: AttributeVisibility.PUBLIC },
};

export const defaultContextSegments: ContextSegment[] = [
    { id: 'sys_1', name: '基本设定', content: '你正在进行一场文字角色扮演游戏。请始终保持角色设定。\n角色设定:\n{{PERSONA}}', enabled: true },
    { id: 'sys_2', name: '世界记录', content: '近期故事记录:\n{{HISTORY}}', enabled: true },
    { id: 'sys_3', name: '自我状态', content: '你的当前状态:\n{{SELF_STATUS}}', enabled: true },
    { id: 'sys_4', name: '可见环境', content: '你能看到的世界环境:\n{{WORLD_STATE}}', enabled: true },
    { id: 'sys_5', name: '他人信息', content: '你观察到的其他角色:\n{{OTHERS}}', enabled: true },
    { id: 'sys_6', name: '可用技能/物品', content: '你的固有技能与背包:\n{{SKILLS}}\n公共卡池 (购买需消耗创造点CP):\n{{POOL}}', enabled: true },
];