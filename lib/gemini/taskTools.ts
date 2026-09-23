import type { SupabaseClient } from "@supabase/supabase-js";
import { Type, type Tool } from "@google/genai";
import {
  getTasks,
  getSubtasksFor,
  createTask,
  updateTask,
  completeTask,
  deleteTask,
} from "@/lib/supabase/tasks";

// Function declarations pre Gemini Live function calling (Fáza 4.4 — fast
// path). Mená a polia kopírujú n8n tools z Fázy 3; rozdiel je iba v tom,
// že teraz ich agent volá priamo počas živého rozhovoru a vykonávajú sa
// ako priame Supabase volania z prehliadača (žiadny n8n v hot path).
//
// Denný agent 2.0 (redesign-2-0, 2026-09-23) — pridaná podpora podúloh
// (parent_task_id, migrácia 0004): get_tasks vie voliteľne vrátiť
// podúlohy konkrétnej rodičovskej úlohy namiesto top-level zoznamu,
// create_task vie novú úlohu rovno vytvoriť ako podúlohu, update_task
// vie úlohu preradiť pod inú (alebo z podúlohy urobiť späť top-level).
export const TASK_TOOLS: Tool[] = [
  {
    functionDeclarations: [
      {
        name: "get_tasks",
        description:
          "Vráti zoznam VŠETKÝCH nedokončených top-level úloh používateľa (vrátane due_date/start_date, depends_on_task_id, context a estimated_minutes), zoradených podľa termínu. Zavolaj toto VŽDY, keď sa používateľ opýta na svoje úlohy alebo plán (napr. \"čo mám dnes\", \"aké mám úlohy\", \"čo mám na budúci týždeň\", \"čo môžem urobiť teraz keď mám vrtačku/je pekný víkend\", alebo \"mám voľných 35 minút, čo sa tam zmestí\") — aj keď si nechce nič upraviť, iba sa pýta. Zavolaj toto aj vtedy, keď potrebuješ zistiť ID konkrétnej úlohy na jej úpravu, dokončenie, zmazanie, alebo ako depends_on_task_id/parent_task_id inej úlohy.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            parent_task_id: {
              type: Type.STRING,
              description:
                "Voliteľné. Ak vyplnené, namiesto top-level úloh vráti PODÚLOHY tejto konkrétnej rodičovskej úlohy. Najprv over ID rodičovskej úlohy bežným get_tasks bez tohto parametra.",
            },
          },
        },
      },
      {
        name: "create_task",
        description: "Vytvorí novú úlohu (voliteľne ako podúlohu inej úlohy).",
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
            start_date: {
              type: Type.STRING,
              description:
                "Voliteľný najskorší deň (YYYY-MM-DD), kedy sa má úloha robiť. Spolu s due_date vytvorí časové okno, napr. 'niekedy od utorka do piatka' → start_date=utorok, due_date=piatok.",
            },
            depends_on_task_id: {
              type: Type.STRING,
              description:
                "Voliteľné ID inej úlohy, ktorá musí byť hotová skôr, než táto dáva zmysel (zisti cez get_tasks). Použi pri následnosti typu 'toto spravím až po tom, čo dokončím X'.",
            },
            project_id: {
              type: Type.STRING,
              description:
                "Voliteľné ID projektu, ku ktorému táto úloha patrí (zisti cez get_projects podľa názvu, ktorý používateľ spomenul). Použi, keď používateľ povie, že úloha patrí k nejakému projektu.",
            },
            parent_task_id: {
              type: Type.STRING,
              description:
                "Voliteľné ID rodičovskej úlohy (zisti cez get_tasks). Ak vyplnené, táto úloha sa vytvorí ako PODÚLOHA danej úlohy, nie ako samostatná top-level úloha — použi, keď používateľ chce rozdeliť existujúcu úlohu na menšie kroky ('pridaj podúlohu k X', 'rozdeľ X na kroky').",
            },
            context: {
              type: Type.STRING,
              description:
                "Voliteľná voľná podmienka/spúšťač, ktorý nie je dátum (napr. 'keď si požičiam vŕtačku', 'keď bude pekný víkend'). Iba sa zapíše — automaticky sa nesleduje.",
            },
            estimated_minutes: {
              type: Type.NUMBER,
              description:
                "Voliteľný hrubý odhad trvania úlohy v minútach. Ak ho používateľ nepovie a je to bežná malá úloha, môžeš navrhnúť rozumný odhad sám (a spomenúť, že je to len odhad); ak si nie si istý, nechaj prázdne.",
            },
          },
          required: ["title"],
        },
      },
      {
        name: "update_task",
        description:
          "Čiastočne upraví existujúcu úlohu podľa jej ID (napr. presunie termín, zmení názov, prioritu, alebo ju preradí pod/spod inej úlohy ako podúlohu). Pošli iba polia, ktoré sa naozaj majú zmeniť — ostatné zostanú nezmenené.",
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
            start_date: {
              type: Type.STRING,
              description: "YYYY-MM-DD — najskorší deň, kedy sa má úloha robiť.",
            },
            depends_on_task_id: {
              type: Type.STRING,
              description: "ID úlohy, ktorá musí byť hotová skôr (zisti cez get_tasks).",
            },
            project_id: {
              type: Type.STRING,
              description:
                "ID projektu, ku ktorému táto úloha patrí (zisti cez get_projects). Pošli prázdny reťazec na odstránenie priradenia k projektu.",
            },
            parent_task_id: {
              type: Type.STRING,
              description:
                "ID rodičovskej úlohy (zisti cez get_tasks) — preradí túto úlohu ako podúlohu danej úlohy. Pošli prázdny reťazec na zrušenie vzťahu podúlohy (úloha sa stane samostatnou top-level úlohou).",
            },
            context: {
              type: Type.STRING,
              description: "Voľná podmienka/spúšťač, ktorý nie je dátum.",
            },
            estimated_minutes: {
              type: Type.NUMBER,
              description: "Hrubý odhad trvania úlohy v minútach.",
            },
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

export const TASK_TOOL_NAMES = [
  "get_tasks",
  "create_task",
  "update_task",
  "complete_task",
  "delete_task",
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
- Podúlohy: ak používateľ chce rozdeliť úlohu na menšie kroky, alebo
  povie "pridaj podúlohu k X", "rozdeľ X na kroky", najprv (ak ešte
  nemáš ID z rozhovoru) zavolaj get_tasks bez parametra a nájdi ID úlohy
  X, potom zavolaj create_task s parent_task_id=ID úlohy X. Ak sa
  používateľ pýta, aké podúlohy už nejaká úloha má, zavolaj get_tasks s
  parametrom parent_task_id=ID danej úlohy — podúlohy sa NIKDY
  nezobrazujú v bežnom zozname get_tasks bez tohto parametra. Preradiť
  existujúcu úlohu pod inú (alebo z podúlohy naspäť na top-level) sa dá
  cez update_task s poľom parent_task_id (prázdny reťazec = zrušiť
  vzťah podúlohy).
- Časové okno: ak používateľ povie rozsah ("niekedy od utorka do piatka",
  "tento týždeň"), použi start_date (najskôr) aj due_date (najneskôr)
  namiesto toho, aby si si vybral jeden náhodný deň. Ak povie iba jeden
  konkrétny deň/čas, stačí due_date (prípadne scheduled_time pre presný
  čas) — start_date nechaj prázdne.
- Následnosť: ak úloha dáva zmysel až po inej úlohe ("toto spravím až po
  tom, čo dokončím X"), zavolaj get_tasks, nájdi ID úlohy X a ulož ho ako
  depends_on_task_id. Takúto úlohu neponúkaj ako "na urobenie teraz", kým
  úloha, na ktorej závisí, ešte nie je hotová (t.j. stále sa objavuje v
  get_tasks).
- Fuzzy podmienky (nie dátum): ak používateľ opíše podmienku typu "keď si
  požičiam vŕtačku" alebo "keď bude pekný víkend", ulož ju do poľa context.
  Toto pole sa NESLEDUJE automaticky na pozadí — keď sa používateľ neskôr
  spýta "čo môžem teraz urobiť" a spomenie podobnú podmienku, prejdi
  zoznam z get_tasks a nájdi úlohy, ktorých context sedí.
- Odhad trvania: keď sa používateľ opýta, čo stihne za konkrétny voľný
  čas (napr. "mám voľných 35 minút, čo sa tam zmestí"), zavolaj get_tasks
  a porovnaj dostupný čas s estimated_minutes jednotlivých úloh — ponúkni
  tie, ktoré sa reálne zmestia. Ak úloha nemá estimated_minutes vyplnené,
  nehovor že sa nezmestí ani že sa zmestí — over sa alebo to úlohu spomeň
  s poznámkou, že trvanie nie je odhadnuté. Keď používateľ pri vytváraní
  úlohy sám povie, ako dlho mu to zaberie, ulož to do estimated_minutes.
- Priradenie k projektu: ak používateľ spomenie, že úloha patrí k
  nejakému projektu (napr. "toto je súčasť projektu X", "priraď to k
  projektu X"), zavolaj get_projects, nájdi správny projekt podľa názvu a
  ulož jeho ID do project_id (pri create_task alebo update_task). Ak si
  nie si istý, ktorý projekt myslí, spýtaj sa.
- DÔLEŽITÉ rozlíšenie Task vs. Project: create_task je iba pre konkrétnu,
  malú akciu (zavolať klientovi, poslať CV, pripraviť ponuku). Ak
  používateľ použije slovo "projekt" (napr. "ulož mi to ako projekt",
  "toto je nový projekt X"), alebo očividne opisuje väčšiu oblasť práce,
  ku ktorej môžu časom patriť viaceré úlohy, NIKDY to neukladaj cez
  create_task — zavolaj namiesto toho create_project.
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
        if (args?.parent_task_id) {
          return { result: await getSubtasksFor(supabase, [args.parent_task_id]) };
        }
        return { result: await getTasks(supabase) };
      case "create_task":
        if (!args.title) return { error: "Chýba povinné pole 'title'." };
        return { result: await createTask(supabase, args as any) };
      case "update_task": {
        if (!args.id) return { error: "Chýba povinné pole 'id'." };
        // Hlas posiela prázdny reťazec na "vyprázdni toto pole" (viď
        // popisy nástrojov) — updateTask() to zámerne neprevádza sám
        // (rozlišuje "neposlané" od "explicitne vyprázdnené"), takže tu
        // normalizujeme "" -> null iba pre uuid stĺpce, kde by prázdny
        // reťazec inak spôsobil chybu v DB.
        const normalized: Record<string, any> = { ...args };
        for (const key of ["project_id", "parent_task_id", "depends_on_task_id"]) {
          if (normalized[key] === "") normalized[key] = null;
        }
        return { result: await updateTask(supabase, normalized as any) };
      }
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
