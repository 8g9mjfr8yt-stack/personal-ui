import { createClient } from "@/lib/supabase/server";

function todayRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

export default async function TodayPage() {
  const supabase = createClient();
  const { start, end } = todayRange();

  const { data: tasks, error } = await supabase
    .from("tasks")
    .select("id, title, priority, due_date, scheduled_time")
    .gte("due_date", start)
    .lt("due_date", end)
    .is("completed_at", null)
    .order("scheduled_time", { ascending: true, nullsFirst: false });

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Dnes</h1>

      {error && (
        <p className="text-sm text-red-600">
          Chyba pri načítaní úloh: {error.message}
        </p>
      )}

      {!error && (!tasks || tasks.length === 0) && (
        <p className="text-neutral-500">
          Na dnes nemáš žiadne naplánované úlohy.
        </p>
      )}

      {tasks && tasks.length > 0 && (
        <ul className="space-y-2">
          {tasks.map((task) => (
            <li
              key={task.id}
              className="rounded-md border border-neutral-200 bg-white p-3"
            >
              <div className="font-medium">{task.title}</div>
              <div className="text-sm text-neutral-500">
                {task.scheduled_time
                  ? new Date(task.scheduled_time).toLocaleTimeString("sk-SK", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "bez času"}
                {task.priority ? ` · ${task.priority}` : ""}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
