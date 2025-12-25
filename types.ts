
export enum AttributeType {
  NUMBER = 'NUMBER',
  TEXT = 'TEXT',
}

export enum AttributeVisibility {
  PUBLIC = 'public', // Everyone sees it
  PRIVATE = 'private', // Only self sees it
}

export enum Provider {
  GEMINI = 'gemini',
  XAI = 'xai', // Grok
  VOLCANO = 'volcano', // Doubao
  OPENROUTER = 'openrouter', // OpenRouter
  OPENAI = 'openai',
  CLAUDE = 'claude',
}

export enum TerrainType {
    LAND = 'Land',   // 野外/陆地
    WATER = 'Water', // 水域 (海/湖)
    RIVER = 'River', // 溪流/河
    CITY = 'City',   // 城市
    TOWN = 'Town',   // 村镇
}

export interface GlobalContextMessage {
    role: 'user' | 'model' | 'system'; 
    content: string;
}

export interface GlobalContextConfig {
    messages: GlobalContextMessage[];
}

export type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high';

export interface AIConfig {
  provider: Provider;
  model?: string;
  apiKey?: string; // Optional override per char
  temperature?: number;
  topP?: number;
  topK?: number;
  maxOutputTokens?: number;
  reasoningEffort?: ReasoningEffort; // New: Thinking Level
  contextConfig?: GlobalContextConfig; // New: Model specific context
}

export interface ContextConfig {
  messages: GlobalContextMessage[]; 
}

export interface ContextSegment {
    id: string;
    name: string;
    content: string;
    enabled: boolean;
}

export interface GameAttribute {
  id: string;
  name: string;
  type: AttributeType;
  value: string | number;
  visibility: AttributeVisibility;
  description?: string;
}

// The core mechanism
export interface Effect {
  id: string;
  name: string;
  // Target definition logic
  targetType: 'world' | 'self' | 'specific_char' | 'all_chars' | 'ai_choice' | 'hit_target';
  targetId?: string; // Specific Char ID if targetType is specific_char
  targetAttribute: string; // key in the attribute map (Free text now)
  
  value: string | number; // The modification
  dynamicValue?: boolean; // If true, AI determines the numeric/text value based on context
  conditionDescription: string; // AI evaluates this
  conditionContextKeys: string[]; // Keys of attributes to send to AI for context
}

export interface Card {
  id: string;
  name: string;
  description: string;
  imageUrl?: string;
  itemType: 'skill' | 'consumable' | 'event'; // Added event for consistency
  triggerType: 'active' | 'passive' | 'settlement' | 'hidden_settlement' | 'reaction'; // Added reaction
  cost: number; // Cost in Creation Points
  effects: Effect[];
  visibility?: AttributeVisibility; // New: Card Visibility (Public/Private)
}

export interface Drive {
    id: string;
    condition: string; // e.g. "Satisfy curiosity"
    amount: number; // Pleasure reward
    weight: number; // Probability weight for this drive to be active
}

export interface Conflict {
    id: string;
    desc: string; // The contradiction/problem description
    apReward: number; // Action Points (Player) & CP (Character) rewarded when solved
    solved: boolean; 
    solvedTimestamp?: number; // When it was solved
}

// --- IMAGE SYSTEM TYPES ---
export interface GameImage {
    id: string;
    base64: string; // Raw base64 string without data:image/jpeg;base64, prefix
    mimeType: string; // e.g. 'image/jpeg'
    description: string; // Text description sent to AI before the image
}
// --------------------------

// --- LETTER SYSTEM TYPES ---
export interface LetterFragment {
    id: string;
    key: string; // JSON key
    label: string; // Display name / Instruction
}

export interface LetterParagraph {
    id: string;
    key: string; // JSON key
    label: string; // Section header
    fragments: LetterFragment[];
    separator: string; // default '\t'
}

export interface LetterTemplate {
    id: string;
    name: string;
    prompt: string; // User's custom instruction
    paragraphs: LetterParagraph[];
}

export interface MailItem {
    id: string;
    timestamp: number;
    charId: string; // Who sent it (NPC)
    templateSnapshot: LetterTemplate; // Snapshot of the template used
    userRequest: string; // What the user asked
    responseRaw: string; // The raw JSON string from AI
    responseParsed: Record<string, any>; // The structured data
    intro?: string; // New: Conversational opening/reply
    attachedImages?: GameImage[]; // Images sent with the mail
}
// ---------------------------

