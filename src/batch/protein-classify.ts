// Load .env.local then .env for local. Ignore if dotenv not installed (e.g. Cloud Run).
try {
  // @ts-ignore - optional; run: npm install dotenv
  require("dotenv").config({ path: ".env.local" });
  require("dotenv").config();
} catch {
  /* use process.env */
}
import { classifyProtein } from "../lib/classifyProtein";
import {
  fetchPendingSourceTexts,
  saveClassificationResult,
  updateSourceStatus,
} from "../lib/batchDb";

const BATCH_LIMIT = 50;

async function main() {
  for (;;) {
    const pending = await fetchPendingSourceTexts(BATCH_LIMIT);

    if (pending.length === 0) {
      console.log("No pending source texts. Exiting.");
      break;
    }

    console.log(`Processing ${pending.length} pending source text(s).`);

    for (const row of pending) {
      try {
        const result = await classifyProtein(row.raw_text);
        await saveClassificationResult(row.id, result);

        const status = result.is_protein_powder ? "processed" : "excluded";
        await updateSourceStatus(row.id, status);
        console.log(`[OK] ${row.id} -> ${status}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await updateSourceStatus(row.id, "error", message);
        console.error(`[ERROR] ${row.id}: ${message}`);
      }
    }
  }

  console.log("Batch finished.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
