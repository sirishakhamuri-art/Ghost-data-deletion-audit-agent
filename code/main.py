#!/usr/bin/env python3
"""
HackerRank Orchestrate - Ghost Data Still Exists
Main solution entry point.
Audits all requests in dataset/deletion_requests.csv and writes output.csv at root.
"""

import csv
import json
import os
import sys

# Ensure local package path
sys.path.insert(0, os.path.dirname(__file__))

from audit_agent import NorthstarAuditAgent

def main():
    root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    dataset_dir = os.path.join(root_dir, "dataset")
    input_csv = os.path.join(dataset_dir, "deletion_requests.csv")
    output_csv = os.path.join(root_dir, "output.csv")
    dataset_output_csv = os.path.join(dataset_dir, "output.csv")

    print(f"[*] Initializing Northstar Deletion Audit Agent...")
    agent = NorthstarAuditAgent(dataset_dir)

    print(f"[*] Loading evaluation deletion requests from {input_csv}...")
    with open(input_csv, "r", encoding="utf-8") as f:
        requests = list(csv.DictReader(f))

    print(f"[*] Processing {len(requests)} deletion audit cases...")
    output_rows = []
    status_counts = {"COMPLETE": 0, "INCOMPLETE": 0, "NOT_APPLICABLE": 0}

    for req in requests:
        res = agent.audit_request(
            case_id=req["case_id"],
            email=req["email"],
            requested_at=req["requested_at"],
            reported_status=req["reported_status"],
            reported_at=req["reported_at"],
            audit_at=req["audit_at"],
            request_text=req["request_text"]
        )
        output_rows.append(res)
        status_counts[res["deletion_status"]] = status_counts.get(res["deletion_status"], 0) + 1

    # Sort strictly by case_id (numeric sort)
    output_rows.sort(key=lambda r: int(r["case_id"].replace("case_", "")))

    print(f"[*] Audit complete! Status breakdown: {status_counts}")
    print(f"[*] Writing final submission to {output_csv}...")

    fieldnames = ["case_id", "deletion_status", "steps_json"]
    with open(output_csv, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, lineterminator="\n")
        writer.writeheader()
        for r in output_rows:
            writer.writerow(r)

    # Also sync dataset/output.csv
    with open(dataset_output_csv, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, lineterminator="\n")
        writer.writeheader()
        for r in output_rows:
            writer.writerow(r)

    print(f"[+] Successfully wrote {len(output_rows)} rows to {output_csv}.")

if __name__ == "__main__":
    main()
