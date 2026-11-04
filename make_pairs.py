#!/usr/bin/env python3
"""Generate a random round of reading-group pairs, with pairs cooling down.

Usage:
    python make_pairs.py            # generate and record a new round
    python make_pairs.py --dry-run  # show a round without recording anything
    python make_pairs.py --exclude "Ari, Ben" --exclude "Noah, Elsa"
                                    # keep these pairs out of this one round
    python make_pairs.py --status   # show the tally for every pair
    python make_pairs.py --reset    # clear all history (asks for confirmation)

Files:
    names.txt        one name per line (blank lines and '#' comments ignored)
    pair_hell.txt    pairs that are never chosen, one "Name, Name" per line
    history.json     the pairs chosen in each round
    pair_spells.json per-pair tally: the current spell plus every past spell

--exclude only affects the round being generated (repeat it for several
pairs). Excluded pairs aren't sent to purgatory or otherwise penalised; they
simply aren't picked this time. Unlike pair_hell.txt, nothing is remembered.

How pairs cool down:
    A pair that is chosen goes to "pair purgatory" and can't be chosen again
    for a while. At the start of each run, one fifth of the purgatory pairs (chosen at
    random) are released back into the pool. Each round adds P pairs to purgatory
    (P = N/2 rounded up), so the purgatory count settles at 5 * P: 25 pairs for
    10 people, 30 for 11.

Spells:
    Every pair is always in one of two spells:
      purgatory - counts the rounds it has been unavailable
      allowed  - counts the rounds it has been available but not picked
    When a spell ends, it is saved to that pair's history in pair_spells.json.

If the number of names is odd, one person would be left over, so a randomly
chosen person is put in two pairs and everyone has at least one partner.
"""

import argparse
import json
import random
import sys
from itertools import combinations
from pathlib import Path

HERE = Path(__file__).parent
NAMES_FILE = HERE / "names.txt"
HELL_FILE = HERE / "pair_hell.txt"
HISTORY_FILE = HERE / "history.json"
SPELLS_FILE = HERE / "pair_spells.json"
BYE = "(bye)"
RELEASE_FRACTION = 1 / 5  # share of purgatory pairs released at the start of a run
SEP = " | "


# ---------------------------------------------------------------- input files

def load_names():
    if not NAMES_FILE.exists():
        sys.exit(f"Missing {NAMES_FILE.name}. Add one name per line.")
    names = []
    for line in NAMES_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#"):
            names.append(line)
    if len(set(names)) != len(names):
        sys.exit("names.txt contains duplicate names.")
    if len(names) < 2:
        sys.exit("Need at least 2 names in names.txt.")
    return names


def pair_key(a, b):
    """Canonical string key for an unordered pair."""
    return SEP.join(sorted((a, b)))


def load_pair_hell(names):
    """Return the set of pair keys from pair_hell.txt (optional file)."""
    if not HELL_FILE.exists():
        return set()
    hell = set()
    for line in HELL_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = [p.strip() for p in line.split(",")]
        if len(parts) != 2 or parts[0] == parts[1]:
            sys.exit(f"Bad line in {HELL_FILE.name}: {line!r} (expected 'Name, Name')")
        for p in parts:
            if p not in names:
                print(f"Warning: {p!r} in {HELL_FILE.name} is not in names.txt")
        hell.add(pair_key(*parts))
    return hell


# ----------------------------------------------------------------- state files

def load_json(path, default):
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def save_json(path, data):
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def new_spell(status, start_round):
    return {"status": status, "start_round": start_round, "rounds": 0}


def end_spell(pair, end_round):
    """Move a pair's current spell into its history."""
    spell = pair["current"]
    pair["history"].append({**spell, "end_round": end_round})


# --------------------------------------------------------------------- picking

def find_round(people, unavailable):
    """Randomized backtracking search for a full matching avoiding `unavailable`."""
    people = list(people)
    random.shuffle(people)

    def solve(remaining):
        if not remaining:
            return []
        first, rest = remaining[0], remaining[1:]
        candidates = rest[:]
        random.shuffle(candidates)
        for other in candidates:
            if pair_key(first, other) in unavailable:
                continue
            tail = solve([p for p in rest if p != other])
            if tail is not None:
                return [(first, other)] + tail
        return None

    return solve(people)


def pick_round(names, unavailable):
    """Return a list of pairs covering everyone, or None if impossible.

    With an even number of names this is a perfect matching. With an odd
    number, one person is left over; they get an extra pair with someone who
    already has a partner, so that person ends up in two pairs.
    """
    if len(names) % 2 == 0:
        return find_round(names, unavailable)

    # Match everyone against a stand-in partner for the odd one out, then
    # swap the stand-in for a real (allowed) partner. Try a few matchings,
    # since the odd one out may have no allowed partner in a given draw.
    for _ in range(200):
        matching = find_round(names + [BYE], unavailable)
        if matching is None:
            return None
        pairing = [p for p in matching if BYE not in p]
        (odd,) = [a if b == BYE else b for a, b in matching if BYE in (a, b)]
        options = [q for q in names if q != odd and pair_key(odd, q) not in unavailable]
        if options:
            return pairing + [(odd, random.choice(options))]
    return None


def apply_round(pairs, universe, chosen, number):
    """End of round `number`: send the chosen pairs to purgatory and advance every tally."""
    for k in universe:
        pair = pairs[k]
        if k in chosen:
            end_spell(pair, number)
            pair["current"] = new_spell("purgatory", number + 1)
        else:
            pair["current"]["rounds"] += 1  # in purgatory, or allowed and not picked


