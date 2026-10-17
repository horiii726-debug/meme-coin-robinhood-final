"""Inject report data and all side results into the dashboard template -> rhc_dashboard.html (scratchpad root).
Usage: python build_dashboard.py <report name, e.g. cont_sysA_retrain>"""
import json
import sys
from pathlib import Path

WORK = Path("/tmp/claude-0/-root/af19755f-534a-4afa-9b0b-1adc352c44c6/scratchpad/rhc_work")
OUT = WORK.parent / "rhc_dashboard.html"


def j(name, default=None):
    f = WORK / name
    return json.loads(f.read_text()) if f.exists() else default


def main():
    rep = j(f"report_{sys.argv[1]}.json")
    rep.update(j("dashboard_extra.json", {}))
    rep["conclusion"] = j("conclusion.json", [])
    html = (WORK / "dashboard_template.html").read_text().replace("/*__REPORT__*/null", json.dumps(rep, default=float, separators=(",", ":")))
    OUT.write_text(html)
    print(OUT, f"{len(html) / 1e6:.2f} MB")


if __name__ == "__main__":
    main()
