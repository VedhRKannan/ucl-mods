#!/usr/bin/env python3
import time
import json
import re
import argparse
from typing import List, Dict

import requests
from bs4 import BeautifulSoup
import pandas as pd

BASE_URL = "https://www.ucl.ac.uk/module-catalogue/modules/"
HEADERS = {
    "User-Agent": "ucl-module-scraper/1.0 (+https://yourdomain.example)"
}

# All slugs from your original list:
DEFAULT_MODULE_SLUGS = [
    "basic-organic-chemistry-CHEM0008",
    "basic-inorganic-chemistry-CHEM0013",
    "basic-physical-chemistry-CHEM0009",
    "introduction-to-cell-biology-CELL0008",
    "introductory-mammalian-physiology-PHOL0002",
    "organic-chemistry-CHEM0016",
    "inorganic-chemistry-CHEM0014",
    "physical-chemistry-CHEM0019",
    "chemical-dynamics-CHEM0021",
    "organic-reaction-mechanisms-CHEM0018",
    "inorganic-chemistry-for-physical-science-CHEM0015",
    "regression-modelling-STAT0006",
    "structure-and-function-of-nervous-systems-PHOL0005",
    "brain-and-behaviour-PSYC0014",
    "electricity-and-magnetism-PHAS0021",
    "evolutionary-genetics-BIOL0011",
    "mathematical-methods-III-PHAS0025",
]

def fetch_module(slug: str, delay: float = 0.5) -> Dict:
    url = BASE_URL + slug
    resp = requests.get(url, headers=HEADERS)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")

    # --- 1) Basic metadata ---
    title_el = soup.find("h1", class_="heading")
    title = title_el.get_text(strip=True) if title_el else slug

    meta = {
        m["name"]: m["content"]
        for m in soup.find_all("meta", attrs={"name": True, "content": True})
        if m["name"].startswith("ucl:sanitized_")
    }
    faculty    = meta.get("ucl:sanitized_faculty", "")
    department = meta.get("ucl:sanitized_teaching_department", "")
    credit     = meta.get("ucl:sanitized_credit_value", "")
    level      = meta.get("ucl:sanitized_level", "")
    term       = meta.get("ucl:sanitized_intended_teaching_term", "")
    subject    = meta.get("ucl:sanitized_subject", "")

    # --- 2) Restrictions ---
    restrictions = ""
    for dt in soup.select("dl.dl-inline dt"):
        if dt.get_text(strip=True) == "Restrictions":
            dd = dt.find_next_sibling("dd")
            if dd:
                restrictions = " ".join(dd.stripped_strings)
            break

    # --- 3) Assessment breakdown ---
    assessment: Dict[str,str] = {}
    for dt in soup.select("dl.dl-inline dt"):
        if dt.get_text(strip=True) == "Methods of assessment":
            dd = dt.find_next_sibling("dd")
            if dd:
                for div in dd.find_all("div"):
                    text = div.get_text(" ", strip=True)
                    parts = text.split("%", 1)
                    if len(parts) == 2:
                        pct   = parts[0].strip() + "%"
                        label = parts[1].strip()
                        assessment[label] = pct
                    else:
                        assessment[text] = ""
            break

    # --- 4) Description → outline, aims, learning_methods ---
    outline = []
    raw_aims = ""
    learning_methods: Dict[str,str] = {}

    desc_div = soup.find("div", class_="module-description")
    if desc_div:
        ps = desc_div.find_all("p", recursive=False)
        state = None
        for p in ps:
            # detect a heading
            strong = p.find("strong")
            if strong:
                h = strong.get_text(strip=True)
                if h == "Module Outline:":
                    state = "outline"
                elif h == "Module Aims:":
                    state = "aims"
                elif h.startswith("Teaching and Learning Methods"):
                    state = "methods"
                else:
                    state = None
                continue

            # collect content
            txt = p.get_text(" ", strip=True)
            if state == "outline":
                outline.append(txt)
            elif state == "aims":
                raw_aims += txt + "\n"
            elif state == "methods":
                if ":" in txt:
                    key, val = txt.split(":",1)
                    learning_methods[key.strip()] = val.strip()
                else:
                    # catch-all notes
                    learning_methods.setdefault("notes", "")
                    learning_methods["notes"] += " " + txt

    # post-process outline & aims
    outline_str = " ".join(outline).strip()
    # split aims by numbering like "1. "
    aims_list = [
        a.strip()
        for a in re.split(r"\d+\.\s+", raw_aims)
        if a.strip() and not a.startswith("At the end")
    ]

    # --- polite ---
    time.sleep(delay)

    # --- assemble record ---
    record = {
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
        "outline": outline_str,
        "aims": aims_list,
        "learning_methods": learning_methods,
    }
    # flatten assessment
    for label, pct in assessment.items():
        key = f"assessment_{label.replace(' ', '_')}"
        record[key] = pct

    return record


def main(slugs: List[str]):
    records = []
    for slug in slugs:
        print(f"→ fetching {slug} …", end="", flush=True)
        try:
            rec = fetch_module(slug)
            print(" OK")
            records.append(rec)
        except Exception as e:
            print(" ERROR:", e)

    # save JSON
    with open("ucl_modules_structured.json", "w") as f:
        json.dump(records, f, indent=2)
    print("Wrote ucl_modules_structured.json")

    # save CSV (flatten the learning_methods & aims into JSON strings)
    df = pd.DataFrame(records)
    df["aims"] = df["aims"].apply(json.dumps)
    df["learning_methods"] = df["learning_methods"].apply(json.dumps)
    df.to_csv("ucl_modules_structured.csv", index=False)
    print("Wrote ucl_modules_structured.csv")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Scrape UCL Module Catalogue into a structured schema"
    )
    parser.add_argument(
        "--modules",
        nargs="+",
        default=DEFAULT_MODULE_SLUGS,
        help="space-separated list of module slugs"
    )
    args = parser.parse_args()
    main(args.modules)