def release_count(n_purgatory):
    """One fifth of n_purgatory, with the fractional part rounded randomly."""
    exact = n_purgatory * RELEASE_FRACTION
    whole = int(exact)
    return whole + (1 if random.random() < exact - whole else 0)


def release(pairs, keys, count, round_number):
    """Release `count` random purgatory pairs (from `keys`) into the allowed pool."""
    chosen = random.sample(sorted(keys), min(count, len(keys)))
    for k in chosen:
        end_spell(pairs[k], round_number - 1)
        pairs[k]["current"] = new_spell("allowed", round_number)
    return chosen


# ----------------------------------------------------------------------- views

def describe(k):
    a, b = k.split(SEP)
    return f"{a} & {b}"


def print_status(state, universe, hell):
    pairs = state["pairs"]
    rows = {"purgatory": [], "allowed": []}
    for k in universe:
        cur = pairs[k]["current"]
        rows[cur["status"]].append((cur["rounds"], k))
    print(f"Rounds completed: {state['rounds_done']}")
    print(f"\nPair purgatory ({len(rows['purgatory'])}) - rounds in purgatory so far:")
    for n, k in sorted(rows["purgatory"], reverse=True):
        print(f"  {n:3d}  {describe(k)}")
    print(f"\nAllowed pairs ({len(rows['allowed'])}) - rounds allowed without being picked:")
    for n, k in sorted(rows["allowed"], reverse=True):
        print(f"  {n:3d}  {describe(k)}")
    if hell:
        print(f"\nPair hell ({len(hell)}): " + ", ".join(describe(k) for k in sorted(hell)))


# ------------------------------------------------------------------------ main

def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--dry-run", action="store_true", help="don't record anything")
    parser.add_argument(
        "--exclude", action="append", default=[], metavar='"NAME, NAME"',
        help="keep this pair out of this round only (repeatable)",
    )
    parser.add_argument("--status", action="store_true", help="show the pair tally")
    parser.add_argument("--reset", action="store_true", help="clear all history")
    args = parser.parse_args()

    if args.reset:
        if input("Delete all pair history and spells? [y/N] ").strip().lower() == "y":
            HISTORY_FILE.unlink(missing_ok=True)
            SPELLS_FILE.unlink(missing_ok=True)
            print("History cleared.")
        return

    names = load_names()
    hell = load_pair_hell(names)
    excluded = set()
    for text in args.exclude:
        parts = [p.strip() for p in text.split(",")]
        if len(parts) != 2 or parts[0] == parts[1]:
            sys.exit(f"Bad --exclude value {text!r} (expected 'Name, Name')")
        unknown = [p for p in parts if p not in names]
        if unknown:
            sys.exit(f"--exclude: {', '.join(map(repr, unknown))} not in names.txt")
        excluded.add(pair_key(*parts))

    universe = [pair_key(a, b) for a, b in combinations(names, 2)]
    universe = [k for k in universe if k not in hell]

    state = load_json(SPELLS_FILE, {"rounds_done": 0, "pairs": {}})
    pairs = state["pairs"]
    rounds_done = state["rounds_done"]
    for k in universe:  # pairs we haven't seen before start out allowed
        pairs.setdefault(k, {"current": new_spell("allowed", rounds_done + 1), "history": []})

    if not SPELLS_FILE.exists():
        # Rebuild the tally from rounds recorded before spells were tracked.
        # (No releases are replayed: none happened in those runs.)
        for past in load_json(HISTORY_FILE, []):
            rounds_done += 1
            apply_round(pairs, universe, {pair_key(a, b) for a, b in past}, rounds_done)
        state["rounds_done"] = rounds_done

    if args.status:
        print_status(state, universe, hell)
        return

    number = rounds_done + 1
    purgatory = {k for k in universe if pairs[k]["current"]["status"] == "purgatory"}

    # Start of run: release one fifth of the purgatory pairs.
    released = release(pairs, purgatory, release_count(len(purgatory)), number)
    purgatory -= set(released)

    # Pick a round. If the allowed pairs can't form one, release more pairs.
    extra = []
    while True:
        pairing = pick_round(names, purgatory | hell | excluded)
        if pairing is not None:
            break
        if not purgatory:
            sys.exit("No complete round is possible; check pair_hell.txt and --exclude.")
        more = release(pairs, purgatory, 1, number)
        extra += more
        purgatory -= set(more)

    chosen = {pair_key(a, b) for a, b in pairing}

    apply_round(pairs, universe, chosen, number)
    state["rounds_done"] = number

    print("Pairs:")
    for a, b in pairing:
        print(f"  {a} & {b}")
    counts = {n: sum(n in p for p in pairing) for n in names}
    for n in names:
        if counts[n] > 1:
            print(f"  ({n} is in {counts[n]} pairs this round)")
    n_purgatory = sum(1 for k in universe if pairs[k]["current"]["status"] == "purgatory")
    print(
        f"\nReleased {len(released) + len(extra)} pair(s) this run; "
        f"{n_purgatory} in purgatory, {len(universe) - n_purgatory} allowed "
        f"(+{len(hell)} in hell)."
    )
    if excluded:
        print("Excluded this round: " + ", ".join(describe(k) for k in sorted(excluded)))
    if extra:
        print(f"  ({len(extra)} extra released because no round fit otherwise)")

    if args.dry_run:
        print("(dry run: nothing recorded)")
    else:
        rounds = load_json(HISTORY_FILE, [])
        rounds.append([list(p) for p in pairing])
        save_json(HISTORY_FILE, rounds)
        save_json(SPELLS_FILE, state)


if __name__ == "__main__":
    main()
