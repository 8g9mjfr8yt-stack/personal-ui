import type { SupabaseClient } from "@supabase/supabase-js";
import { Type, type Tool } from "@google/genai";
import {
  getTasks,
  createTask,
  updateTask,
  completeTask,
  deleteTask,
} from "@/lib/supabase/tasks";

// Function declarations pre Gemini Live function calling (Fáza 4.4 — fast
// path). Mená a polia kopírujú n8n tools z Fázy 3; rozdiel je iba v tom,
// že teraz ich agent volá priamo počas živého rozhovoru a vykonávajú sa
// ako priame Supabase volania z prehliadača (žiadny n8n v hot path).
export const TASK_TOOLS: Tool[] = [
  {
    functionDeclarations: [
      {
        name: "get_tasks",
        description:
          "Vráti zoznam VŠETKÝCH nedokončených úloh používateľa (vrátane ich termínov due_date), zoradených podľa termínu. Zavolaj toto VŽDY, keď sa používateľ opýta na svoje úlohy alebo plán (napr. \"čo mám dnes\", \"aké mám úlohy\", \"čo mám na budúci týždeň\") — aj keď si nechce nič upraviť, iba sa pýta. Zavolaj toto aj vtedy, keď potrebuješ zistiť ID konkrétnej úlohy na jej úpravu, dokončenie alebo zmazanie.",
        parameters: { type: Type.OBJECT, properties: {} },
      },
      {
        name: "create_task",
        description: "Vytvorí novú úlohu.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING, description: "Názov úlohy." },
            description: {
              type: Type.STRING,
              description: "Voliteľný detailný popis.",
            },
            priority: {
              type: Type.STRING,
              description: "Voliteľná priorita, napr. low/medium/high.",
            },
            due_date: {
              type: Type.STRING,
              description: "Voliteľný termín v tvare YYYY-MM-DD.",
            },
            scheduled_time: {
              type: Type.STRING,
              description: "Voliteľný presný naplánovaný čas v ISO 8601 formáte.",
            },
          },
          required: ["title"],
        },
      },
      {
        name: "update_task",
        description:
          "Čiastočne upraví existujúcu úlohu podľa jej ID (napr. presunie termín, zmení názov alebo prioritu). Pošli iba polia, ktoré sa naozaj majú zmeniť — ostatné zostanú nezmenené.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING, description: "ID úlohy (zisti cez get_tasks)." },
            title: { type: Type.STRING },
            description: { type: Type.STRING },
            status: { type: Type.STRING, description: "napr. todo/in_progress/done" },
            priority: { type: Type.STRING },
            due_date: { type: Type.STRING, description: "YYYY-MM-DD" },
            scheduled_time: { type: Type.STRING, description: "ISO 8601" },
          },
          required: ["id"],
        },
      },
      {
        name: "complete_task",
        description: "Označí úlohu ako dokončenú.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING, description: "ID úlohy (zisti cez get_tasks)." },
          },
          required: ["id"],
        },
      },
      {
        name: "delete_task",
        description:
          "Natrvalo zmaže úlohu. VŽDY si najprv nahlas over s používateľom, že to naozaj chce, a túto funkciu zavolaj až po jeho jasnom súhlase.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING, description: "ID úlohy (zisti cez get_tasks)." },
          },
          required: ["id"],
        },
      },
    ],
  },
];

export const TASK_TOOLS_SYSTEM_INSTRUCTION = `
Si Michalov osobný hlasový asistent (Denný agent), hovoríš po slovensky.
Máš nástroje na prácu s jeho úlohami (get_tasks, create_task, update_task,
complete_task, delete_task) — priamo nad jeho reálnymi dátami v Supabase.

Pravidlá:
- Keď sa používateľ spýta na svoje úlohy alebo plán v akejkoľvek podobe
  (dnes, zajtra, budúci týždeň, vo všeobecnosti "aké mám úlohy"...), VŽDY
  najprv zavolaj get_tasks a odpovedz iba na základe toho, čo skutočne
  vráti — nikdy si odpoveď nevymýšľaj ani nehádaj z pamäte rozhovoru.
- Keď potrebuješ ID konkrétnej úlohy (na úpravu, dokončenie alebo zmazanie)
  a ešte ho nemáš z tohto rozhovoru, najprv zavolaj get_tasks a nájdi
  správnu úlohu podľa názvu, o ktorom hovorí používateľ. Ak si nie si istý,
  ktorú úlohu myslí (viac podobných), spýtaj sa ho.
- delete_task je nevratné — pred jeho zavolaním sa VŽDY najprv nahlas
  spýtaj na potvrdenie ("Naozaj mám zmazať úlohu ...?") a zavolaj ho až po
  jasnom súhlase. Pri ostatných akciách (vytvorenie, úprava, dokončenie
  úlohy) sa pýtať netreba — sú to bežné vratné akcie.
- Po každej vykonanej akcii stručne nahlas potvrď výsledok (čo presne si
  urobil).
- Ak nie je jasné, či používateľ vydáva príkaz alebo len rozmýšľa nahlas,
  radšej sa krátko spýtaj, než aby si niečo vykonal omylom.
- Buď prirodzený, neformálny, stručný, občas vtipný. Nemoralizuj. Keď
  používateľ povie "nie", rešpektuj to a okamžite prestaň.
`.trim();

export async function runTaskTool(
  supabase: SupabaseClient,
  name: string,
  args: Record<string, any>
): Promise<{ result?: unknown; error?: string }> {
  try {
    switch (name) {
      case "get_tasks":
        return { result: await getTasks(supabase) };
      case "create_task":
        if (!args.title) return { error: "Chýba povinné pole 'title'." };
        return { result: await createTask(supabase, args as any) };
      case "update_task":
        if (!args.id) return { error: "Chýba povinné pole 'id'." };
        return { result: await updateTask(supabase, args as any) };
      case "complete_task":
        if (!args.id) return { error: "Chýba povinné pole 'id'." };
        return { result: await completeTask(supabase, args.id) };
      case "delete_task":
        if (!args.id) return { error: "Chýba povinné pole 'id'." };
        return { result: await deleteTask(supabase, args.id) };
      default:
        return { error: `Neznámy nástroj: ${name}` };
    }
  } catch (err: any) {
    console.error(`Chyba pri volaní nástroja ${name}:`, err);
    return { error: err?.message || "Neznáma chyba pri práci s databázou." };
  }
}
