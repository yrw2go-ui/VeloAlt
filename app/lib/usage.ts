// 📊 A running tally of what the AI is asked and how much it reads and writes, so Settings can say
// where the spend goes. It counts, never records words, and can never get in the way: a missing
// table or a slow write is simply ignored.
import { sql } from "./db";

export function noteUse(source: string, model: string, input = 0, output = 0): void {
  try {
    void sql()`insert into llm_usage (day, source, model, calls, input_tokens, output_tokens)
      values (current_date, ${source.slice(0, 60)}, ${String(model || "?").slice(0, 80)}, 1, ${Math.round(input) || 0}, ${Math.round(output) || 0})
      on conflict (day, source, model) do update set calls = llm_usage.calls + 1,
        input_tokens = llm_usage.input_tokens + excluded.input_tokens, output_tokens = llm_usage.output_tokens + excluded.output_tokens`
      .catch(() => {});
  } catch { /* counting never breaks anything */ }
}
