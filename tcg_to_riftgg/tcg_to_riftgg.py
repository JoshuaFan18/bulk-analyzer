#!/usr/bin/env python3
"""Convert a TCGplayer-exported Riftbound CSV into a Riftbound.gg-accepted format.

Two output formats are supported (see README.md):

  * dotgg  (default, preferred):  CardId,Normal,Foil,Name,Set
  * legacy:                       Normal,Foil,CardId

By default it converts every CSV in the ``input/`` folder and writes the
results to the ``output/`` folder (both created next to this script if they
don't exist).

Usage:
    python tcg_to_riftgg.py                            # input/*.csv -> output/
    python tcg_to_riftgg.py --format legacy            # legacy format instead
    python tcg_to_riftgg.py some_export.csv            # convert one file
"""

import argparse
import csv
import os
import re
import sys

# Set name -> CardId prefix (per README "ID Conventions").
SET_NAME_TO_PREFIX = {
    "Vendetta": "VEN",
    "Unleashed": "UNL",
    "Spiritforged": "SFD",
    "Origins": "OGN",
    "Origins Starter": "OGS",
}

# Prefix -> canonical set name for the output "Set" column.
PREFIX_TO_SET_NAME = {v: k for k, v in SET_NAME_TO_PREFIX.items()}

# Fallback for rows whose "Set Name" isn't a recognized set (e.g. promo
# printings). The collector-number denominator identifies the real set.
DENOMINATOR_TO_PREFIX = {
    "219": "UNL",
    "221": "SFD",
    "298": "OGN",
}

# A collector number is digits, optionally with a variant letter (e.g. "050a").
NUMBER_RE = re.compile(r"^(\d+[a-z]?)$")


class Card:
    """One aggregated card entry keyed by CardId."""

    __slots__ = ("card_id", "name", "set_name", "normal", "foil")

    def __init__(self, card_id, name, set_name):
        self.card_id = card_id
        self.name = name
        self.set_name = set_name
        self.normal = 0
        self.foil = 0


def resolve_prefix(set_name, denominator):
    """Return the CardId set prefix, preferring the set name, falling back to
    the collector-number denominator (handles promos with an off-set name)."""
    prefix = SET_NAME_TO_PREFIX.get(set_name.strip())
    if prefix is None:
        prefix = DENOMINATOR_TO_PREFIX.get(denominator)
    return prefix


def parse_quantity(row):
    """Quantity to import: prefer 'Add to Quantity', fall back to 'Total
    Quantity'. Returns 0 when neither is a usable positive integer."""
    for key in ("Add to Quantity", "Total Quantity"):
        value = (row.get(key) or "").strip()
        if value:
            try:
                return int(value)
            except ValueError:
                pass
    return 0


def convert(rows):
    """Turn TCGplayer rows into an ordered list of aggregated Card objects.

    Rows are merged by CardId (so a card that appears twice — e.g. a promo and
    its base printing — combines its counts). Tokens and other rows without a
    standard collector number are skipped.
    """
    cards = {}  # card_id -> Card, preserving first-seen order
    for row in rows:
        raw_number = (row.get("Number") or "").strip()
        # Collector number is "NNN/Total"; take the part before the slash.
        number_part = raw_number.split("/")[0].strip()
        match = NUMBER_RE.match(number_part)
        if not match:
            # Tokens ("T03 // T04") and anything non-standard are not real cards.
            continue
        number = match.group(1)

        denominator = ""
        if "/" in raw_number:
            denominator = raw_number.split("/", 1)[1].strip()

        set_name = row.get("Set Name") or ""
        prefix = resolve_prefix(set_name, denominator)
        if prefix is None:
            print(
                f"warning: skipping unknown set '{set_name.strip()}' "
                f"(number {raw_number})",
                file=sys.stderr,
            )
            continue

        card_id = f"{prefix}-{number}"
        quantity = parse_quantity(row)
        if quantity <= 0:
            continue

        printing = (row.get("Printing") or "").strip().lower()
        name = (row.get("Product Name") or "").strip()
        display_set = PREFIX_TO_SET_NAME.get(prefix, set_name.strip())

        card = cards.get(card_id)
        if card is None:
            card = Card(card_id, name, display_set)
            cards[card_id] = card

        if printing == "foil":
            card.foil += quantity
        else:
            card.normal += quantity

    return list(cards.values())


def write_dotgg(cards, out):
    writer = csv.writer(out, lineterminator="\r\n")
    writer.writerow(["CardId", "Normal", "Foil", "Name", "Set"])
    for c in cards:
        writer.writerow([c.card_id, c.normal, c.foil, c.name, c.set_name])


def write_legacy(cards, out):
    writer = csv.writer(out, lineterminator="\r\n")
    for c in cards:
        writer.writerow([c.normal, c.foil, c.card_id])


WRITERS = {"dotgg": write_dotgg, "legacy": write_legacy}

# Folders live next to this script, so the tool works from any working dir.
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_INPUT_DIR = os.path.join(BASE_DIR, "input")
DEFAULT_OUTPUT_DIR = os.path.join(BASE_DIR, "output")


def convert_file(input_path, output_dir, writer):
    """Convert one CSV and write '<stem>_riftgg.csv' into output_dir."""
    with open(input_path, newline="", encoding="utf-8-sig") as f:
        cards = convert(csv.DictReader(f))

    stem = os.path.splitext(os.path.basename(input_path))[0]
    output_path = os.path.join(output_dir, f"{stem}_riftgg.csv")
    with open(output_path, "w", newline="", encoding="utf-8") as out:
        writer(cards, out)

    print(f"Wrote {len(cards)} cards to {output_path}", file=sys.stderr)


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Convert TCGplayer Riftbound exports to a Riftbound.gg format."
    )
    parser.add_argument(
        "input",
        nargs="?",
        help="A single CSV file to convert. Omit to convert every CSV in the "
        "input folder.",
    )
    parser.add_argument(
        "--input-dir",
        default=DEFAULT_INPUT_DIR,
        help="Folder scanned for CSVs when no input file is given "
        "(default: ./input).",
    )
    parser.add_argument(
        "--output-dir",
        default=DEFAULT_OUTPUT_DIR,
        help="Folder converted CSVs are written to (default: ./output).",
    )
    parser.add_argument(
        "-f",
        "--format",
        choices=WRITERS.keys(),
        default="dotgg",
        help="Output format (default: dotgg).",
    )
    args = parser.parse_args(argv)

    os.makedirs(args.output_dir, exist_ok=True)
    writer = WRITERS[args.format]

    if args.input:
        convert_file(args.input, args.output_dir, writer)
        return 0

    os.makedirs(args.input_dir, exist_ok=True)
    inputs = sorted(
        os.path.join(args.input_dir, name)
        for name in os.listdir(args.input_dir)
        if name.lower().endswith(".csv")
    )
    if not inputs:
        print(f"No CSV files found in {args.input_dir}", file=sys.stderr)
        return 0

    for input_path in inputs:
        convert_file(input_path, args.output_dir, writer)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
