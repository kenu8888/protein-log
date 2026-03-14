from __future__ import annotations

import os
import re
import sys
import time
import json
import random
from dataclasses import dataclass, asdict
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Iterable, Optional
from urllib.parse import urlencode, urljoin, urlparse, parse_qs

from dotenv import load_dotenv
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError
from supabase import create_client, Client


BASE_URL = "https://www.amazon.co.jp"
SEARCH_PATH = "/s"

# このファイルが app/api/ 以下にある前提でプロジェクトルートを算出
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
ENV_PATHS = [
    PROJECT_ROOT / ".env.local",
    Path.cwd() / ".env.local",
    Path.cwd() / ".env",
]

for env_path in ENV_PATHS:
    if env_path.exists():
        load_dotenv(env_path, override=False)


@dataclass
class ProductSeed:
    asin: str
    source_url: str
    title: str = ""
    brand: str = ""
    image_url: str = ""
    price: str = ""
    price_value: Optional[float] = None
    rating: Optional[float] = None


@dataclass
class ScrapedProductRow:
    asin: str
    title: str
    brand: Optional[str]
    image_url: Optional[str]
    price: Optional[str]
    price_value: Optional[float]
    availability_raw: Optional[str]
    is_available: Optional[bool]
    net_weight_kg: Optional[float]
    price_per_kg: Optional[float]
    rating: Optional[float]
    source_url: str

    manufacturer: Optional[str] = None
    flavor: Optional[str] = None
    calories: Optional[float] = None
    protein_g: Optional[float] = None
    carbs_g: Optional[float] = None
    fat_g: Optional[float] = None
    nutrition_basis_raw: Optional[str] = None
    nutrition_raw_text: Optional[str] = None
    net_weight_raw: Optional[str] = None


def random_sleep(min_sec: float = 1.0, max_sec: float = 2.0) -> None:
    time.sleep(random.uniform(min_sec, max_sec))


def build_search_url(keyword: str, page: int = 1) -> str:
    return f"{BASE_URL}{SEARCH_PATH}?{urlencode({'k': keyword, 'page': page})}"


def extract_asin_from_url(url: str) -> str:
    parts = [p for p in urlparse(url).path.split("/") if p]
    for i, part in enumerate(parts):
        if part in {"dp", "product"} and i + 1 < len(parts):
            candidate = parts[i + 1]
            if len(candidate) == 10:
                return candidate

    qs = parse_qs(urlparse(url).query)
    if "asin" in qs and qs["asin"]:
        return qs["asin"][0]

    return ""


def normalize_product_url(url: str) -> str:
    asin = extract_asin_from_url(url)
    if asin:
        return f"{BASE_URL}/dp/{asin}"
    return url.split("?", 1)[0]


def sanitize_filename(value: str) -> str:
    return re.sub(r'[\\/:*?"<>|]+', "_", value)[:120]


def text_or_empty(locator) -> str:
    try:
        if locator.count() > 0:
            return locator.first.inner_text().strip()
    except Exception:
        pass
    return ""


def attr_or_empty(locator, name: str) -> str:
    try:
        if locator.count() > 0:
            return (locator.first.get_attribute(name) or "").strip()
    except Exception:
        pass
    return ""


def parse_price_value(price_text: str) -> Optional[float]:
    if not price_text:
        return None
    cleaned = re.sub(r"[^\d.]", "", price_text)
    if not cleaned:
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


def parse_rating_value(rating_text: str) -> Optional[float]:
    if not rating_text:
        return None
    m = re.search(r"(\d+(?:\.\d+)?)", rating_text)
    if not m:
        return None
    try:
        return float(m.group(1))
    except ValueError:
        return None


def parse_net_weight_kg(text: str) -> tuple[Optional[float], Optional[str]]:
    if not text:
        return None, None

    normalized = (
        text.replace("Ｋｇ", "kg")
        .replace("ｋｇ", "kg")
        .replace("㎏", "kg")
        .replace("ｇ", "g")
    )

    patterns = [
        (r"(\d+(?:\.\d+)?)\s*kg", 1.0),
        (r"(\d+(?:\.\d+)?)\s*g\b", 0.001),
        (r"(\d+(?:\.\d+)?)\s*kg×\s*(\d+)", None),
        (r"(\d+(?:\.\d+)?)\s*g×\s*(\d+)", None),
    ]

    for pattern, factor in patterns:
        m = re.search(pattern, normalized, flags=re.IGNORECASE)
        if not m:
            continue

        if "×" in pattern:
            try:
                base = float(m.group(1))
                count = int(m.group(2))
                if "kg" in pattern.lower():
                    return round(base * count, 4), f"{base}kg×{count}"
                return round(base * count * 0.001, 4), f"{base}g×{count}"
            except ValueError:
                continue

        try:
            value = float(m.group(1))
            kg = value * factor
            return round(kg, 4), m.group(0)
        except ValueError:
            continue

    return None, None


