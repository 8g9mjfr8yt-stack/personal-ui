// v2.2 — mapovanie mien nástrojov na funkcie, ktoré ich vykonajú (prehliadač).
import { TASK_V2_TOOL_NAMES, runTaskToolV2 } from "@/lib/gemini/taskToolsV2";
import { NOTEBOOK_TOOL_NAMES, runNotebookTool } from "@/lib/gemini/notebookTools";
import { MEMORY_TOOL_NAMES, runMemoryTool } from "@/lib/gemini/memoryTools";
import { PROJECT_TOOL_NAMES, runProjectTool } from "@/lib/gemini/projectTools";
import { GOAL_TOOL_NAMES, runGoalTool } from "@/lib/gemini/goalTools";
import { DAILY_LOG_TOOL_NAMES, runDailyLogTool } from "@/lib/gemini/dailyLogTools";
import { CALENDAR_TOOL_NAMES, runCalendarTool } from "@/lib/gemini/calendarTools";

type Runner = (supabase: any, name: string, args: Record<string, any>) => Promise<{ result?: unknown; error?: string }>;

const TOOL_RUNNERS: Array<{ names: string[]; run: Runner }> = [
  { names: TASK_V2_TOOL_NAMES, run: runTaskToolV2 },
  { names: NOTEBOOK_TOOL_NAMES, run: runNotebookTool },
  { names: CALENDAR_TOOL_NAMES, run: runCalendarTool },
  { names: PROJECT_TOOL_NAMES, run: runProjectTool },
  { names: GOAL_TOOL_NAMES, run: runGoalTool },
  { names: MEMORY_TOOL_NAMES, run: runMemoryTool },
  { names: DAILY_LOG_TOOL_NAMES, run: runDailyLogTool },
];

export function findToolRunner(name: string): Runner | undefined {
  return TOOL_RUNNERS.find((r) => r.names.includes(name))?.run;
}