export interface CharacterMemoryConfig {
    useOverride: boolean;
    maxMemoryRounds: number;
    actionDropoutProbability: number;
    reactionDropoutProbability: number;
}

export interface Character {
  id: string;
  isPlayer: boolean;
  name: string;
  appearance: string; // New: Publicly visible appearance
  description: string; // Private biography/personality
  style?: string; // New: Speech style / sample text
  avatarUrl?: string;
  attributes: Record<string, GameAttribute>;
  skills: Card[]; // Fixed Skills (Deck)
  inventory: string[]; // IDs of cards in the Inventory (Hand)
  drives: Drive[]; // Conditions to gain Pleasure
  conflicts: Conflict[]; // Conflicts specific to this character
  
  useAiOverride?: boolean; // New: If true, use aiConfig. If false, use global.
  aiConfig?: AIConfig; // Only for NPCs
  
  memoryConfig?: CharacterMemoryConfig; // New: Character specific memory settings
  
  contextConfig: ContextConfig; // What does the AI know?
  
  // New fields for update
  appearanceCondition: string; // e.g. "When the player enters the tavern"
  enableAppearanceCheck: boolean; // If true, AI checks this condition for turn order inclusion
  initialState?: Partial<Character>; // Snapshot for reset
  
  // Follower Logic
  isFollowing?: boolean; // If true, follows player to new locations

  // Mail System
  mailHistory?: MailItem[]; // New: History of letters

  // Multi-modal Support
  appearanceImages?: GameImage[]; // Max 1
  descriptionImages?: GameImage[]; // Max 3
}

// --- PRIZE POOL TYPES ---
export interface PrizeItem {
    id: string;
    name: string;
    description: string;
    weight: number; // Probability weight
    isHidden?: boolean; // If true, the resulting card will be private
}

export interface PrizePool {
    id: string;
    name: string;
    description: string;
    locationIds: string[]; // New: Locations where this pool is available
    items: PrizeItem[];
    
    // New parameters for draw limits
    minDraws?: number; // Default 1
    maxDraws?: number; // Default 1
}
// ------------------------

// --- TRIGGER SYSTEM TYPES ---
export type TriggerPhase = keyof PromptsConfig;

export type ConditionType = 'char_attr' | 'char_card' | 'world_time' | 'world_attr' | 'char_name' | 'loc_name' | 'region_name' | 'history';

export type Comparator = '>' | '>=' | '=' | '!=' | '<' | '<=';
export type StringComparator = 'exists' | 'not_exists' | 'contains' | 'exact';

export interface TriggerCondition {
    id: string;
    type: ConditionType;
    // Target Selectors
    locationId?: string; // Location ID or 'all'
    characterId?: string; // Character ID or 'all'
    targetName?: string; // For Attr name, Card name, Char name, Loc name
    // Logic
    comparator: Comparator | StringComparator;
    value?: string | number; // The threshold
    historyRounds?: number; // For history type
}

export interface Trigger {
    id: string;
    name: string;
    phase: TriggerPhase;
    conditions: TriggerCondition[];
    urgentRequirement: string; // Appended to prompt
    systemLog: string; // Added to story
    enabled: boolean;
    maxTriggers?: number; // New: Auto-disable after X triggers. -1 means infinite.
}
// ---------------------------

// --- MAP SYSTEM TYPES ---

export interface Coordinates {
    x: number;
    y: number;
    z: number; // Height
}

export interface MapRegion {
    id: string;
    name: string;
    description: string;
    vertices: {x: number, y: number}[]; // Polygon vertices
    center: {x: number, y: number};
    color: string; // RGBA string for visualization
}

// New: Settlements (Cities/Towns)
export interface MapSettlement {
    id: string;
    type: TerrainType.CITY | TerrainType.TOWN;
    name: string; // Auto-generated or placeholder
    vertices: {x: number, y: number}[];
    center: {x: number, y: number};
}

export interface MapLocation {
    id: string;
    name: string;
    description: string;
    coordinates: Coordinates;
    isKnown: boolean; // True = Green (Explored), False = Gray (Unknown)
    radius: number; // Area of influence
    attributes?: Record<string, GameAttribute>; // Like a character
    associatedNpcIds: string[]; // NPCs spawned here
    regionId?: string; // Link to a parent region
    terrainType?: TerrainType; // Saved specific terrain type
    avatarUrl?: string; // New: Location Avatar (Blurred abstract image)
    images?: GameImage[]; // Max 4 location images
}