def safe_decimal_div(numerator: Optional[float], denominator: Optional[float]) -> Optional[float]:
    if numerator is None or denominator is None or denominator <= 0:
        return None
    try:
        return round(float(Decimal(str(numerator)) / Decimal(str(denominator))), 2)
    except (InvalidOperation, ZeroDivisionError):
        return None


def extract_flavor(text: str) -> Optional[str]:
    if not text:
        return None

    candidates = [
        ("リッチチョコレート", "チョコレート"),
        ("チョコレート", "チョコレート"),
        ("ココア", "ココア"),
        ("バニラ", "バニラ"),
        ("抹茶", "抹茶"),
        ("ストロベリー", "ストロベリー"),
        ("いちご", "ストロベリー"),
        ("バナナ", "バナナ"),
        ("ミルクティー", "ミルクティー"),
        ("カフェオレ", "カフェオレ"),
        ("キャラメル", "キャラメル"),
        ("ヨーグルト", "ヨーグルト"),
        ("レモン", "レモン"),
        ("ピーチ", "ピーチ"),
        ("マンゴー", "マンゴー"),
        ("グレープ", "グレープ"),
        ("フルーツミックス", "フルーツミックス"),
        ("クッキー&クリーム", "クッキー&クリーム"),
        ("cookies & cream", "クッキー&クリーム"),
        ("ミルク", "ミルク"),
    ]

    lower = text.lower()
    for raw, normalized in candidates:
        if raw.lower() in lower:
            return normalized
    return None


def extract_nutrition_values(text: str) -> dict[str, Optional[float | str]]:
    if not text:
        return {
            "calories": None,
            "protein_g": None,
            "carbs_g": None,
            "fat_g": None,
            "nutrition_basis_raw": None,
            "nutrition_raw_text": None,
        }

    compact = re.sub(r"[ \t]+", " ", text)
    compact = compact.replace("エネルギー", "カロリー").replace("たんぱく", "タンパク").replace("蛋白", "タンパク")

    basis_match = re.search(
        r"((?:1食|一食|100g|100ml|30g|35g|40g|付属スプーン.*?|1回分).*?あたり)",
        compact,
        flags=re.IGNORECASE,
    )
    nutrition_basis_raw = basis_match.group(1) if basis_match else None

    def find_num(patterns: list[str]) -> Optional[float]:
        for p in patterns:
            m = re.search(p, compact, flags=re.IGNORECASE)
            if m:
                try:
                    return float(m.group(1))
                except ValueError:
                    continue
        return None

    calories = find_num([
        r"カロリー\s*[:：]?\s*(\d+(?:\.\d+)?)\s*kcal",
        r"エネルギー\s*[:：]?\s*(\d+(?:\.\d+)?)\s*kcal",
    ])
    protein_g = find_num([
        r"タンパク質\s*[:：]?\s*(\d+(?:\.\d+)?)\s*g",
        r"たんぱく質\s*[:：]?\s*(\d+(?:\.\d+)?)\s*g",
    ])
    carbs_g = find_num([
        r"炭水化物\s*[:：]?\s*(\d+(?:\.\d+)?)\s*g",
    ])
    fat_g = find_num([
        r"脂質\s*[:：]?\s*(\d+(?:\.\d+)?)\s*g",
    ])

    found_any = any(v is not None for v in [calories, protein_g, carbs_g, fat_g])
    return {
        "calories": calories,
        "protein_g": protein_g,
        "carbs_g": carbs_g,
        "fat_g": fat_g,
        "nutrition_basis_raw": nutrition_basis_raw,
        "nutrition_raw_text": compact if found_any else None,
    }


def accept_cookie_if_present(page) -> None:
    for selector in [
        'input[name="accept"]',
        '#sp-cc-accept',
        'input[data-testid="sp-cc-accept"]',
    ]:
        try:
            loc = page.locator(selector)
            if loc.count() > 0 and loc.first.is_visible():
                loc.first.click(timeout=2000)
                random_sleep(0.3, 0.8)
                return
        except Exception:
            pass


