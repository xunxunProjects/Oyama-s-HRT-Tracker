#!/usr/bin/env python3
"""Cross-validate the TypeScript PK core math against an independent Python implementation.

Generates N random inputs, runs them through the compiled TypeScript helpers
(`src/domain/shared/math.ts`) and through a Python reimplementation of the same
formulas, and reports how many cases differ by more than the tolerance.

Also runs the medical-data (literature) test suite first as a sanity check.
"""
import argparse
import json
import math
import random
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MATH_TS = ROOT / "src" / "domain" / "shared" / "math.ts"
TSC = ROOT / "node_modules" / ".bin" / "tsc"
NODE_HARNESS = ROOT / "scripts" / "pk_crossval_node.cjs"


def run_medical_check() -> None:
    print("== Medical-data check (literature tests) ==")
    proc = subprocess.run(
        ["npx", "vitest", "run", "tests/literature.test.ts"],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    tail = (proc.stdout + proc.stderr).splitlines()
    for line in tail[-8:]:
        print(line)
    if proc.returncode != 0:
        # vitest returns 0 even with expected fails; a non-zero code means a real failure.
        print("MEDICAL DATA CHECK FAILED")
        sys.exit(proc.returncode)
    print("Medical-data check passed (known gaps are marked it.fails).\n")


def compile_math(outdir: Path) -> Path:
    outdir.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            str(TSC),
            str(MATH_TS),
            "--module",
            "commonjs",
            "--target",
            "es2020",
            "--outDir",
            str(outdir),
            "--skipLibCheck",
            "--esModuleInterop",
            "--isolatedModules",
        ],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    math_js = outdir / "shared" / "math.js"
    if not math_js.exists():
        raise RuntimeError(f"compiled math not found: {math_js}")
    return math_js


# Independent Python reimplementation of the TS helpers.
def py_expdivdiff1(x: float, y: float, tau: float) -> float:
    z = (abs(y - x) * tau) / 2.0
    if z > 1:
        return (math.exp(-x * tau) - math.exp(-y * tau)) / (x - y)
    sinhc = 1.0 if z == 0 else math.sinh(z) / z
    return -tau * math.exp((-(x + y) / 2.0) * tau) * sinhc


def py_expdivdiff2(a: float, b: float, c: float, tau: float) -> float:
    if a > b:
        a, b = b, a
    if b > c:
        b, c = c, b
    if a > b:
        a, b = b, a
    if (c - a) * tau >= 0.5:
        return (py_expdivdiff1(b, c, tau) - py_expdivdiff1(a, b, tau)) / (c - a)
    mean = (a + b + c) / 3.0
    ua = (mean - a) * tau
    ub = (mean - b) * tau
    uc = (mean - c) * tau
    h1 = h2 = h3 = 1.0
    fact = 2.0
    s = 0.5
    for j in range(1, 20):
        h1 *= ua
        h2 = h1 + ub * h2
        h3 = h2 + uc * h3
        fact *= j + 2
        s += h3 / fact
    return tau * tau * math.exp(-mean * tau) * s


def py_analytic2c(tau, dose, F, ka, ke):
    if ka <= 0 or dose <= 0:
        return 0.0
    return -dose * F * ka * py_expdivdiff1(ka, ke, tau)


def py_analytic3c(tau, dose, F, k1, k2, k3):
    if k1 <= 0 or dose <= 0:
        return 0.0
    return dose * F * k1 * k2 * py_expdivdiff2(k1, k2, k3, tau)


