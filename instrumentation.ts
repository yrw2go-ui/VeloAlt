// 🧯 One stray rejection used to take the whole instance down with it (exit 128), and everything
// else that instance was serving went with it — a tab switch mid-flight just stopped, the app fell
// back to its loading screen, and a moment later a fresh instance answered as if nothing had
// happened. The usual culprit is a query cancelled by the database's statement timeout after the
// request that started it has already answered, so nobody is left waiting on it.
//
// Next calls register() once per server runtime, so this is where that net goes.
export function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  process.on("unhandledRejection", (why: unknown) => {
    console.error("unhandled rejection (kept running)", why instanceof Error ? why.message : why);
  });
}