def extract_seeds_from_search_page(page) -> list[ProductSeed]:
    seeds: list[ProductSeed] = []
    seen_asins: set[str] = set()

    items = page.locator('div[data-component-type="s-search-result"]')
    count = items.count()

    for i in range(count):
        try:
            item = items.nth(i)
            asin = (item.get_attribute("data-asin") or "").strip()
            if not asin or len(asin) != 10 or asin in seen_asins:
                continue

            link = item.locator('a[href*="/dp/"], a[href*="/gp/product/"]').first
            href = link.get_attribute("href")
            if not href:
                continue

            source_url = normalize_product_url(urljoin(BASE_URL, href))

            title = ""
            for sel in ["h2 span", "h2 a span", '[data-cy="title-recipe"]']:
                title = text_or_empty(item.locator(sel))
                if title:
                    break

            image_url = ""
            for sel in ["img.s-image", "img"]:
                image_url = attr_or_empty(item.locator(sel), "src")
                if image_url:
                    break

            price_text = ""
            for sel in [
                "span.a-price span.a-offscreen",
                "span.a-price-whole",
            ]:
                price_text = text_or_empty(item.locator(sel))
                if price_text:
                    break

            brand = ""
            for sel in [
                "h5.s-line-clamp-1 span",
                "span.a-size-base-plus.a-color-base",
            ]:
                brand = text_or_empty(item.locator(sel))
                if brand:
                    break

            rating = None
            rating_text = ""
            for sel in [
                "span.a-icon-alt",
                "i.a-icon-star-small span",
            ]:
                rating_text = text_or_empty(item.locator(sel))
                if rating_text:
                    rating = parse_rating_value(rating_text)
                    break

            seeds.append(
                ProductSeed(
                    asin=asin,
                    source_url=source_url,
                    title=title,
                    brand=brand or "",
                    image_url=image_url or "",
                    price=price_text or "",
                    price_value=parse_price_value(price_text),
                    rating=rating,
                )
            )
            seen_asins.add(asin)
        except Exception:
            continue

    return seeds


def search_products(page, keyword: str, max_pages: int) -> list[ProductSeed]:
    all_seeds: list[ProductSeed] = []
    seen_asins: set[str] = set()

    for page_num in range(1, max_pages + 1):
        url = build_search_url(keyword, page=page_num)
        page.goto(url, wait_until="domcontentloaded", timeout=30000)
        random_sleep()
        accept_cookie_if_present(page)

        page_seeds = extract_seeds_from_search_page(page)
        added = 0
        for seed in page_seeds:
            if seed.asin in seen_asins:
                continue
            seen_asins.add(seed.asin)
            all_seeds.append(seed)
            added += 1

        print(f"[INFO] search page={page_num} added={added} total={len(all_seeds)}")

    return all_seeds


def extract_key_value_table(page) -> dict[str, str]:
    data: dict[str, str] = {}

    row_groups = [
        page.locator("#productDetails_techSpec_section_1 tr"),
        page.locator("#productDetails_detailBullets_sections1 tr"),
        page.locator("#technicalSpecifications_section_1 tr"),
    ]

    for rows in row_groups:
        try:
            count = rows.count()
            for i in range(count):
                row = rows.nth(i)
                key = text_or_empty(row.locator("th"))
                value = text_or_empty(row.locator("td"))
                if key and value:
                    data[key] = value
        except Exception:
            pass

    lis = page.locator("#detailBullets_feature_div li")
    try:
        count = lis.count()
        for i in range(count):
            li = lis.nth(i)
            key = text_or_empty(li.locator("span.a-text-bold"))
            text = text_or_empty(li)
            if key and text:
                value = text.replace(key, "", 1).strip(" :：")
                data[key.strip(" :：")] = value
    except Exception:
        pass

    return data


def detect_availability(text: str) -> tuple[Optional[str], Optional[bool]]:
    if not text:
        return None, None

    lowered = text.lower()
    if "在庫あり" in text or "通常" in text or "残り" in text:
        return text, True
    if "currently unavailable" in lowered or "在庫切れ" in text or "一時的に在庫切れ" in text:
        return text, False
    return text, None


