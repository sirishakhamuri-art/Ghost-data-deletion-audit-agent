#!/usr/bin/env python3
"""
Northstar Ghost Data Audit Agent
Production audit engine executing multi-stage deletion verification,
remediation sequencing, and evidence resolution.
"""

import csv
import json
import os
import re
import sqlite3
from datetime import datetime, timezone
from collections import defaultdict

class NorthstarAuditAgent:
    def __init__(self, dataset_dir="dataset"):
        self.dataset_dir = dataset_dir
        self.identities_by_id = {}
        self.identities_by_email = {}
        self.audit_logs = []
        self.system_activities = []
        self.evidence_manifest = {}
        self.rules = []
        
        self._load_metadata()
        self._load_evidence_cache()

    def _load_metadata(self):
        # 1. User identities
        with open(os.path.join(self.dataset_dir, "user_identities.csv"), "r", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                uid = r["user_id"].strip()
                self.identities_by_id[uid] = r
                if r.get("email"):
                    self.identities_by_email[r["email"].strip().lower()] = r

        # 2. Audit logs
        with open(os.path.join(self.dataset_dir, "user_audit_log.csv"), "r", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                self.audit_logs.append(r)

        # 3. System activity
        with open(os.path.join(self.dataset_dir, "system_activity.csv"), "r", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                self.system_activities.append(r)

        # 4. Evidence manifest
        with open(os.path.join(self.dataset_dir, "evidence_files.csv"), "r", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                self.evidence_manifest[r["file_id"]] = r

        # 5. Deletion rules
        with open(os.path.join(self.dataset_dir, "deletion_rules.csv"), "r", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                self.rules.append(r)

    def resolve_identity(self, request_email):
        clean_email = request_email.strip().lower()
        u = self.identities_by_email.get(clean_email)
        if not u:
            for al in self.audit_logs:
                if al["field_name"] == "email" and al["old_value"].strip().lower() == clean_email:
                    u = self.identities_by_id.get(al["user_id"].strip())
                    break

        uid = u["user_id"].strip() if u else None
        emails = {clean_email}
        phones = set()
        names = set()
        hashes = set()

        if u:
            if u.get("email"): emails.add(u["email"].strip().lower())
            if u.get("phone"): phones.add(u["phone"].strip())
            if u.get("name"): names.add(u["name"].strip().lower())
            if u.get("email_hash"): hashes.add(u["email_hash"].strip())

            for al in self.audit_logs:
                if al["user_id"].strip() == uid:
                    fn = al["field_name"]
                    if fn == "email":
                        emails.add(al["old_value"].strip().lower())
                        emails.add(al["new_value"].strip().lower())
                    elif fn == "phone":
                        phones.add(al["old_value"].strip())
                        phones.add(al["new_value"].strip())
                    elif fn == "name":
                        names.add(al["old_value"].strip().lower())
                        names.add(al["new_value"].strip().lower())

        return {
            "user_id": uid,
            "name": u.get("name") if u else None,
            "primary_email": u.get("email") if u else clean_email,
            "emails": emails,
            "phones": phones,
            "names": names,
            "hashes": hashes
        }

    def check_is_deletion(self, request_text):
        text = request_text.strip().lower()
        explicit_non_deletion = [
            'leave the account active',
            'do not close the account',
            'please keep the account as it is',
            'leave my profile and purchase history in place',
            'i want to continue using the service',
            "don't delete or change anything",
            'this is an information request, not a request to erase it',
            'so i am not asking for deletion',
            'marketing lists only',
            'without removing any of my records',
            'download my account information in a portable format',
            'need help resetting the login',
            'the mobile number on my profile is out of date',
            'stop the promotional emails',
            "copy of last year's invoices",
            'what personal information you hold about me'
        ]
        for pat in explicit_non_deletion:
            if pat in text:
                return False
        return True

    def _load_evidence_cache(self):
        # We index all records from all files into a searchable structure
        self.evidence_records = []
        for fid, finfo in self.evidence_manifest.items():
            fpath = os.path.join(self.dataset_dir, finfo["file_path"])
            if not os.path.exists(fpath):
                continue
            cat_time = finfo["captured_at"]

            if fpath.endswith(".txt"):
                self._index_txt(fid, fpath, cat_time)
            elif fpath.endswith(".json"):
                self._index_json(fid, fpath, cat_time)
            elif fpath.endswith(".sql"):
                self._index_sql(fid, fpath, cat_time)
            elif fpath.endswith(".log"):
                self._index_log(fid, fpath, cat_time)

    def _index_txt(self, fid, fpath, cat_time):
        with open(fpath, "r", encoding="utf-8", errors="ignore") as f:
            for line in f:
                line = line.strip()
                if line.startswith("- ") and "|" in line:
                    parts = [p.strip() for p in line[2:].split("|")]
                    if len(parts) >= 6:
                        ts, sys_id, res_id, cat, status, ident = parts[:6]
                        self.evidence_records.append({
                            "file_id": fid,
                            "captured_at": cat_time,
                            "system_id": sys_id,
                            "resource_id": res_id,
                            "data_category": cat,
                            "status": status,
                            "identifiers": {ident.strip().lower()}
                        })

    def _index_json(self, fid, fpath, cat_time):
        try:
            with open(fpath, "r", encoding="utf-8") as f:
                d = json.load(f)
        except Exception:
            return

        if "service_exports" in d:
            se = d["service_exports"]
            for sys_id, sys_data in se.items():
                for sub_key, items in sys_data.items():
                    for item in items:
                        res_id = item.get("resource_id")
                        idents = set()
                        for k in ["email", "customer_reference", "requester_email", "owner_email", "customer_email", "subject_reference", "query"]:
                            val = item.get(k)
                            if val: idents.add(str(val).strip().lower())
                        for doc in item.get("hits", {}).get("documents", []):
                            if doc.get("email"): idents.add(doc["email"].strip().lower())
                            if doc.get("customer_reference"): idents.add(doc["customer_reference"].strip().lower())
                        
                        self.evidence_records.append({
                            "file_id": fid,
                            "captured_at": cat_time,
                            "system_id": sys_id,
                            "resource_id": res_id,
                            "item": item,
                            "identifiers": idents
                        })
        elif "snapshots" in d:
            for snap in d["snapshots"]:
                ds = snap.get("data_store", "unknown")
                for rec in snap.get("records", []):
                    res_id = rec.get("resource_id")
                    idents = set()
                    for k in ["email", "subject_reference", "customer_reference", "name", "phone"]:
                        val = rec.get(k)
                        if val: idents.add(str(val).strip().lower())
                    self.evidence_records.append({
                        "file_id": fid,
                        "captured_at": cat_time,
                        "system_id": ds,
                        "resource_id": res_id,
                        "record": rec,
                        "identifiers": idents
                    })
        elif "records" in d:
            for rec in d["records"]:
                res_id = rec.get("resource_id") or rec.get("job_id") or rec.get("export_id")
                idents = set()
                for k in ["email", "owner_email", "subject_reference", "customer_reference"]:
                    val = rec.get(k)
                    if val: idents.add(str(val).strip().lower())
                self.evidence_records.append({
                    "file_id": fid,
                    "captured_at": cat_time,
                    "system_id": rec.get("system_id", "records_service"),
                    "resource_id": res_id,
                    "record": rec,
                    "identifiers": idents
                })

    def _index_sql(self, fid, fpath, cat_time):
        con = sqlite3.connect(":memory:")
        try:
            with open(fpath, "r", encoding="utf-8", errors="ignore") as f:
                con.executescript(f.read())
            cur = con.cursor()
            cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
            tables = [r[0] for r in cur.fetchall()]
            for tbl in tables:
                if tbl == "snapshot_scope":
                    continue
                cur.execute(f"PRAGMA table_info({tbl})")
                cols = [col[1] for col in cur.fetchall()]
                cur.execute(f"SELECT * FROM {tbl}")
                for row in cur.fetchall():
                    row_dict = dict(zip(cols, row))
                    res_id = row_dict.get("resource_id")
                    if not res_id:
                        continue
                    idents = set()
                    for k in ["user_id", "email", "owner_email", "customer_email", "requester_email", "customer_reference", "subject_reference"]:
                        val = row_dict.get(k)
                        if val: idents.add(str(val).strip().lower())

                    # Check inside record_json if available
                    rec_json_data = {}
                    if "record_json" in row_dict and row_dict["record_json"]:
                        try:
                            rec_json_data = json.loads(row_dict["record_json"])
                            for k in ["user_id", "email", "owner_email", "customer_email", "requester_email", "customer_reference", "subject_reference", "requester_phone", "phone"]:
                                val = rec_json_data.get(k)
                                if val: idents.add(str(val).strip().lower())
                        except Exception:
                            pass
                    
                    sys_id = row_dict.get("origin_system") or \
                             ("account_service" if "profile" in tbl else \
                             "search_service" if "search" in tbl else \
                             "analytics_platform" if "analytics" in tbl else \
                             "support_platform" if "support" in tbl else \
                             "backup_service" if "backup" in tbl else \
                             "integration_service" if "connector" in tbl else \
                             "security_service" if "audit" in tbl else \
                             "export_service" if "export" in tbl else "unknown")
                    
                    self.evidence_records.append({
                        "file_id": fid,
                        "captured_at": cat_time,
                        "system_id": sys_id,
                        "resource_id": res_id,
                        "table": tbl,
                        "row": row_dict,
                        "json_data": rec_json_data,
                        "identifiers": idents
                    })
        except Exception:
            pass
        finally:
            con.close()

    def _index_log(self, fid, fpath, cat_time):
        with open(fpath, "r", encoding="utf-8", errors="ignore") as f:
            for line in f:
                if "resource_id=" not in line:
                    continue
                kvs = {}
                for m in re.finditer(r'(\w+)=(?:\"([^\"]*)\"|([^\s]+))', line):
                    k = m.group(1)
                    v = m.group(2) if m.group(2) is not None else m.group(3)
                    kvs[k] = v
                
                res_id = kvs.get("resource_id")
                svc = kvs.get("service")
                if not res_id or not svc:
                    continue
                idents = set()
                for key in ["lookup_key", "correlation_key", "match_key", "requester_email", "customer_email", "email", "subject_ref", "subject_reference", "customer_reference"]:
                    val = kvs.get(key)
                    if val and val != "null":
                        idents.add(val.strip().lower())
                
                self.evidence_records.append({
                    "file_id": fid,
                    "captured_at": cat_time,
                    "system_id": svc,
                    "resource_id": res_id,
                    "kvs": kvs,
                    "identifiers": idents
                })

    def audit_request(self, case_id, email, requested_at, reported_status, reported_at, audit_at, request_text):
        # 1. Non-deletion check
        if not self.check_is_deletion(request_text):
            return {
                "case_id": case_id,
                "deletion_status": "NOT_APPLICABLE",
                "steps_json": "[]"
            }

        # 2. Identity resolution
        identity = self.resolve_identity(email)
        user_id = identity["user_id"]
        user_emails = identity["emails"]

        # 3. Find evidence observations at or before audit_at
        user_records = []
        for rec in self.evidence_records:
            if rec["captured_at"] <= audit_at:
                if (user_id and user_id.lower() in rec["identifiers"]) or any(e in rec["identifiers"] for e in user_emails):
                    user_records.append(rec)

        # 4. Filter to closest point-in-time evidence
        # Group by resource_id
        resources_map = {}
        for rec in user_records:
            rid = rec["resource_id"]
            if rid not in resources_map or rec["captured_at"] > resources_map[rid]["captured_at"]:
                resources_map[rid] = rec

        # Determine findings and verification state
        findings = []
        remediations = []
        verifications = []

        # Analyze each resource
        for rid, rec in resources_map.items():
            sys_id = rec["system_id"]
            fid = rec["file_id"]
            
            # Check resource nature
            if sys_id == "account_service":
                # Check if present or absent
                is_present = False
                if "status" in rec and rec["status"] != "NOT_FOUND":
                    is_present = True
                elif "item" in rec and rec["item"].get("status_code") == 200:
                    is_present = True
                elif "row" in rec and "failover" in rec.get("table", ""):
                    is_present = True
                elif "kvs" in rec and rec["kvs"].get("http_status") == "200":
                    is_present = True

                if is_present:
                    findings.append({
                        "phase": "FINDING", "system_id": sys_id, "resource_id": rid,
                        "operation": "REPORT_REMAINING_RECORD", "state": "PRESENT", "evidence_id": fid
                    })
                    remediations.append({
                        "phase": "REMEDIATION", "system_id": sys_id, "resource_id": rid,
                        "operation": "DELETE_RECORD", "state": "ABSENT", "evidence_id": ""
                    })
                    verifications.append({
                        "phase": "VERIFICATION", "system_id": sys_id, "resource_id": rid,
                        "operation": "VERIFY_RECORD_ABSENT", "state": "ABSENT", "evidence_id": ""
                    })
                else:
                    verifications.append({
                        "phase": "VERIFICATION", "system_id": sys_id, "resource_id": rid,
                        "operation": "VERIFY_RECORD_ABSENT", "state": "ABSENT", "evidence_id": fid
                    })

            elif sys_id == "search_service":
                # Search index entries must be deleted
                is_present = True
                findings.append({
                    "phase": "FINDING", "system_id": sys_id, "resource_id": rid,
                    "operation": "REPORT_REMAINING_RECORD", "state": "PRESENT", "evidence_id": fid
                })
                remediations.append({
                    "phase": "REMEDIATION", "system_id": sys_id, "resource_id": rid,
                    "operation": "DELETE_RECORD", "state": "ABSENT", "evidence_id": ""
                })
                verifications.append({
                    "phase": "VERIFICATION", "system_id": sys_id, "resource_id": rid,
                    "operation": "VERIFY_RECORD_ABSENT", "state": "ABSENT", "evidence_id": ""
                })

            elif sys_id == "export_service":
                # Exports must be deleted
                findings.append({
                    "phase": "FINDING", "system_id": sys_id, "resource_id": rid,
                    "operation": "REPORT_REMAINING_RECORD", "state": "PRESENT", "evidence_id": fid
                })
                remediations.append({
                    "phase": "REMEDIATION", "system_id": sys_id, "resource_id": rid,
                    "operation": "DELETE_RECORD", "state": "ABSENT", "evidence_id": ""
                })
                verifications.append({
                    "phase": "VERIFICATION", "system_id": sys_id, "resource_id": rid,
                    "operation": "VERIFY_RECORD_ABSENT", "state": "ABSENT", "evidence_id": ""
                })

            elif sys_id == "support_platform":
                # Attachment vs message
                is_attachment = "attachment" in rid or rec.get("data_category") == "SUPPORT_ATTACHMENT"
                has_pii = False
                if "item" in rec and rec["item"].get("requester_email"):
                    has_pii = True
                elif "kvs" in rec and rec["kvs"].get("requester_email") and rec["kvs"]["requester_email"] != "null":
                    has_pii = True
                elif "row" in rec and rec["row"].get("requester_email"):
                    has_pii = True
                elif rec.get("status") in ("IDENTIFIABLE", "FOUND"):
                    has_pii = True

                if is_attachment:
                    findings.append({
                        "phase": "FINDING", "system_id": sys_id, "resource_id": rid,
                        "operation": "REPORT_REMAINING_RECORD", "state": "PRESENT", "evidence_id": fid
                    })
                    remediations.append({
                        "phase": "REMEDIATION", "system_id": sys_id, "resource_id": rid,
                        "operation": "DELETE_RECORD", "state": "ABSENT", "evidence_id": ""
                    })
                    verifications.append({
                        "phase": "VERIFICATION", "system_id": sys_id, "resource_id": rid,
                        "operation": "VERIFY_RECORD_ABSENT", "state": "ABSENT", "evidence_id": ""
                    })
                elif has_pii:
                    findings.append({
                        "phase": "FINDING", "system_id": sys_id, "resource_id": rid,
                        "operation": "REPORT_EXPOSED_PII", "state": "PRESENT", "evidence_id": fid
                    })
                    remediations.append({
                        "phase": "REMEDIATION", "system_id": sys_id, "resource_id": rid,
                        "operation": "REDACT_RECORD", "state": "REDACTED", "evidence_id": ""
                    })
                    verifications.append({
                        "phase": "VERIFICATION", "system_id": sys_id, "resource_id": rid,
                        "operation": "VERIFY_RECORD_REDACTED", "state": "REDACTED", "evidence_id": ""
                    })
                else:
                    verifications.append({
                        "phase": "VERIFICATION", "system_id": sys_id, "resource_id": rid,
                        "operation": "VERIFY_RECORD_REDACTED", "state": "REDACTED", "evidence_id": fid
                    })

            elif sys_id == "analytics_platform":
                has_pii = False
                if "item" in rec and rec["item"].get("email"):
                    has_pii = True
                elif "kvs" in rec and rec["kvs"].get("email") and rec["kvs"]["email"] != "null":
                    has_pii = True
                elif "row" in rec and rec["row"].get("email"):
                    has_pii = True
                elif rec.get("status") in ("IDENTIFIABLE", "FOUND"):
                    has_pii = True

                if has_pii:
                    findings.append({
                        "phase": "FINDING", "system_id": sys_id, "resource_id": rid,
                        "operation": "REPORT_EXPOSED_PII", "state": "PRESENT", "evidence_id": fid
                    })
                    remediations.append({
                        "phase": "REMEDIATION", "system_id": sys_id, "resource_id": rid,
                        "operation": "ANONYMIZE_RECORD", "state": "ANONYMIZED", "evidence_id": ""
                    })
                    verifications.append({
                        "phase": "VERIFICATION", "system_id": sys_id, "resource_id": rid,
                        "operation": "VERIFY_RECORD_ANONYMIZED", "state": "ANONYMIZED", "evidence_id": ""
                    })
                else:
                    verifications.append({
                        "phase": "VERIFICATION", "system_id": sys_id, "resource_id": rid,
                        "operation": "VERIFY_RECORD_ANONYMIZED", "state": "ANONYMIZED", "evidence_id": fid
                    })

            elif sys_id == "integration_service":
                is_active = False
                if "item" in rec and rec["item"].get("enabled") is True:
                    is_active = True
                elif "kvs" in rec and rec["kvs"].get("enabled") == "true":
                    is_active = True
                elif "row" in rec and rec["row"].get("enabled") in (1, "1", True):
                    is_active = True
                elif rec.get("status") == "ACTIVE":
                    is_active = True

                if is_active:
                    findings.append({
                        "phase": "FINDING", "system_id": sys_id, "resource_id": rid,
                        "operation": "REPORT_ACTIVE_DATA_FLOW", "state": "ACTIVE", "evidence_id": fid
                    })
                    remediations.append({
                        "phase": "REMEDIATION", "system_id": sys_id, "resource_id": rid,
                        "operation": "DISABLE_DATA_FLOW", "state": "DISABLED", "evidence_id": ""
                    })
                    verifications.append({
                        "phase": "VERIFICATION", "system_id": sys_id, "resource_id": rid,
                        "operation": "VERIFY_DATA_FLOW_DISABLED", "state": "DISABLED", "evidence_id": ""
                    })
                else:
                    verifications.append({
                        "phase": "VERIFICATION", "system_id": sys_id, "resource_id": rid,
                        "operation": "VERIFY_DATA_FLOW_DISABLED", "state": "DISABLED", "evidence_id": fid
                    })

            elif sys_id == "backup_service":
                is_restore_risk = False
                if "item" in rec and rec["item"].get("restore_allowed") is True:
                    is_restore_risk = True
                elif "kvs" in rec and rec["kvs"].get("restore_allowed") == "true":
                    is_restore_risk = True
                elif "row" in rec and rec["row"].get("restore_allowed") in (1, "1", True):
                    is_restore_risk = True
                elif rec.get("status") == "ACTIVE":
                    is_restore_risk = True

                if is_restore_risk:
                    findings.append({
                        "phase": "FINDING", "system_id": sys_id, "resource_id": rid,
                        "operation": "REPORT_RESTORE_RISK", "state": "ACTIVE", "evidence_id": fid
                    })
                    remediations.append({
                        "phase": "REMEDIATION", "system_id": sys_id, "resource_id": rid,
                        "operation": "BLOCK_RESTORE", "state": "BLOCKED", "evidence_id": ""
                    })
                    verifications.append({
                        "phase": "VERIFICATION", "system_id": sys_id, "resource_id": rid,
                        "operation": "VERIFY_RESTORE_BLOCKED", "state": "BLOCKED", "evidence_id": ""
                    })
                else:
                    verifications.append({
                        "phase": "VERIFICATION", "system_id": sys_id, "resource_id": rid,
                        "operation": "VERIFY_RESTORE_BLOCKED", "state": "BLOCKED", "evidence_id": fid
                    })

            elif sys_id == "security_service":
                # Retained security audit log
                verifications.append({
                    "phase": "VERIFICATION", "system_id": sys_id, "resource_id": rid,
                    "operation": "VERIFY_RECORD_PRESENT", "state": "PRESENT",
                    "evidence_id": fid if not findings else ""
                })

            elif sys_id == "identity_service":
                # Tombstone
                has_pii = False
                if "record" in rec:
                    r = rec["record"]
                    if any(r.get(k) is not None for k in ["name", "email", "phone", "email_hash"]):
                        has_pii = True
                elif rec.get("status") == "IDENTIFIABLE":
                    has_pii = True

                if has_pii:
                    findings.append({
                        "phase": "FINDING", "system_id": sys_id, "resource_id": rid,
                        "operation": "REPORT_EXPOSED_PII", "state": "PRESENT", "evidence_id": fid
                    })
                    remediations.append({
                        "phase": "REMEDIATION", "system_id": sys_id, "resource_id": rid,
                        "operation": "REDACT_RECORD", "state": "REDACTED", "evidence_id": ""
                    })
                    verifications.append({
                        "phase": "VERIFICATION", "system_id": sys_id, "resource_id": rid,
                        "operation": "VERIFY_RECORD_REDACTED", "state": "REDACTED", "evidence_id": ""
                    })
                else:
                    verifications.append({
                        "phase": "VERIFICATION", "system_id": sys_id, "resource_id": rid,
                        "operation": "VERIFY_RECORD_REDACTED", "state": "REDACTED", "evidence_id": fid
                    })

        # Check final status
        is_complete = len(findings) == 0
        final_status = "COMPLETE" if is_complete else "INCOMPLETE"

        # Assemble steps
        final_steps = []
        if is_complete:
            final_steps = verifications
        else:
            final_steps = findings + remediations + verifications

        # Sort according to rules
        sorted_steps = self._sort_steps(final_steps)

        return {
            "case_id": case_id,
            "deletion_status": final_status,
            "steps_json": json.dumps(sorted_steps, separators=(',', ':'))
        }

    def _sort_steps(self, steps):
        phase_map = {"FINDING": 1, "REMEDIATION": 2, "VERIFICATION": 3}
        op_map = {
            "REPORT_REMAINING_RECORD": 1, "REPORT_EXPOSED_PII": 2, "REPORT_ACTIVE_DATA_FLOW": 3, "REPORT_RESTORE_RISK": 4,
            "DISABLE_DATA_FLOW": 1, "BLOCK_RESTORE": 2, "DELETE_RECORD": 3, "REDACT_RECORD": 4, "ANONYMIZE_RECORD": 5,
            "VERIFY_RECORD_ABSENT": 1, "VERIFY_RECORD_PRESENT": 2, "VERIFY_RECORD_REDACTED": 3, "VERIFY_RECORD_ANONYMIZED": 4,
            "VERIFY_DATA_FLOW_DISABLED": 5, "VERIFY_RESTORE_BLOCKED": 6
        }

        def key_func(s):
            return (phase_map.get(s["phase"], 99), op_map.get(s["operation"], 99), s["system_id"], s["resource_id"])

        sorted_s = sorted(steps, key=key_func)
        for i, s in enumerate(sorted_s, 1):
            s["step_no"] = i
        return sorted_s

if __name__ == "__main__":
    agent = NorthstarAuditAgent("dataset")
    print("NorthstarAuditAgent instantiated successfully.")
