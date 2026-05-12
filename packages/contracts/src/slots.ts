// A published venue page is a fixed per-audience template made of exactly two slot types:
// a Rich Text slot (AI-authored from the owner's description) and an Image slot (the owner's
// chosen/uploaded image; AI never touches it). No title slot. The concrete slot schema
// (roles, length bounds, required/optional) is pinned by feature #4 (ai-copy-and-variants).

export const SLOT_TYPES = ['rich-text', 'image'] as const;
export type SlotType = (typeof SLOT_TYPES)[number];