def extract_product_details(page, seed: ProductSeed) -> ScrapedProductRow:
    page.goto(seed.source_url, wait_until="domcontentloaded", timeout=30000)
    random_sleep()
    accept_cookie_if_present(page)

    title = ""
    for sel in ["#productTitle", "span#productTitle", "h1 span"]:
        title = text_or_empty(page.locator(sel))
        if title:
            break
    if not title:
        title = seed.title

    image_url = ""
    for sel in [
        "#landingImage",
        "#imgTagWrapperId img",
        "img#imgBlkFront",
    ]:
        image_url = attr_or_empty(page.locator(sel), "src")
        if image_url:
            break
    if not image_url:
        image_url = seed.image_url

    price_text = ""
    for sel in [
        "span.a-price.aok-align-center span.a-offscreen",
        "span.a-price span.a-offscreen",
        "#corePriceDisplay_desktop_feature_div span.a-offscreen",
        "#priceblock_ourprice",
        "#priceblock_dealprice",
    ]:
        price_text = text_or_empty(page.locator(sel))
        if price_text:
            break
    if not price_text:
        price_text = seed.price

    price_value = parse_price_value(price_text) if price_text else seed.price_value

    rating_text = ""
    for sel in [
        "#acrPopover span.a-size-base.a-color-base",
        "span.a-icon-alt",
    ]:
        rating_text = text_or_empty(page.locator(sel))
        if rating_text:
            break
    rating = parse_rating_value(rating_text) if rating_text else seed.rating

    brand = ""
    for sel in [
        "#bylineInfo",
        "#bylineInfo_feature_div a",
    ]:
        brand = text_or_empty(page.locator(sel))
        if brand:
            break
    brand = re.sub(r"^(ブランド|Brand)\s*[:：]?\s*", "", brand).strip() if brand else seed.brand

    availability_text = ""
    for sel in [
        "#availability span",
        "#availability",
    ]:
        availability_text = text_or_empty(page.locator(sel))
        if availability_text:
            break
    availability_raw, is_available = detect_availability(availability_text)

    table = extract_key_value_table(page)

    manufacturer = (
        table.get("メーカー")
        or table.get("Brand")
        or table.get("ブランド")
        or None
    )

    flavor = (
        table.get("風味")
        or table.get("Flavor")
        or extract_flavor(title)
        or extract_flavor(" ".join(table.values()))
    )

    net_weight_source = " ".join(
        [
            title or "",
            table.get("内容量", ""),
            table.get("商品の重量", ""),
            table.get("梱包サイズ", ""),
            text_or_empty(page.locator("#feature-bullets")),
        ]
    )
    net_weight_kg, net_weight_raw = parse_net_weight_kg(net_weight_source)

    page_text_candidates = [
        title or "",
        text_or_empty(page.locator("#feature-bullets")),
        text_or_empty(page.locator("#productDescription")),
        text_or_empty(page.locator("#aplus")),
        " ".join(f"{k}: {v}" for k, v in table.items()),
    ]
    page_text_for_nutrition = "\n".join([t for t in page_text_candidates if t])

    nutrition = extract_nutrition_values(page_text_for_nutrition)

    source_url = normalize_product_url(seed.source_url)
    price_per_kg = safe_decimal_div(price_value, net_weight_kg)

    return ScrapedProductRow(
        asin=seed.asin,
        title=title or seed.title or "",
        brand=brand or seed.brand or None,
        image_url=image_url or seed.image_url or None,
        price=price_text or seed.price or None,
        price_value=price_value,
        availability_raw=availability_raw,
        is_available=is_available,
        net_weight_kg=net_weight_kg,
        price_per_kg=price_per_kg,
        rating=rating,
        source_url=source_url,
        manufacturer=manufacturer,
        flavor=flavor,
        calories=nutrition["calories"],
        protein_g=nutrition["protein_g"],
        carbs_g=nutrition["carbs_g"],
        fat_g=nutrition["fat_g"],
        nutrition_basis_raw=nutrition["nutrition_basis_raw"],
        nutrition_raw_text=nutrition["nutrition_raw_text"],
        net_weight_raw=net_weight_raw,
    )


def merge_rows(rows: list[ScrapedProductRow]) -> list[ScrapedProductRow]:
    merged: dict[str, ScrapedProductRow] = {}

    for row in rows:
        if row.asin not in merged:
            merged[row.asin] = row
            continue

        existing = merged[row.asin]
        for field_name, value in asdict(row).items():
            current = getattr(existing, field_name)
            if current in (None, "", 0) and value not in (None, "", 0):
                setattr(existing, field_name, value)

    return list(merged.values())


# 現行 scraped_products テーブルに存在するカラムのみ upsert する（拡張カラムは migration 適用後に利用）
SCRAPED_PRODUCTS_CORE_COLUMNS = frozenset({
    "asin", "title", "brand", "image_url", "price", "price_value",
    "availability_raw", "is_available", "net_weight_kg", "price_per_kg",
    "rating", "source_url",
})
# 拡張カラム（migration で追加後、ここに列名を足すと payload に含める）
SCRAPED_PRODUCTS_EXTENDED_COLUMNS = frozenset({
    "manufacturer", "flavor", "calories", "protein_g", "carbs_g", "fat_g",
    "nutrition_basis_raw", "nutrition_raw_text", "net_weight_raw",
})


