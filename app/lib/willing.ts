// 🎲 How likely she is to say yes to being seen — a video chat, coming over, going out.
//
// Her mood and how she feels about them move it a little; being at work or in class moves it a lot.
// A present or some money in the last couple of days (see gifts.ts) moves the work case most of
// all: that's when she'll take a chance she normally wouldn't and slip away.

export function chanceOfYes(happy: number, love: number | null, busy: boolean, sore = 0, spoiled = 0): number {
  const base = busy ? 0.3 : 0.92; // at work or in class she usually can't; otherwise she's nearly always up for it
  const mood = (happy - 60) / 400 + (love === null ? 0 : (love - 50) / 500); // ±~0.2 in total
  // 💔 Still sore: a bit less up for things while it wears off. Never a wall — sweet talk still works.
  const hurt = sore * 0.08;
  // 🎁 A present in the last couple of days: she wants to see them, and she'll take the risk —
  // slipping out of work, skipping the class — far more readily than she usually would.
  const spoil = Math.max(0, Math.min(1, spoiled));
  const lift = spoil * (busy ? 0.42 : 0.06);
  const floor = busy ? 0.1 + spoil * 0.35 : 0.45 + spoil * 0.3;
  const ceiling = busy ? 0.55 + spoil * 0.4 : 0.98;
  return Math.max(floor, Math.min(ceiling, base + mood - hurt + lift));
}