export interface MapChunk {
    id: string;
    xIndex: number; // Global chunk index X (0, 1, -1 etc)
    yIndex: number; // Global chunk index Y
    size: number; // 1000m usually
    heightMap: number[]; // Flattened array of height values. Optimization: Store specific points or use seed? Storing grid for visualizer.
    seed: number;
    rivers?: number[]; // Indices of points that are river/water
}

export interface CharPosition {
    x: number;
    y: number;
    locationId?: string; // If attached to a specific POI
}

export interface MapState {
    chunks: Record<string, MapChunk>; // Key "x_y"
    locations: Record<string, MapLocation>;
    regions: Record<string, MapRegion>; // New: Regions
    settlements: Record<string, MapSettlement>; // New: Cities and Towns
    charPositions: Record<string, CharPosition>; // CharID -> Pos
    activeLocationId?: string; // The "Play Location" selected by player
    playerCoordinates: { x: number, y: number }; // Player center
    manualExplorationNext?: boolean; // New: If true, skip AI gen for next exploration
}

// ------------------------

export interface RoundState {
  roundNumber: number;
  turnIndex: number;
  phase: GamePhase; // Current execution phase
  activeCharId?: string; // Currently acting character
  defaultOrder: string[]; // The user-defined standard order (e.g., [1, 3, 2])
  currentOrder: string[]; // The actual order for this specific round (might be modified by effects)
  isReverse: boolean;
  isPaused: boolean;
  autoAdvance: boolean; // Deprecated boolean, kept for compatibility but now we use count
  autoAdvanceCount?: number; // New: Number of rounds to auto-play
  actionPoints: number; // Global action points for the player/party to move or act
  lastErrorMessage?: string; // New: Track error message for visualization
  
  // Manual Order Feature
  useManualTurnOrder?: boolean;
  isWaitingForManualOrder?: boolean; // If true, blocks execution until order is confirmed
  
  // Skip Settlement Feature
  skipSettlement?: boolean; // If true, skips settlement phase

  // Auto Reaction Feature
  autoReaction?: boolean; // If true, player characters react automatically using AI. If false, player inputs reaction.

  // Time Flow Control
  isWorldTimeFlowPaused?: boolean; // If true, automatic world time progression is paused

  // Hidden Round Feature
  isHiddenRound?: boolean; // If true, this round is a special hidden round
}

// NEW: Snapshot of Round State for Restoration
export type RoundSnapshot = RoundState;

export interface LogEntry {
    id: string;
    round: number;
    turnIndex: number;
    locationId?: string; // If undefined, considered a "Global" event (e.g. Round Start)
    presentCharIds?: string[]; // IDs of characters present when this happened. Used for memory filtering.
    content: string; // The text content
    timestamp: number;
    type?: 'narrative' | 'system' | 'action';
    isReaction?: boolean; // New: Marks if this log is a passive reaction to another event, not a main turn action
    
    // KEY UPDATE: Stores the round state at the moment this log was created
    snapshot?: RoundSnapshot;
    
    // NEW: Explicitly track who performed the action/reaction in this log
    actingCharId?: string;

    // Multi-modal support
    images?: GameImage[]; // Images attached to this log entry
}

export interface WorldState {
  attributes: Record<string, GameAttribute>; // Weather, Mana, etc. (Location removed)
  history: LogEntry[]; // Structured Story Log
  worldGuidance: string; // User-defined direction for AI generation
}

export type GamePhase = 'init' | 'order' | 'turn_start' | 'char_acting' | 'executing' | 'settlement' | 'round_end';

export interface LockedFeatures {
    cardPoolEditor: boolean;
    characterEditor: boolean;
    locationEditor: boolean;
    actionPoints: boolean;
    // locationReset merged into locationEditor
    worldState: boolean;
    directorInstructions: boolean;
    prizePoolEditor: boolean;
    triggerEditor: boolean; // New
    mapView: boolean; // New: Locks map pan/zoom/view reset
    modelInterface: boolean; // New: Locks model configuration
}

export interface GlobalVariable {
    id: string;
    key: string;
    value: string;
}

