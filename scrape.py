import time
import json
import argparse
from typing import List, Dict

import requests
from bs4 import BeautifulSoup
import pandas as pd

BASE_URL = "https://www.ucl.ac.uk/module-catalogue/modules/"
HEADERS = {
    "User-Agent": "ucl-module-scraper/1.0 (+https://yourdomain.example)"
}

# Default list of module slugs; can be overridden with --modules
DEFAULT_MODULE_SLUGS = [
    "basic-organic-chemistry-CHEM0008",
    "basic-inorganic-chemistry-CHEM0013",
    "basic-physical-chemistry-CHEM0009",
    "introduction-to-cell-biology-CELL0008",
    "introductory-mammalian-physiology-PHOL0002",
    # …
]

def fetch_module(slug: str, delay: float = 0.5) -> Dict:
    """Fetch one UCL module page and extract metadata, restrictions and assessment."""
    url = BASE_URL + slug
    resp = requests.get(url, headers=HEADERS)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")

    # 1) Title
    title_el = soup.find("h1", class_="heading")
    title = title_el.get_text(strip=True) if title_el else slug

    # 2) Meta-tags for standard fields
    meta = { m["name"]: m["content"]
             for m in soup.find_all("meta", attrs={"name": True, "content": True})
             if m["name"].startswith("ucl:sanitized_") }
    faculty    = meta.get("ucl:sanitized_faculty", "")
    department = meta.get("ucl:sanitized_teaching_department", "")
    credit     = meta.get("ucl:sanitized_credit_value", "")
    level      = meta.get("ucl:sanitized_level", "")
    term       = meta.get("ucl:sanitized_intended_teaching_term", "")
    subject    = meta.get("ucl:sanitized_subject", "")

    # 3) Restrictions: <dt>Restrictions</dt> → next <dd>
    restrictions = ""
    for dt in soup.select("dl.dl-inline dt"):
        if dt.get_text(strip=True) == "Restrictions":
            dd = dt.find_next_sibling("dd")
            if dd:
                restrictions = " ".join(dd.stripped_strings)
            break

    # 4) Assessment: <dt>Methods of assessment</dt> → sibling <dd> → <div> items
    assessment: Dict[str,str] = {}
    for dt in soup.select("dl.dl-inline dt"):
        if dt.get_text(strip=True) == "Methods of assessment":
            dd = dt.find_next_sibling("dd")
            if dd:
                for div in dd.find_all("div"):
                    text = div.get_text(separator=" ", strip=True)
                    # expect "80% Exam" or "20% Coursework"
                    parts = text.split("%", 1)
                    if len(parts) == 2:
                        pct = parts[0].strip() + "%"
                        label = parts[1].strip()
                        assessment[label] = pct
                    else:
                        # fallback: store raw
                        assessment[text] = ""
            break

    # be polite
    time.sleep(delay)

    # flatten into one dict
    out = {
        "slug": slug,
        "url": url,
        "title": title,
        "faculty": faculty,
        "department": department,
        "credit_value": credit,
        "level": level,
        "teaching_term": term,
        "subject": subject,
        "restrictions": restrictions,
    }
    # add assessment_* fields
    for k, v in assessment.items():
        # e.g. assessment_Exam → "80%"
        key = f"assessment_{k.replace(' ', '_')}"
        out[key] = v

    return out


def main(slugs: List[str]):
    records = []
    for slug in slugs:
        print(f"Fetching {slug}...", end="", flush=True)
        try:
            rec = fetch_module(slug)
            print(" OK")
            records.append(rec)
        except Exception as e:
            print(" ERROR:", e)

    # convert to DataFrame
    df = pd.DataFrame(records).fillna("")

    # write CSV
    df.to_csv("ucl_modules.csv", index=False)
    print("→ ucl_modules.csv written")

    # write JSON
    with open("ucl_modules.json", "w") as f:
        json.dump(records, f, indent=2)
    print("→ ucl_modules.json written")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Scrape UCL Module Catalogue for key info, restrictions & assessment"
    )
    parser.add_argument(
        "--modules",
        nargs="+",
        default=DEFAULT_MODULE_SLUGS,
        help="space-separated list of module slugs (e.g. basic-organic-chemistry-CHEM0008)"
    )
    args = parser.parse_args()
    main(args.modules)
