import type { SupabaseClient } from "@supabase/supabase-js";
import { Type, type Tool } from "@google/genai";
import {
  getMemory,
  createMemory,
  updateMemory,
  forgetMemory,
} from "@/lib/supabase/memory";

// Function declarations pre Gemini Live function calling — Fáza 4.5,
// perzistentná pamäť agenta naprieč rozhovormi (na rozdiel od krátkodobej
// pamäte v rámci jednej Live session, ktorú rieši Fáza 4.3).
export const MEMORY_TOOLS: Tool[] = [
  {
    functionDeclarations: [
      {
        name: "get_memory",
        description:
          "Vráti všetky aktívne trvalé záznamy z pamäte agenta (fakty, preferencie, pozorované vzorce, hypotézy, pravidlá o tom, čo sa nemá ukladať). Zavolaj toto, keď sa používateľ opýta, čo si o ňom agent pamätá alebo prečo si niečo myslí/odporučil, alebo keď je pre odpoveď užitočný jeho dlhodobý kontext (napr. skôr uložené preferencie alebo pravidlá).",
        parameters: { type: Type.OBJECT, properties: {} },
      },
      {
        name: "remember",
        description:
          "Uloží novú trvalú informáciu do pamäte agenta — fakt, preferenciu, pozorovaný vzorec, hypotézu o používateľovi, alebo pravidlo typu 'toto sa nikdy nemá ukladať'. Bežné informácie ulož TICHO, bez toho, aby si to nahlas oznamoval. Ak máš podozrenie, že informácia je citlivá (napr. zdravotná, finančná, osobná), najprv sa nahlas spýtaj, či si ju má agent zapamätať aj do budúcna, a bez súhlasu ju neukladaj.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            content: {
              type: Type.STRING,
              description: "Stručný text informácie, ktorá sa má zapamätať.",
            },
            category: {
              type: Type.STRING,
              description:
                "fact (overený fakt) / preference (preferencia používateľa) / pattern (pozorovaný opakujúci sa vzorec) / hypothesis (nepotvrdená domnienka agenta) / rule (pravidlo typu 'toto sa nemá ukladať'). Default fact.",
            },
            evidence: {
              type: Type.STRING,
              description:
                "Voliteľné: prečo si agent túto informáciu alebo hypotézu myslí (napr. na základe akého pozorovania).",
            },
          },
          required: ["content"],
        },
      },
      {
        name: "update_memory",
        description:
          "Upraví existujúci záznam v pamäti podľa ID — napr. keď používateľ povie 'toto už neplatí' (nastav status na superseded, nemaž), keď potvrdí alebo zamietne hypotézu, alebo keď treba opraviť text. Nájdi ID cez get_memory.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            id: {
              type: Type.STRING,
              description: "ID záznamu (zisti cez get_memory).",
            },
            content: { type: Type.STRING },
            category: {
              type: Type.STRING,
              description: "fact / preference / pattern / hypothesis / rule",
            },
            status: {
              type: Type.STRING,
              description:
                "active (platí) / superseded (už neplatí, história sa zachová) / rejected (používateľ hypotézu zamietol)",
            },
            evidence: { type: Type.STRING },
          },
          required: ["id"],
        },
      },
      {
        name: "forget_memory",
        description:
          "Natrvalo a úplne zmaže záznam z pamäte. Použi iba vtedy, keď používateľ výslovne povie niečo ako 'zabudni toto' — na bežné 'toto už neplatí' použi radšej update_memory so status=superseded, aby sa história zachovala.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            id: {
              type: Type.STRING,
              description: "ID záznamu (zisti cez get_memory).",
            },
          },
          required: ["id"],
        },
      },
    ],
  },
];

export const MEMORY_TOOL_NAMES = [
  "get_memory",
  "remember",
  "update_memory",
  "forget_memory",
];

export const MEMORY_SYSTEM_INSTRUCTION = `
Máš aj trvalú pamäť naprieč rozhovormi (nástroje get_memory, remember,
update_memory, forget_memory) — nezávislú od kontextu aktuálnej session.

Pravidlá:
- Bežné trvalé informácie (preferencie, fakty, opakujúce sa vzorce) ukladaj
  cez remember TICHO — bez toho, aby si nahlas oznamoval, že si si niečo
  zapamätal. Ak máš podozrenie, že ide o citlivú informáciu, najprv sa
  spýtaj, či si ju má agent zapamätať aj do budúcna, a bez súhlasu ju
  neukladaj.
- Keď si sám všimneš opakujúci sa vzorec v správaní používateľa, ulož ho
  ako hypotézu (category="hypothesis") — nikdy ju nepodávaj ako istý fakt.
- "Zabudni toto." → zavolaj forget_memory (natrvalo zmaže).
- "Toto už neplatí." → zavolaj update_memory so status="superseded"
  (história sa zachová, ale záznam sa už nepovažuje za platný).
- "Toto si nikdy neukladaj." → zavolaj remember s category="rule" a
  popíš, aký typ informácie sa nemá ukladať.
- Keď sa používateľ opýta, čo si o ňom pamätáš (alebo prečo si niečo
  odporučil/urobil), zavolaj get_memory a v odpovedi jasne rozlíš fakt,
  preferenciu, pozorovaný vzorec a hypotézu/odhad — hypotézu nikdy
  nepodávaj ako istotu.
- Používateľ má vždy posledné slovo nad tým, čo je v pamäti.
`.trim();

export async function runMemoryTool(
  supabase: SupabaseClient,
  name: string,
  args: Record<string, any>
): Promise<{ result?: unknown; error?: string }> {
  try {
    switch (name) {
      case "get_memory":
        return { result: await getMemory(supabase) };
      case "remember":
        if (!args.content) return { error: "Chýba povinné pole 'content'." };
        return { result: await createMemory(supabase, args as any) };
      case "update_memory":
        if (!args.id) return { error: "Chýba povinné pole 'id'." };
        return { result: await updateMemory(supabase, args as any) };
      case "forget_memory":
        if (!args.id) return { error: "Chýba povinné pole 'id'." };
        return { result: await forgetMemory(supabase, args.id) };
      default:
        return { error: `Neznámy nástroj: ${name}` };
    }
  } catch (err: any) {
    console.error(`Chyba pri volaní nástroja ${name}:`, err);
    return { error: err?.message || "Neznáma chyba pri práci s pamäťou." };
  }
}