def to_supabase_payload(
    row: ScrapedProductRow,
    *,
    use_extended_columns: bool = False,
) -> dict:
    """scraped_products に upsert する payload を組み立てる。"""
    payload: dict = {
        "asin": row.asin,
        "title": row.title,
        "brand": row.brand,
        "image_url": row.image_url,
        "price": row.price,
        "price_value": row.price_value,
        "availability_raw": row.availability_raw,
        "is_available": row.is_available,
        "net_weight_kg": row.net_weight_kg,
        "price_per_kg": row.price_per_kg,
        "rating": row.rating,
        "source_url": row.source_url,
    }
    allowed = SCRAPED_PRODUCTS_CORE_COLUMNS
    if use_extended_columns:
        allowed = allowed | SCRAPED_PRODUCTS_EXTENDED_COLUMNS
        payload["manufacturer"] = row.manufacturer
        payload["flavor"] = row.flavor
        payload["calories"] = row.calories
        payload["protein_g"] = row.protein_g
        payload["carbs_g"] = row.carbs_g
        payload["fat_g"] = row.fat_g
        payload["nutrition_basis_raw"] = row.nutrition_basis_raw
        payload["nutrition_raw_text"] = row.nutrition_raw_text
        payload["net_weight_raw"] = row.net_weight_raw
    # 現行テーブルにないキーは送らない（Supabase が「列なし」エラーを出さないように）
    return {k: v for k, v in payload.items() if k in allowed}


def init_supabase() -> Client:
    url = (
        os.environ.get("SUPABASE_URL")
        or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    )

    key = (
        os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        or os.environ.get("SUPABASE_SECRET_KEY")
    )

    if not url:
        raise RuntimeError("SUPABASE_URL または NEXT_PUBLIC_SUPABASE_URL が見つかりません。")

    if not key:
        raise RuntimeError(
            "SUPABASE_SERVICE_ROLE_KEY または SUPABASE_SECRET_KEY が見つかりません。"
        )

    return create_client(url, key)


def upsert_scraped_products(supabase: Client, rows: list[ScrapedProductRow]) -> None:
    if not rows:
        return

    use_extended = os.environ.get("AMAZON_SYNC_USE_EXTENDED_COLUMNS", "").strip() in ("1", "true", "yes")
    payloads = [to_supabase_payload(row, use_extended_columns=use_extended) for row in rows]
    supabase.table("scraped_products").upsert(payloads, on_conflict="asin").execute()


def save_local_json(rows: list[ScrapedProductRow], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps([to_supabase_payload(r) for r in rows], ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def main() -> None:
    keyword = sys.argv[1] if len(sys.argv) > 1 else "プロテインパウダー"
    max_search_pages = int(sys.argv[2]) if len(sys.argv) > 2 else 5
    max_products = int(sys.argv[3]) if len(sys.argv) > 3 and sys.argv[3] != "all" else None
    headless = bool(int(sys.argv[4])) if len(sys.argv) > 4 else False

    supabase = init_supabase()

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=headless,
            slow_mo=300 if not headless else 0,
        )
        context = browser.new_context(
            locale="ja-JP",
            timezone_id="Asia/Tokyo",
            viewport={"width": 1440, "height": 1400},
            user_agent=(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/123.0.0.0 Safari/537.36"
            ),
        )
        page = context.new_page()

        try:
            seeds = search_products(page, keyword=keyword, max_pages=max_search_pages)
            if max_products is not None:
                seeds = seeds[:max_products]

            print(f"[INFO] seeds total={len(seeds)}")

            enriched_rows: list[ScrapedProductRow] = []
            debug_dir = Path("output/product_debug")
            debug_dir.mkdir(parents=True, exist_ok=True)

            for idx, seed in enumerate(seeds, start=1):
                try:
                    print(f"[INFO] enrich {idx}/{len(seeds)} asin={seed.asin}")
                    row = extract_product_details(page, seed)
                    enriched_rows.append(row)

                    html_path = debug_dir / f"{sanitize_filename(seed.asin)}.html"
                    html_path.write_text(page.content(), encoding="utf-8")

                    random_sleep(1.0, 2.2)
                except PlaywrightTimeoutError:
                    print(f"[WARN] asin={seed.asin} timeout")
                    continue
                except Exception as e:
                    print(f"[WARN] asin={seed.asin} error={e}")
                    continue

            merged = merge_rows(enriched_rows)
            print(f"[INFO] merged rows={len(merged)}")

            save_local_json(merged, Path("output/scraped_products_payload.json"))
            upsert_scraped_products(supabase, merged)

            print("[DONE] upsert to scraped_products completed")

        finally:
            context.close()
            browser.close()


if __name__ == "__main__":
    main()