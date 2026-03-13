'use client'

import { useEffect, useState } from "react"
import Link from "next/link"
import { supabase } from "../../lib/supabase"

type ManufacturerStat = {
  manufacturer: string
  flavor_count: number
}

export default function ManufacturersPage() {
  const [stats, setStats] = useState<ManufacturerStat[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError(null)
      const { data, error } = await supabase
        .from("product_classification_results")
        .select("manufacturer")
        .eq("is_protein_powder", true)

      if (error) {
        console.error(error)
        setError("メーカー一覧の取得でエラーが発生しました")
        setLoading(false)
        return
      }

      const counts = new Map<string, number>()
      for (const row of (data ?? []) as { manufacturer: string | null }[]) {
        const name = (row.manufacturer ?? "").trim()
        if (!name) continue
        counts.set(name, (counts.get(name) ?? 0) + 1)
      }

      const result: ManufacturerStat[] = Array.from(counts.entries())
        .map(([manufacturer, flavor_count]) => ({
          manufacturer,
          flavor_count,
        }))
        .sort((a, b) => b.flavor_count - a.flavor_count || a.manufacturer.localeCompare(b.manufacturer, "ja"))

      setStats(result)
      setLoading(false)
    }

    void load()
  }, [])

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900">
      {/* ヘッダー（詳細ページと同テイスト） */}
      <header className="fixed inset-x-0 top-0 z-30 w-full bg-[#1F2A44] text-white shadow-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Link href="/" className="text-xs font-semibold tracking-[0.18em] text-teal-200">
              PROTEIN LOG
            </Link>
            <span className="hidden text-[11px] text-slate-200/80 sm:inline">
              登録メーカー一覧
            </span>
          </div>
          <Link
            href="/"
            className="rounded-full border border-slate-500/60 bg-[#0F172A] px-3 py-1 text-[11px] text-slate-100 hover:border-teal-300"
          >
            トップページに戻る
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-12 pt-20 sm:pt-24">
        <section className="mb-6">
          <h1 className="text-lg font-semibold tracking-tight text-[#0F172A]">
            登録メーカー一覧
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            データベースに登録されているメーカーごとに、フレーバー登録件数を集計しています。
          </p>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          {loading && (
            <p className="text-xs text-slate-400">読み込み中です…</p>
          )}
          {error && (
            <p className="text-xs text-rose-500">{error}</p>
          )}
          {!loading && !error && stats.length === 0 && (
            <p className="text-xs text-slate-400">
              まだメーカー情報が登録されていません。
            </p>
          )}
          {!loading && !error && stats.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-slate-100">
              <table className="min-w-full divide-y divide-slate-100 text-[11px]">
                <thead className="bg-slate-50/80">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600">
                      メーカー名
                    </th>
                    <th className="px-3 py-2 text-right font-semibold text-slate-600">
                      フレーバー登録件数
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 bg-white">
                  {stats.map((m) => (
                    <tr key={m.manufacturer} className="hover:bg-slate-50">
                      <td className="px-3 py-2 text-slate-800">
                        {m.manufacturer}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-700">
                        {m.flavor_count.toLocaleString()} 件
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      {/* フッター（詳細ページと同テイスト） */}
      <footer className="mt-12 border-t border-slate-200 bg-[#0F172A] text-slate-100">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6 text-xs text-slate-300">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="text-[11px] font-semibold tracking-[0.18em] text-teal-200">
                PROTEIN LOG
              </p>
              <p className="text-[11px] text-slate-300">
                口コミとデータで比較できるプロテイン専用レビューサービス
              </p>
            </div>
            <div className="flex flex-wrap gap-3 text-[11px] text-slate-300">
              <Link href="/" className="hover:text-slate-50">
                トップページ
              </Link>
            </div>
          </div>
          <div className="text-[10px] text-slate-400">
            &copy; {new Date().getFullYear()} Protein Log
          </div>
        </div>
      </footer>
    </div>
  )
}

