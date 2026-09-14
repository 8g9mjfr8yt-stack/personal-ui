import type { SupabaseClient } from "@supabase/supabase-js";
import { Type, type Tool } from "@google/genai";
import {
  getInbox,
  getInboxItem,
  createInboxItem,
  markInboxProcessed,
} from "@/lib/supabase/inbox";
import { createTask } from "@/lib/supabase/tasks";
import { createNote } from "@/lib/supabase/notes";
import { createInspiration } from "@/lib/supabase/inspiration";
import { createProject } from "@/lib/supabase/projects";
import { createGoal } from "@/lib/supabase/goals";

// Inbox = rýchle zachytávanie bez nutnosti okamžite rozhodnúť, kam to patrí
// (PROJECT.md časť 5, "Capture first, organize later"). add_to_inbox je
// preto zámerne extrémne jednoduchý (iba text) — klasifikáciu rieši
// process_inbox samostatne, až keď sa k položke reálne pristúpi.
export const INBOX_TOOLS: Tool[] = [
  {
    functionDeclarations: [
      {
        name: "get_inbox",
        description: "Vráti nespracované položky Inboxu (čaká sa, kam patria).",
        parameters: { type: Type.OBJECT, properties: {} },
      },
      {
        name: "add_to_inbox",
        description:
          "Rýchlo pridá čokoľvek do Inboxu bez toho, aby si sa musel hneď rozhodnúť, kam to patrí. Použi, keď si používateľ nie je istý, či to má byť úloha, poznámka alebo niečo iné, alebo keď len chce niečo rýchlo zachytiť.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            content: { type: Type.STRING, description: "Text, ktorý sa má zachytiť." },
          },
          required: ["content"],
        },
      },
      {
        name: "process_inbox",
        description:
          "Spracuje položku Inboxu — vytvorí z nej skutočný záznam (úlohu, poznámku, inšpiráciu, projekt alebo cieľ) a označí pôvodnú položku ako spracovanú. Zavolaj get_inbox najprv, ak ešte nemáš ID položky. Zavolaj toto iba vtedy, keď používateľ jasne povie, čím sa má konkrétna položka stať — nerozhoduj o klasifikácii sám bez potvrdenia.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            id: {
              type: Type.STRING,
              description: "ID položky Inboxu (zisti cez get_inbox).",
            },
            processed_into: {
              type: Type.STRING,
              description: "Cieľový typ: task / note / inspiration / project / goal.",
            },
            title: {
              type: Type.STRING,
              description:
                "Voliteľný krátky názov pre cieľový záznam. Bez neho sa použije pôvodný text položky z Inboxu.",
            },
          },
          required: ["id", "processed_into"],
        },
      },
    ],
  },
];

export const INBOX_TOOL_NAMES = ["get_inbox", "add_to_inbox", "process_inbox"];

export const INBOX_TOOLS_SYSTEM_INSTRUCTION = `
Máš aj nástroje na Inbox (get_inbox, add_to_inbox, process_inbox). Keď si
používateľ nie je istý, kam niečo patrí, alebo len chce niečo rýchlo
zachytiť, použi add_to_inbox namiesto toho, aby si hádal správnu tabuľku.
process_inbox použi iba vtedy, keď používateľ jasne povie, čím sa má
konkrétna položka Inboxu stať (napr. "tú položku z Inboxu o CV spracuj ako
úlohu") — nerozhoduj o klasifikácii sám bez potvrdenia.
`.trim();

export async function runInboxTool(
  supabase: SupabaseClient,
  name: string,
  args: Record<string, any>
): Promise<{ result?: unknown; error?: string }> {
  try {
    switch (name) {
      case "get_inbox":
        return { result: await getInbox(supabase) };
      case "add_to_inbox":
        if (!args.content) return { error: "Chýba povinné pole 'content'." };
        return { result: await createInboxItem(supabase, args.content) };
      case "process_inbox": {
        if (!args.id) return { error: "Chýba povinné pole 'id'." };
        if (!args.processed_into)
          return { error: "Chýba povinné pole 'processed_into'." };
        const item = await getInboxItem(supabase, args.id);
        const text = args.title || item.content;
        let target: any;
        switch (args.processed_into) {
          case "task":
            target = await createTask(supabase, { title: text });
            break;
          case "note":
            target = await createNote(supabase, {
              content: item.content,
              title: args.title || null,
            });
            break;
          case "inspiration":
            target = await createInspiration(supabase, {
              title: args.title || null,
              why_saved: item.content,
            });
            break;
          case "project":
            target = await createProject(supabase, { name: text });
            break;
          case "goal":
            target = await createGoal(supabase, { title: text });
            break;
          default:
            return { error: `Neznámy cieľový typ: ${args.processed_into}` };
        }
        const updatedInbox = await markInboxProcessed(
          supabase,
          args.id,
          args.processed_into,
          target.id
        );
        return { result: { created: target, inbox: updatedInbox } };
      }
      default:
        return { error: `Neznámy nástroj: ${name}` };
    }
  } catch (err: any) {
    console.error(`Chyba pri volaní nástroja ${name}:`, err);
    return { error: err?.message || "Neznáma chyba pri práci s databázou." };
  }
}
