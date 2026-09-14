import type { SupabaseClient } from "@supabase/supabase-js";
import { Type, type Tool } from "@google/genai";
import {
  getProjects,
  createProject,
  updateProject,
} from "@/lib/supabase/projects";

export const PROJECT_TOOLS: Tool[] = [
  {
    functionDeclarations: [
      {
        name: "get_projects",
        description:
          "Vráti zoznam projektov používateľa (väčšie oblasti práce, napr. Denný agent, Dr. Max, hľadanie práce). Zavolaj toto, keď sa používateľ pýta na svoje projekty, alebo keď potrebuješ ID projektu.",
        parameters: { type: Type.OBJECT, properties: {} },
      },
      {
        name: "create_project",
        description: "Vytvorí nový projekt.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING, description: "Názov projektu." },
            description: { type: Type.STRING },
            priority: { type: Type.STRING, description: "napr. low/medium/high" },
            deadline: { type: Type.STRING, description: "YYYY-MM-DD" },
          },
          required: ["name"],
        },
      },
      {
        name: "update_project",
        description:
          "Čiastočne upraví existujúci projekt podľa ID. Pošli iba polia, ktoré sa naozaj majú zmeniť.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            id: {
              type: Type.STRING,
              description: "ID projektu (zisti cez get_projects).",
            },
            name: { type: Type.STRING },
            description: { type: Type.STRING },
            status: { type: Type.STRING, description: "napr. active/paused/done" },
            priority: { type: Type.STRING },
            deadline: { type: Type.STRING, description: "YYYY-MM-DD" },
          },
          required: ["id"],
        },
      },
    ],
  },
];

export const PROJECT_TOOL_NAMES = [
  "get_projects",
  "create_project",
  "update_project",
];

export const PROJECT_TOOLS_SYSTEM_INSTRUCTION = `
Máš aj nástroje na projekty (get_projects, create_project, update_project).
Projekt je väčšia oblasť práce, ku ktorej môžu patriť úlohy, poznámky a
inšpirácia. Keď potrebuješ ID projektu a nemáš ho z rozhovoru, najprv
zavolaj get_projects.
DÔLEŽITÉ: keď používateľ jasne povie "projekt" (napr. "ulož mi to ako
projekt", "toto je nový projekt"), zavolaj create_project — NIKDY nie
create_task, aj keby to znelo ako jedna konkrétna vec.
`.trim();

export async function runProjectTool(
  supabase: SupabaseClient,
  name: string,
  args: Record<string, any>
): Promise<{ result?: unknown; error?: string }> {
  try {
    switch (name) {
      case "get_projects":
        return { result: await getProjects(supabase) };
      case "create_project":
        if (!args.name) return { error: "Chýba povinné pole 'name'." };
        return { result: await createProject(supabase, args as any) };
      case "update_project":
        if (!args.id) return { error: "Chýba povinné pole 'id'." };
        return { result: await updateProject(supabase, args as any) };
      default:
        return { error: `Neznámy nástroj: ${name}` };
    }
  } catch (err: any) {
    console.error(`Chyba pri volaní nástroja ${name}:`, err);
    return { error: err?.message || "Neznáma chyba pri práci s databázou." };
  }
}
