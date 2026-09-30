// v2.2 — JEDINÝ zoznam nástrojov a systémovej inštrukcie hlasového agenta.
// Používa ho server (app/api/gemini-token — zamknuté v ephemeral tokene) aj
// prehliadač (lib/voice/VoiceAgentContext) — musia byť zhodné (PROJECT.md 23,
// bug 4.4), preto sú na jednom mieste. Vykonávanie (runnery) je v
// lib/voice/toolRunners.ts, aby server nemusel načítať klientsky kód.
import type { Tool } from "@google/genai";
import { TASK_V2_TOOLS, TASK_V2_SYSTEM_INSTRUCTION } from "@/lib/gemini/taskToolsV2";
import { NOTEBOOK_TOOLS, NOTEBOOK_SYSTEM_INSTRUCTION } from "@/lib/gemini/notebookTools";
import { MEMORY_TOOLS, MEMORY_SYSTEM_INSTRUCTION } from "@/lib/gemini/memoryTools";
import { PROJECT_TOOLS, PROJECT_TOOLS_SYSTEM_INSTRUCTION } from "@/lib/gemini/projectTools";
import { GOAL_TOOLS, GOAL_TOOLS_SYSTEM_INSTRUCTION } from "@/lib/gemini/goalTools";
import { DAILY_LOG_TOOLS, DAILY_LOG_TOOLS_SYSTEM_INSTRUCTION } from "@/lib/gemini/dailyLogTools";
import { CALENDAR_TOOLS, CALENDAR_TOOLS_SYSTEM_INSTRUCTION } from "@/lib/gemini/calendarTools";

export const ALL_TOOLS: Tool[] = [
  ...TASK_V2_TOOLS,
  ...NOTEBOOK_TOOLS,
  ...CALENDAR_TOOLS,
  ...PROJECT_TOOLS,
  ...GOAL_TOOLS,
  ...MEMORY_TOOLS,
  ...DAILY_LOG_TOOLS,
];

export function buildSystemInstruction(timeContext: string): string {
  return [
    timeContext,
    TASK_V2_SYSTEM_INSTRUCTION,
    NOTEBOOK_SYSTEM_INSTRUCTION,
    CALENDAR_TOOLS_SYSTEM_INSTRUCTION,
    PROJECT_TOOLS_SYSTEM_INSTRUCTION,
    GOAL_TOOLS_SYSTEM_INSTRUCTION,
    MEMORY_SYSTEM_INSTRUCTION,
    DAILY_LOG_TOOLS_SYSTEM_INSTRUCTION,
  ]
    .filter(Boolean)
    .join("\n\n");
}