// --- THEME SYSTEM ---
export interface ThemePalette {
    baseHue: string; // e.g. "slate", "gray", "zinc" - For Backgrounds/Borders
    baseSat?: number; // 0..2 Saturation Multiplier (Default 1)
    
    primaryHue: string; // e.g. "indigo", "violet" - For Primary Actions
    primarySat?: number; // 0..2 Saturation Multiplier (Default 1)
    
    secondaryHue: string; // e.g. "teal", "cyan" - For Secondary Actions/Highlights
    secondarySat?: number; // 0..2 Saturation Multiplier (Default 1)

    // New Semantic Colors
    libidoHue?: string; // Pleasure related (Default Pink)
    libidoSat?: number; // Independent Saturation

    dopamineHue?: string; // Happiness/Reward related (Default Yellow)
    dopamineSat?: number; // Independent Saturation

    endorphinHue?: string; // Tension/Relief related (Default Orange)
    endorphinSat?: number; // Independent Saturation

    oxytocinHue?: string; // Calm/Trust related (Default Teal)
    oxytocinSat?: number; // Independent Saturation

    // --- Story Log Specific ---
    storyLogBgHue?: string; // Background color for the story log
    storyLogBgSat?: number; 
    storyLogTextHue?: string; // Main text color for the story log
    storyLogTextSat?: number;
}

export interface ThemeConfig {
    light: ThemePalette;
    dark: ThemePalette;
}

export interface ImageSettings {
    maxShortEdge: number;
    maxLongEdge: number;
    compressionQuality: number;
}

export interface AppSettings {
    apiKeys: Record<Provider, string>;
    maxOutputTokens: number; // Max output tokens for generation (Renamed from maxContextSize)
    maxInputTokens: number; // New: Estimated max input tokens for context window
    reactionContextTurns: number; // How many history lines to include for reactions
    devOptionsUnlocked: boolean; // Track if dev options are unlocked in this session
    devPassword?: string; // Password for developer options
    encryptSaveFiles?: boolean; // New: Toggle for save encryption
    saveExpirationDate?: string; // New: ISO String for Save Expiration
    lockedFeatures: LockedFeatures; // New: Feature locking for end-user distribution
    globalVariables: GlobalVariable[]; // New: Global Text Macros
    storyLogLightMode: boolean; // New: Global Light Mode Toggle
    
    // History Limit Settings
    maxHistoryRounds: number; // Rounds of global history to send to AI
    maxShortHistoryRounds: number; // Rounds of short global history for logic checks
    maxCharacterMemoryRounds: number; // Rounds of character-specific memory
    maxEnvMemoryRounds: number; // New: Memory rounds for environment characters
    
    // SPLIT MEMORY DROPOUT SETTINGS
    actionMemoryDropoutProbability?: number; // New: Probability to reduce memory during Action phase (4 rounds)
    reactionMemoryDropoutProbability?: number; // New: Probability to reduce memory during Reaction phase (2 rounds)

    savedLetterTemplates?: LetterTemplate[]; // Saved Letter Templates
    themeConfig: ThemeConfig; // NEW: Theming with Dual Modes
    
    // New: Image Configuration
    imageSettings: ImageSettings;

    // New: Native Chooser Override (for Android)
    useNativeChooser?: boolean;
    
    // Streaming Toggle
    enableStreaming?: boolean;
    
    // Auto Scroll Behavior
    autoScrollOnNewLog?: boolean; // Default false. If true, auto-scroll to bottom on new message.
}

export interface GameplaySettings {
    defaultInitialCP: number;
    defaultCreationCost: number;
    defaultInitialAP: number;
    worldTimeScale?: number; // New: Control simulation speed (1 = 1sec/sec)
    maxNPCsPerRound?: number; // New: Max NPCs to activate per round (Default 4)
}

// New Templates and Prompts structure
export interface Templates {
    character: Character;
    location: MapLocation;
    cards: {
        skill: Card;
        item: Card;
        event: Card;
    };
}

