-- 📊 What the AI is being asked, by day: one row per day, feature and model. Counts only — no words.
create table if not exists llm_usage (
  day date not null default current_date,
  source text not null,
  model text not null,
  calls int not null default 0,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  primary key (day, source, model)
);
