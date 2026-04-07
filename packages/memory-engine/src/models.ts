// Model IDs — update here to swap models across the pipeline
export const MODELS = {
  STAGE1_EXTRACT: 'gemini-2.0-flash-lite',   // Gemini: high-volume per-message extraction
  STAGE2_SNAPSHOT: 'gpt-5.4-nano',           // OpenAI: snapshot synthesis + /brief
  STAGE3_PROPOSE: 'gpt-5.4',                 // OpenAI: writeback proposal generation
} as const;

// Bump when system prompts change so artifacts remain replayable
export const PROMPT_VERSIONS = {
  STAGE1_EXTRACT: 'v1',
  STAGE2_SNAPSHOT: 'v1',
  STAGE3_PROPOSE: 'v1',
} as const;

// Minimum confidence required for a proposal to be surfaced for approval
export const MIN_PROPOSAL_CONFIDENCE = 0.65;

// Minimum confidence required for an observation to be included in snapshots
export const MIN_OBSERVATION_CONFIDENCE = 0.30;