export interface PromptsConfig {
    checkCondition: string;
    checkConditionsBatch: string;
    checkConditionsStrictInstruction: string; // New field for strict mode instruction
    determineTurnOrder: string;
    determineCharacterAction: string;
    determineCharacterReaction: string;
    generateLocationDetails: string;
    analyzeNewConflicts: string;
    analyzeSettlement: string;
    generateCharacter: string;
    generateUnveil: string; // New: Unveil character backstory
    analyzeTimePassage: string; // Deprecated logic, but kept in config structure for safety
    // New instruction snippets
    instruction_generateNewRegion: string;
    instruction_existingRegionContext: string;
    context_nearbyCharacters: string;
    observation: string; // New: Observation prompt
    generateLetter: string; // New: Letter generation prompt
}

export interface WeatherType {
    name: string;
    weight: number;
}

// New: Initial World Configuration
export interface InitialWorldConfig {
    startRegionName: string;
    startRegionDesc: string;
    startLocationName: string;
    startLocationDesc: string;
    environmentCharNameSuffix: string; // e.g. "的环境"
    environmentCharDescTemplate: string;
}

export interface DefaultSettings {
    gameplay: GameplaySettings;
    templates: Templates;
    prompts: PromptsConfig;
    weatherConfig: WeatherType[]; 
    weatherChangeProbability?: number;
    initialWorldConfig?: InitialWorldConfig; // New: Configurable initial world text
}

export interface DebugLog {
    id: string;
    timestamp: number;
    characterName: string;
    prompt: string;
    response: string;
}

export interface WindowState {
    type: 'char' | 'card' | 'settings' | 'world' | 'pool' | 'char_pool' | 'location_pool' | 'dev' | 'char_gen' | 'prize_pool' | 'shop' | 'trigger_pool' | 'letter' | 'theme' | 'location_edit' | 'story_edit' | 'world_composition';
    data?: any;
    id: number;
}

export interface GameState {
  world: WorldState;
  map: MapState; // New Map System
  round: RoundState;
  characters: Record<string, Character>;
  cardPool: Card[];
  prizePools: Record<string, PrizePool>; // New: Lottery System
  triggers: Record<string, Trigger>; // New: Trigger System
  judgeConfig?: AIConfig; // Global AI for judging world effects
  charGenConfig?: AIConfig; // NEW: Dedicated AI for Character Generation
  charBehaviorConfig?: AIConfig; // NEW: Dedicated AI for Character Action/Reaction
  globalContext: GlobalContextConfig; // Global prepended context
  appSettings: AppSettings;
  
  // New central configuration
  defaultSettings: DefaultSettings;

  devMode: boolean;
  debugLogs: DebugLog[];
}

// AI Action Types
export type CommandType = 'use_skill' | 'buy_card' | 'create_card' | 'create_attr' | 'update_attr' | 'move_to' | 'lottery' | 'redeem_card';

export interface AICommand {
    type: CommandType;
    skillId?: string; // For use_skill
    targetId?: string; // For use_skill, create_attr (target char)
    buyCardId?: string; // For buy_card
    createdCard?: Card; // For create_card
    createdAttributes?: Array<{ targetId: string, attribute: GameAttribute }>; // For create_attr
    attributeUpdates?: Array<{ target: 'self'|'world', key: string, value: string|number, visibility?: AttributeVisibility }>; // For update_attr
    destinationName?: string; // For move_to
    
    // Lottery Command
    poolId?: string;
    action?: 'draw' | 'deposit' | 'peek';
    
    // Draw parameters
    amount?: number; // How many items to draw
    
    // Deposit parameters
    cardIds?: string[]; // IDs of inventory cards to deposit (New: Array support)
    // Deprecated: itemName (Support legacy for now)
    itemName?: string; 
    
    isHidden?: boolean;

    // Redeem Card (Environment Character)
    targetCharId?: string;
    oldCardId?: string;
    newCard?: Card;

    // Dynamic Effect Overrides (New)
    // Map effect index (0, 1, 2...) to a specific value determined by the Roleplay AI
    effectOverrides?: Record<number, string | number>;
}

export interface TurnAction {
    narrative: string;
    speech?: string; // New: Separated speech
    timePassed?: string; // New: Time passed string (e.g. "00:00:05:00")
    commands: AICommand[];
    // Environment characters can generate conflicts for others
    generatedConflicts?: Array<{ targetCharId: string, desc: string, apReward: number }>;
    // Environment characters can generate new drives for others (Pleasure System)
    generatedDrives?: Array<{ targetCharId: string, drive: Drive }>;
    // Fallback for raw AI response
    text?: string;
}