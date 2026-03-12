import { classifyProtein } from "./src/lib/classifyProtein";

async function main() {
  const result = await classifyProtein(`
    VALX EAA9
    シトラス風味
    必須アミノ酸サプリメント
    30食分
  `);

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});