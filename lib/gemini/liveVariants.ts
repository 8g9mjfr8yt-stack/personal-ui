// DOČASNÉ (test rýchlosti hlasu, 2026-09-30): varianty modelu Gemini Live
// na porovnanie odozvy pri volaní nástrojov. Výber je v paneli Merania
// (Viac), uložený v localStorage zariadenia. Server prijme iba varianty
// z tohto zoznamu. Po vyhodnotení ponechať jeden model a súbor odstrániť.
export type LiveVariantId = "3.1" | "3.1-min" | "3.8";

export const LIVE_VARIANTS: Record<
  LiveVariantId,
  { label: string; model: string; thinkingConfig?: { thinkingLevel: string } }
> = {
  "3.1": { label: "3.1 Flash Live (doterajší)", model: "gemini-3.1-flash-live-preview" },
  "3.1-min": {
    label: "3.1 Flash Live + minimal thinking",
    model: "gemini-3.1-flash-live-preview",
    thinkingConfig: { thinkingLevel: "MINIMAL" },
  },
  "3.8": { label: "3.8 Live", model: "gemini-3.8-live" },
};

export const DEFAULT_LIVE_VARIANT: LiveVariantId = "3.1";
export const LIVE_VARIANT_KEY = "da_voice_variant";

export function resolveVariant(id: unknown): LiveVariantId {
  return typeof id === "string" && id in LIVE_VARIANTS ? (id as LiveVariantId) : DEFAULT_LIVE_VARIANT;
}
