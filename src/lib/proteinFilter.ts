type ExcludedReason =
  | "protein_bar"
  | "eaa"
  | "bcaa"
  | "other_supplement"
  | "not_protein_related"
  | "unknown";

function normalizeText(text: string) {
  return text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (s) =>
      String.fromCharCode(s.charCodeAt(0) - 0xfee0)
    );
}

export function detectExcludedReason(text: string): ExcludedReason | null {
  const t = normalizeText(text);

  if (t.includes("eaa")) return "eaa";
  if (t.includes("bcaa")) return "bcaa";

  if (
    t.includes("プロテインバー") ||
    t.includes("protein bar") ||
    t.includes("バータイプ") ||
    t.includes("bar")
  ) {
    return "protein_bar";
  }

  if (
    t.includes("クレアチン") ||
    t.includes("creatine") ||
    t.includes("マルチビタミン") ||
    t.includes("vitamin") ||
    t.includes("サプリメント") ||
    t.includes("supplement") ||
    t.includes("アミノ酸")
  ) {
    return "other_supplement";
  }

  // 注意書き・警告文（商品名でない）を除外
  if (
    t.includes("タンパク質不足に注意") ||
    (t.includes("に注意") && !t.includes("プロテイン") && t.length < 80)
  ) {
    return "not_protein_related";
  }

  return null;
}