def gen_case(rng: random.Random):
    # Mix generic randoms with near-degenerate ones to exercise Taylor branches.
    if rng.random() < 0.3:
        r = rng.random()
        base = rng.uniform(0.01, 5.0)
        # make two rates close
        ka = base
        ke = base * (1.0 + rng.uniform(-1e-4, 1e-4))
        k1 = base
        k2 = base * (1.0 + rng.uniform(-1e-4, 1e-4))
        k3 = base * (1.0 + rng.uniform(-1e-4, 1e-4))
    else:
        ka = rng.uniform(0.01, 5.0)
        ke = rng.uniform(0.01, 5.0)
        k1 = rng.uniform(0.01, 5.0)
        k2 = rng.uniform(0.01, 5.0)
        k3 = rng.uniform(0.01, 5.0)
    return {
        "x": rng.uniform(0.01, 5.0),
        "y": rng.uniform(0.01, 5.0),
        "tau": rng.uniform(0.0, 48.0),
        "a": rng.uniform(0.01, 5.0),
        "b": rng.uniform(0.01, 5.0),
        "c": rng.uniform(0.01, 5.0),
        "D": rng.uniform(1.0, 1000.0),
        "F": rng.uniform(0.01, 1.0),
        "ka": ka,
        "ke": ke,
        "k1": k1,
        "k2": k2,
        "k3": k3,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cases", type=int, default=1_000_000)
    ap.add_argument("--chunk", type=int, default=50_000)
    ap.add_argument("--tol", type=float, default=1e-9)
    ap.add_argument("--seed", type=int, default=12345)
    ap.add_argument("--skip-medical", action="store_true")
    args = ap.parse_args()

    if not args.skip_medical:
        run_medical_check()

    with tempfile.TemporaryDirectory() as td:
        outdir = Path(td) / "mathout"
        math_js = compile_math(outdir)
        print(f"Compiled {MATH_TS} -> {math_js}")

        rng = random.Random(args.seed)
        total = args.cases
        mismatches = 0
        maxdiff = 0.0
        nonfinite = 0
        examples = []
        processed = 0
        t0 = time.time()

        while processed < total:
            n = min(args.chunk, total - processed)
            cases = [gen_case(rng) for _ in range(n)]
            # Python reference values
            py_refs = []
            for c in cases:
                py_refs.append(
                    {
                        "d1": py_expdivdiff1(c["x"], c["y"], c["tau"]),
                        "d2": py_expdivdiff2(c["a"], c["b"], c["c"], c["tau"]),
                        "a2": py_analytic2c(c["tau"], c["D"], c["F"], c["ka"], c["ke"]),
                        "a3": py_analytic3c(c["tau"], c["D"], c["F"], c["k1"], c["k2"], c["k3"]),
                    }
                )

            # TS values via node
            # feed via stdin
            proc = subprocess.run(
                ["node", str(NODE_HARNESS), str(math_js)],
                input=json.dumps(cases),
                capture_output=True,
                text=True,
                check=True,
            )
            ts_vals = json.loads(proc.stdout)

            for c, pr, tv in zip(cases, py_refs, ts_vals):
                for key in ("d1", "d2", "a2", "a3"):
                    pv = pr[key]
                    tvv = tv[key]
                    if not (math.isfinite(pv) and math.isfinite(tvv)):
                        nonfinite += 1
                        if len(examples) < 10:
                            examples.append((c, key, pv, tvv))
                        continue
                    diff = abs(pv - tvv)
                    if diff > maxdiff:
                        maxdiff = diff
                    if diff > args.tol:
                        mismatches += 1
                        if len(examples) < 10:
                            examples.append((c, key, pv, tvv))

            processed += n
            elapsed = time.time() - t0
            rate = processed / elapsed if elapsed > 0 else 0
            print(f"processed {processed}/{total}  mismatches={mismatches}  maxdiff={maxdiff:.3e}  ({rate:.0f} cases/s)", flush=True)

        print("\n== RESULT ==")
        print(f"cases:       {total}")
        print(f"mismatches:  {mismatches} (tol={args.tol})")
        print(f"non-finite:  {nonfinite}")
        print(f"max abs diff:{maxdiff:.3e}")
        if examples:
            print("first mismatches:")
            for c, key, pv, tvv in examples[:5]:
                print(f"  {key}: py={pv!r} ts={tvv!r} case={c}")
        if mismatches > 0 or nonfinite > 0:
            sys.exit(1)
        print("PASS: TS and Python agree within tolerance.")


if __name__ == "__main__":
    main()
