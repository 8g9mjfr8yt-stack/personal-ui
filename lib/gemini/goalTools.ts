import type { SupabaseClient } from "@supabase/supabase-js";
import { Type, type Tool } from "@google/genai";
import { getGoals, createGoal } from "@/lib/supabase/goals";

export const GOAL_TOOLS: Tool[] = [
  {
    functionDeclarations: [
      {
        name: "get_goals",
        description:
          "Vráti dlhodobé ciele používateľa (napr. nájsť novú prácu, vybudovať Denného agenta). Goal = kam smerujem, na rozdiel od Task = čo konkrétne urobím.",
        parameters: { type: Type.OBJECT, properties: {} },
      },
      {
        name: "create_goal",
        description: "Vytvorí nový dlhodobý cieľ.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING, description: "Názov cieľa." },
            description: { type: Type.STRING },
          },
          required: ["title"],
        },
      },
    ],
  },
];

export const GOAL_TOOL_NAMES = ["get_goals", "create_goal"];

export const GOAL_TOOLS_SYSTEM_INSTRUCTION = `
Máš aj nástroje na dlhodobé ciele (get_goals, create_goal). Goal je vyššia
úroveň než Project/Task — nezamieňaj si ich; cieľ vytváraj, len keď
používateľ jasne hovorí o dlhodobom smerovaní, nie o konkrétnej úlohe.
`.trim();

export async function runGoalTool(
  supabase: SupabaseClient,
  name: string,
  args: Record<string, any>
): Promise<{ result?: unknown; error?: string }> {
  try {
    switch (name) {
      case "get_goals":
        return { result: await getGoals(supabase) };
      case "create_goal":
        if (!args.title) return { error: "Chýba povinné pole 'title'." };
        return { result: await createGoal(supabase, args as any) };
      default:
        return { error: `Neznámy nástroj: ${name}` };
    }
  } catch (err: any) {
    console.error(`Chyba pri volaní nástroja ${name}:`, err);
    return { error: err?.message || "Neznáma chyba pri práci s databázou." };
  }
}
