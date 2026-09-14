import type { SupabaseClient } from "@supabase/supabase-js";
import { Type, type Tool } from "@google/genai";
import {
  listCalendarEvents,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
} from "@/lib/googleCalendar";

export const CALENDAR_TOOLS: Tool[] = [
  {
    functionDeclarations: [
      {
        name: "get_calendar_events",
        description:
          "Vráti udalosti zo skutočného Google kalendára používateľa v danom časovom rozsahu (voliteľne filtrované fulltextovým hľadaním). Zavolaj toto, keď sa používateľ pýta, čo má dnes/zajtra/tento týždeň v kalendári, keď pred vytvorením alebo úpravou udalosti potrebuješ vedieť, čo je už naplánované, alebo keď potrebuješ nájsť ID konkrétnej udalosti.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            time_min: {
              type: Type.STRING,
              description: "Začiatok rozsahu, napr. 2026-09-14 alebo 2026-09-14T00:00:00.",
            },
            time_max: {
              type: Type.STRING,
              description: "Koniec rozsahu, napr. 2026-09-21.",
            },
            query: {
              type: Type.STRING,
              description: "Voliteľné fulltextové hľadanie v názve/popise udalosti.",
            },
          },
        },
      },
      {
        name: "create_calendar_event",
        description:
          "Vytvorí novú udalosť v Google kalendári. Toto je bežná reverzibilná akcia — vykonaj ju rovno bez pýtania sa vopred, po vykonaní iba stručne oznám výsledok.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING, description: "Názov udalosti." },
            description: { type: Type.STRING },
            location: { type: Type.STRING },
            start_datetime: {
              type: Type.STRING,
              description:
                "Začiatok. Iba dátum (YYYY-MM-DD) pre celodennú udalosť, alebo dátum a čas (napr. 2026-09-20T14:00:00) pre časovanú udalosť.",
            },
            end_datetime: {
              type: Type.STRING,
              description: "Koniec, v rovnakom formáte ako start_datetime.",
            },
          },
          required: ["summary", "start_datetime", "end_datetime"],
        },
      },
      {
        name: "update_calendar_event",
        description:
          "Čiastočne upraví existujúcu, jednoznačne identifikovanú udalosť podľa event_id. Pošli iba polia, ktoré sa naozaj menia. Ak si nie si istý, ktorá udalosť je myslená (napr. viac udalostí s podobným názvom), najprv zavolaj get_calendar_events a uisti sa.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            event_id: {
              type: Type.STRING,
              description: "ID udalosti (zisti cez get_calendar_events).",
            },
            summary: { type: Type.STRING },
            description: { type: Type.STRING },
            location: { type: Type.STRING },
            start_datetime: { type: Type.STRING },
            end_datetime: { type: Type.STRING },
          },
          required: ["event_id"],
        },
      },
      {
        name: "delete_calendar_event",
        description:
          "Natrvalo zmaže udalosť z kalendára podľa event_id. Mazanie udalostí VŽDY vyžaduje, aby si sa najprv nahlas opýtal na potvrdenie, a túto funkciu zavolaj až po jasnom súhlase.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            event_id: {
              type: Type.STRING,
              description: "ID udalosti (zisti cez get_calendar_events).",
            },
          },
          required: ["event_id"],
        },
      },
    ],
  },
];

export const CALENDAR_TOOL_NAMES = [
  "get_calendar_events",
  "create_calendar_event",
  "update_calendar_event",
  "delete_calendar_event",
];

export const CALENDAR_TOOLS_SYSTEM_INSTRUCTION = `
Máš aj nástroje na Google kalendár (get_calendar_events, create_calendar_event,
update_calendar_event, delete_calendar_event) — na rozdiel od úloh v internej
databáze je toto skutočný Google kalendár používateľa.
Vytvorenie novej udalosti a úprava jednoznačne identifikovanej udalosti sú
bežné reverzibilné akcie (úroveň 🟢) — vykonaj ich rovno bez pýtania sa
vopred, po vykonaní iba stručne oznám výsledok (napr. "Pridal som poradu s
Petrom na štvrtok o 16:00.").
Ak nie je jasné, ktorá konkrétna udalosť je myslená (napr. viac podobných
názvov), najprv zavolaj get_calendar_events a uisti sa, prípadne sa krátko
opýtaj — nehádaj.
delete_calendar_event je nevratné (úroveň 🟡) — pred jeho zavolaním sa VŽDY
najprv nahlas spýtaj na potvrdenie ("Naozaj mám zmazať udalosť ...?") a
zavolaj ho až po jasnom súhlase.
Pri dátumoch a časoch bez uvedeného roka predpokladaj najbližší nadchádzajúci
výskyt (napr. "v piatok" = najbližší piatok) a pri nejasnosti si over aktuálny
dátum z kontextu rozhovoru namiesto hádania.
`.trim();

export async function runCalendarTool(
  _supabase: SupabaseClient,
  name: string,
  args: Record<string, any>
): Promise<{ result?: unknown; error?: string }> {
  try {
    switch (name) {
      case "get_calendar_events":
        return { result: await listCalendarEvents(args as any) };
      case "create_calendar_event":
        if (!args.summary || !args.start_datetime || !args.end_datetime) {
          return {
            error: "Chýba povinné pole 'summary', 'start_datetime' alebo 'end_datetime'.",
          };
        }
        return { result: await createCalendarEvent(args as any) };
      case "update_calendar_event":
        if (!args.event_id) return { error: "Chýba povinné pole 'event_id'." };
        return { result: await updateCalendarEvent(args as any) };
      case "delete_calendar_event":
        if (!args.event_id) return { error: "Chýba povinné pole 'event_id'." };
        return { result: await deleteCalendarEvent(args.event_id) };
      default:
        return { error: `Neznámy nástroj: ${name}` };
    }
  } catch (err: any) {
    console.error(`Chyba pri volaní nástroja ${name}:`, err);
    return { error: err?.message || "Neznáma chyba pri práci s Google kalendárom." };
  }
}
