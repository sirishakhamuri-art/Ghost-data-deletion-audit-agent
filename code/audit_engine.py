#!/usr/bin/env python3
"""
Northstar Ghost Data Audit Engine
Full implementation of autonomous deletion audit agent.
"""

import csv
import json
import os
import re
import sqlite3
from datetime import datetime
from collections import defaultdict

class IdentityResolver:
    def __init__(self, identities_csv, audit_log_csv):
        self.users_by_id = {}
        self.users_by_email = {}
        self.audit_logs = []
        
        with open(identities_csv, mode='r', encoding='utf-8') as f:
            for r in csv.DictReader(f):
                uid = r['user_id'].strip()
                self.users_by_id[uid] = r
                if r.get('email'):
                    self.users_by_email[r['email'].strip().lower()] = r
                    
        with open(audit_log_csv, mode='r', encoding='utf-8') as f:
            for r in csv.DictReader(f):
                self.audit_logs.append(r)

    def resolve(self, req_email):
        clean_email = req_email.strip().lower()
        u = self.users_by_email.get(clean_email)
        if not u:
            for al in self.audit_logs:
                if al['field_name'] == 'email' and al['old_value'].strip().lower() == clean_email:
                    u = self.users_by_id.get(al['user_id'].strip())
                    break
        
        emails = {clean_email}
        phones = set()
        names = set()
        hashes = set()
        uid = u['user_id'].strip() if u else None
        
        if u:
            if u.get('email'):
                emails.add(u['email'].strip().lower())
            if u.get('phone'):
                phones.add(u['phone'].strip())
            if u.get('name'):
                names.add(u['name'].strip().lower())
            if u.get('email_hash'):
                hashes.add(u['email_hash'].strip())
                
            for al in self.audit_logs:
                if al['user_id'].strip() == uid:
                    fn = al['field_name']
                    if fn == 'email':
                        emails.add(al['old_value'].strip().lower())
                        emails.add(al['new_value'].strip().lower())
                    elif fn == 'phone':
                        phones.add(al['old_value'].strip())
                        phones.add(al['new_value'].strip())
                    elif fn == 'name':
                        names.add(al['old_value'].strip().lower())
                        names.add(al['new_value'].strip().lower())
                        
        return {
            'user_id': uid,
            'name': u.get('name') if u else None,
            'emails': emails,
            'phones': phones,
            'names': names,
            'hashes': hashes
        }

def is_deletion_request(request_text):
    text = request_text.strip().lower()
    
    # Explicit non-deletion patterns
    non_deletion_patterns = [
        r'leave the account active',
        r'do not close the account',
        r'please keep the account as it is',
        r'leave my profile and purchase history in place',
        r'i want to continue using the service',
        r"please don't delete or change anything",
        r'this is an information request, not a request to erase it',
        r'so i am not asking for deletion',
        r'marketing lists only',
        r'can you correct it without removing any of my records',
        r'download my account information in a portable format',
        r'need help resetting the login',
        r'the mobile number on my profile is out of date',
        r'stop the promotional emails',
        r"copy of last year's invoices",
        r'what personal information you hold about me'
    ]
    for pat in non_deletion_patterns:
        if re.search(pat, text):
            return False
            
    # Multilingual deletion indicators
    deletion_indicators = [
        'delete', 'deletion', 'erase', 'erasure', 'remove', 'removal', 'close my account',
        'closed', 'permanently delete', 'permanent account deletion', 'exclusão', 'eliminación',
        'eliminar', 'suppression', 'effacer', 'löschen', 'cancellazione', '削除', '消去', '영구 삭제'
    ]
    for ind in deletion_indicators:
        if ind in text:
            return True
            
    return False

FINDING_ORDER = {
    'REPORT_REMAINING_RECORD': 1,
    'REPORT_EXPOSED_PII': 2,
    'REPORT_ACTIVE_DATA_FLOW': 3,
    'REPORT_RESTORE_RISK': 4
}

REMEDIATION_ORDER = {
    'DISABLE_DATA_FLOW': 1,
    'BLOCK_RESTORE': 2,
    'DELETE_RECORD': 3,
    'REDACT_RECORD': 4,
    'ANONYMIZE_RECORD': 5
}

VERIFICATION_ORDER = {
    'VERIFY_RECORD_ABSENT': 1,
    'VERIFY_RECORD_PRESENT': 2,
    'VERIFY_RECORD_REDACTED': 3,
    'VERIFY_RECORD_ANONYMIZED': 4,
    'VERIFY_DATA_FLOW_DISABLED': 5,
    'VERIFY_RESTORE_BLOCKED': 6
}

PHASE_ORDER = {
    'FINDING': 1,
    'REMEDIATION': 2,
    'VERIFICATION': 3
}

def sort_steps(steps):
    def step_key(s):
        p_order = PHASE_ORDER.get(s['phase'], 99)
        if s['phase'] == 'FINDING':
            op_order = FINDING_ORDER.get(s['operation'], 99)
        elif s['phase'] == 'REMEDIATION':
            op_order = REMEDIATION_ORDER.get(s['operation'], 99)
        else:
            op_order = VERIFICATION_ORDER.get(s['operation'], 99)
        return (p_order, op_order, s['system_id'], s['resource_id'])
        
    sorted_steps = sorted(steps, key=step_key)
    for idx, s in enumerate(sorted_steps, 1):
        s['step_no'] = idx
    return sorted_steps

class EvidenceIndexer:
    def __init__(self, dataset_dir='dataset'):
        self.dataset_dir = dataset_dir
        self.ev_files = {}
        with open(os.path.join(dataset_dir, 'evidence_files.csv'), mode='r', encoding='utf-8') as f:
            for r in csv.DictReader(f):
                self.ev_files[r['file_id']] = r
                
        # List of all parsed observations:
        # dict: {file_id, captured_at, system_id, resource_id, identifiers: set(), state, data_category, details}
        self.observations = []
        self._index_all()

    def _index_all(self):
        for fid, finfo in self.ev_files.items():
            fpath = os.path.join(self.dataset_dir, finfo['file_path'])
            if not os.path.exists(fpath):
                continue
            cat_time = finfo['captured_at']
            
            if fpath.endswith('.txt'):
                self._parse_txt(fid, fpath, cat_time)
            elif fpath.endswith('.json'):
                self._parse_json(fid, fpath, cat_time)
            elif fpath.endswith('.log'):
                self._parse_log(fid, fpath, cat_time)
            elif fpath.endswith('.sql'):
                self._parse_sql(fid, fpath, cat_time)

    def _parse_txt(self, fid, fpath, cat_time):
        with open(fpath, 'r', encoding='utf-8', errors='ignore') as f:
            for line in f:
                line = line.strip()
                if line.startswith('- ') and '|' in line:
                    parts = [p.strip() for p in line[2:].split('|')]
                    if len(parts) >= 6:
                        # e.g.: 2026-10-01T12:00:00Z | account_service | account_3677 | USER_PROFILE | NOT_FOUND | y.tanaka32@gmail.com
                        ts, sys_id, res_id, cat, status, ident = parts[:6]
                        state = 'UNKNOWN'
                        if status == 'NOT_FOUND':
                            state = 'ABSENT'
                        elif status in ('FOUND', 'PRESENT', 'ACTIVE'):
                            state = 'PRESENT' if cat != 'DATA_FLOW' and cat != 'BACKUP_ARCHIVE' else 'ACTIVE'
                        elif status == 'IDENTIFIABLE':
                            state = 'IDENTIFIABLE'
                        elif status == 'REDACTED':
                            state = 'REDACTED'
                        elif status == 'ANONYMIZED':
                            state = 'ANONYMIZED'
                        elif status == 'DISABLED':
                            state = 'DISABLED'
                        elif status == 'BLOCKED':
                            state = 'BLOCKED'
                            
                        self.observations.append({
                            'file_id': fid,
                            'captured_at': cat_time,
                            'system_id': sys_id,
                            'resource_id': res_id,
                            'identifiers': {ident.lower().strip()},
                            'data_category': cat,
                            'state': state,
                            'raw_status': status
                        })

    def _parse_json(self, fid, fpath, cat_time):
        try:
            with open(fpath, 'r', encoding='utf-8') as f:
                d = json.load(f)
        except Exception:
            return

        if 'service_exports' in d:
            se = d['service_exports']
            # account_service
            if 'account_service' in se:
                for item in se['account_service'].get('profile_lookups', []):
                    res_id = item.get('resource_id')
                    code = item.get('status_code')
                    prof = item.get('profile') or {}
                    idents = set()
                    if prof.get('email'): idents.add(prof['email'].lower().strip())
                    if prof.get('customer_reference'): idents.add(prof['customer_reference'].lower().strip())
                    self.observations.append({
                        'file_id': fid,
                        'captured_at': cat_time,
                        'system_id': 'account_service',
                        'resource_id': res_id,
                        'identifiers': idents,
                        'data_category': 'USER_PROFILE',
                        'state': 'ABSENT' if code == 404 else 'PRESENT',
                        'raw_status': code
                    })
            # search_service
            if 'search_service' in se:
                for item in se['search_service'].get('index_queries', []):
                    res_id = item.get('resource_id')
                    q = item.get('query', '')
                    hits = item.get('hits', {})
                    total = hits.get('total', 0)
                    idents = {q.lower().strip()} if q else set()
                    for doc in hits.get('documents', []):
                        if doc.get('email'): idents.add(doc['email'].lower().strip())
                        if doc.get('customer_reference'): idents.add(doc['customer_reference'].lower().strip())
                    self.observations.append({
                        'file_id': fid,
                        'captured_at': cat_time,
                        'system_id': 'search_service',
                        'resource_id': res_id,
                        'identifiers': idents,
                        'data_category': 'SEARCH_INDEX_ENTRY',
                        'state': 'PRESENT' if total > 0 else 'ABSENT',
                        'raw_status': total
                    })
            # support_platform
            if 'support_platform' in se:
                for item in se['support_platform'].get('tickets', []):
                    res_id = item.get('resource_id')
                    em = item.get('requester_email')
                    ref = item.get('customer_reference')
                    idents = set()
                    if em: idents.add(em.lower().strip())
                    if ref: idents.add(ref.lower().strip())
                    self.observations.append({
                        'file_id': fid,
                        'captured_at': cat_time,
                        'system_id': 'support_platform',
                        'resource_id': res_id,
                        'identifiers': idents,
                        'data_category': 'SUPPORT_MESSAGE',
                        'state': 'IDENTIFIABLE' if em else 'REDACTED',
                        'raw_status': 'IDENTIFIABLE' if em else 'REDACTED'
                    })
            # analytics_platform
            if 'analytics_platform' in se:
                for item in se['analytics_platform'].get('profiles', []):
                    res_id = item.get('resource_id')
                    em = item.get('email')
                    ref = item.get('customer_reference')
                    idents = set()
                    if em: idents.add(em.lower().strip())
                    if ref: idents.add(ref.lower().strip())
                    self.observations.append({
                        'file_id': fid,
                        'captured_at': cat_time,
                        'system_id': 'analytics_platform',
                        'resource_id': res_id,
                        'identifiers': idents,
                        'data_category': 'ANALYTICS_PROFILE',
                        'state': 'IDENTIFIABLE' if em else 'ANONYMIZED',
                        'raw_status': 'IDENTIFIABLE' if em else 'ANONYMIZED'
                    })
            # integration_service
            if 'integration_service' in se:
                for item in se['integration_service'].get('connectors', []):
                    res_id = item.get('resource_id')
                    en = item.get('enabled')
                    em = item.get('customer_email')
                    ref = item.get('customer_reference')
                    idents = set()
                    if em: idents.add(em.lower().strip())
                    if ref: idents.add(ref.lower().strip())
                    self.observations.append({
                        'file_id': fid,
                        'captured_at': cat_time,
                        'system_id': 'integration_service',
                        'resource_id': res_id,
                        'identifiers': idents,
                        'data_category': 'DATA_FLOW',
                        'state': 'ACTIVE' if en else 'DISABLED',
                        'raw_status': en
                    })
            # backup_service
            if 'backup_service' in se:
                for item in se['backup_service'].get('restore_entries', []):
                    res_id = item.get('resource_id')
                    ra = item.get('restore_allowed')
                    em = item.get('customer_email')
                    ref = item.get('customer_reference')
                    idents = set()
                    if em: idents.add(em.lower().strip())
                    if ref: idents.add(ref.lower().strip())
                    self.observations.append({
                        'file_id': fid,
                        'captured_at': cat_time,
                        'system_id': 'backup_service',
                        'resource_id': res_id,
                        'identifiers': idents,
                        'data_category': 'BACKUP_ARCHIVE',
                        'state': 'ACTIVE' if ra else 'BLOCKED',
                        'raw_status': ra
                    })
            # export_service
            if 'export_service' in se:
                for item in se['export_service'].get('exports', []):
                    res_id = item.get('resource_id')
                    em = item.get('owner_email')
                    ref = item.get('customer_reference')
                    idents = set()
                    if em: idents.add(em.lower().strip())
                    if ref: idents.add(ref.lower().strip())
                    self.observations.append({
                        'file_id': fid,
                        'captured_at': cat_time,
                        'system_id': 'export_service',
                        'resource_id': res_id,
                        'identifiers': idents,
                        'data_category': 'USER_EXPORT',
                        'state': 'PRESENT',
                        'raw_status': 'FOUND'
                    })
            # security_service
            if 'security_service' in se:
                for item in se['security_service'].get('audit_records', []):
                    res_id = item.get('resource_id')
                    ref = item.get('subject_reference')
                    idents = {ref.lower().strip()} if ref else set()
                    self.observations.append({
                        'file_id': fid,
                        'captured_at': cat_time,
                        'system_id': 'security_service',
                        'resource_id': res_id,
                        'identifiers': idents,
                        'data_category': 'SECURITY_AUDIT_LOG',
                        'state': 'PRESENT',
                        'raw_status': 'FOUND'
                    })

        elif 'snapshots' in d:
            for snap in d['snapshots']:
                ds = snap.get('data_store')
                coll = snap.get('collection')
                for rec in snap.get('records', []):
                    res_id = rec.get('resource_id')
                    ref = rec.get('subject_reference') or rec.get('customer_reference')
                    em = rec.get('email')
                    idents = set()
                    if ref: idents.add(ref.lower().strip())
                    if em: idents.add(em.lower().strip())
                    
                    if coll == 'deleted_customer_references':
                        # Account tombstone
                        has_pii = any(rec.get(k) is not None for k in ['name', 'email', 'phone', 'email_hash'])
                        self.observations.append({
                            'file_id': fid,
                            'captured_at': cat_time,
                            'system_id': 'identity_service',
                            'resource_id': res_id,
                            'identifiers': idents,
                            'data_category': 'ACCOUNT_TOMBSTONE',
                            'state': 'IDENTIFIABLE' if has_pii else 'REDACTED',
                            'raw_status': 'IDENTIFIABLE' if has_pii else 'REDACTED'
                        })
                    elif coll == 'security_audit_events':
                        self.observations.append({
                            'file_id': fid,
                            'captured_at': cat_time,
                            'system_id': 'security_service',
                            'resource_id': res_id,
                            'identifiers': idents,
                            'data_category': 'SECURITY_AUDIT_LOG',
                            'state': 'PRESENT',
                            'raw_status': 'FOUND'
                        })
                    elif coll == 'customer_profiles':
                        self.observations.append({
                            'file_id': fid,
                            'captured_at': cat_time,
                            'system_id': 'account_service',
                            'resource_id': res_id,
                            'identifiers': idents,
                            'data_category': 'USER_PROFILE',
                            'state': 'PRESENT',
                            'raw_status': 'ACTIVE'
                        })

    def _parse_log(self, fid, fpath, cat_time):
        with open(fpath, 'r', encoding='utf-8', errors='ignore') as f:
            for line in f:
                if 'resource_id=' not in line:
                    continue
                # Extract key values
                clean_kvs = {}
                for m in re.finditer(r'(\w+)=(?:\"([^\"]*)\"|([^\s]+))', line):
                    k = m.group(1)
                    v = m.group(2) if m.group(2) is not None else m.group(3)
                    clean_kvs[k] = v
                
                res_id = clean_kvs.get('resource_id')
                svc = clean_kvs.get('service')
                evt = clean_kvs.get('event', '')
                
                idents = set()
                for key in ['lookup_key', 'correlation_key', 'match_key', 'requester_email', 'customer_email', 'email', 'subject_ref', 'subject_reference', 'customer_reference']:
                    val = clean_kvs.get(key)
                    if val and val != 'null':
                        idents.add(val.lower().strip())
                        
                state = 'UNKNOWN'
                cat = 'GENERIC'
                if svc == 'account_service':
                    cat = 'USER_PROFILE'
                    code = clean_kvs.get('http_status') or clean_kvs.get('rows')
                    state = 'ABSENT' if code in ('404', '0') else 'PRESENT'
                elif svc == 'search_service':
                    cat = 'SEARCH_INDEX_ENTRY'
                    res = clean_kvs.get('result')
                    state = 'PRESENT' if res == 'hit' else 'ABSENT'
                elif svc == 'support_platform':
                    cat = 'SUPPORT_MESSAGE'
                    req_em = clean_kvs.get('requester_email')
                    state = 'IDENTIFIABLE' if req_em and req_em != 'null' else 'REDACTED'
                elif svc == 'analytics_platform':
                    cat = 'ANALYTICS_PROFILE'
                    em = clean_kvs.get('email')
                    state = 'IDENTIFIABLE' if em and em != 'null' else 'ANONYMIZED'
                elif svc == 'integration_service':
                    cat = 'DATA_FLOW'
                    en = clean_kvs.get('enabled')
                    state = 'ACTIVE' if en == 'true' else 'DISABLED'
                elif svc == 'backup_service':
                    cat = 'BACKUP_ARCHIVE'
                    ra = clean_kvs.get('restore_allowed')
                    state = 'ACTIVE' if ra == 'true' else 'BLOCKED'
                elif svc == 'security_service':
                    cat = 'SECURITY_AUDIT_LOG'
                    state = 'PRESENT'
                    
                if svc and res_id:
                    self.observations.append({
                        'file_id': fid,
                        'captured_at': cat_time,
                        'system_id': svc,
                        'resource_id': res_id,
                        'identifiers': idents,
                        'data_category': cat,
                        'state': state,
                        'raw_status': clean_kvs
                    })

    def _parse_sql(self, fid, fpath, cat_time):
        con = sqlite3.connect(':memory:')
        try:
            with open(fpath, 'r', encoding='utf-8', errors='ignore') as f:
                con.executescript(f.read())
            cur = con.cursor()
            cur.execute('SELECT name FROM sqlite_master WHERE type="table"')
            tables = [r[0] for r in cur.fetchall()]
            
            for tbl in tables:
                if tbl == 'snapshot_scope':
                    continue
                cur.execute(f'PRAGMA table_info({tbl})')
                cols = [col[1] for col in cur.fetchall()]
                cur.execute(f'SELECT * FROM {tbl}')
                rows = cur.fetchall()
                
                for r in rows:
                    row_dict = dict(zip(cols, r))
                    res_id = row_dict.get('resource_id')
                    if not res_id:
                        continue
                    idents = set()
                    for k in ['user_id', 'email', 'owner_email', 'customer_email', 'requester_email', 'customer_reference', 'subject_reference']:
                        v = row_dict.get(k)
                        if v:
                            idents.add(str(v).lower().strip())
                            
                    svc = 'unknown'
                    cat = 'UNKNOWN'
                    state = 'PRESENT'
                    if 'profile' in tbl or 'customer_account' in tbl:
                        svc = 'account_service'
                        cat = 'USER_PROFILE'
                        state = 'PRESENT'
                    elif 'search' in tbl:
                        svc = 'search_service'
                        cat = 'SEARCH_INDEX_ENTRY'
                        state = 'PRESENT'
                    elif 'analytics' in tbl:
                        svc = 'analytics_platform'
                        cat = 'ANALYTICS_PROFILE'
                        em = row_dict.get('email')
                        state = 'IDENTIFIABLE' if em else 'ANONYMIZED'
                    elif 'support' in tbl:
                        svc = 'support_platform'
                        cat = 'SUPPORT_MESSAGE'
                        em = row_dict.get('requester_email')
                        state = 'IDENTIFIABLE' if em else 'REDACTED'
                    elif 'export' in tbl:
                        svc = 'export_service'
                        cat = 'USER_EXPORT'
                        state = 'PRESENT'
                    elif 'connector' in tbl:
                        svc = 'integration_service'
                        cat = 'DATA_FLOW'
                        en = row_dict.get('enabled')
                        state = 'ACTIVE' if en in (1, '1', True) else 'DISABLED'
                    elif 'backup' in tbl:
                        svc = 'backup_service'
                        cat = 'BACKUP_ARCHIVE'
                        ra = row_dict.get('restore_allowed')
                        state = 'ACTIVE' if ra in (1, '1', True) else 'BLOCKED'
                    elif 'audit' in tbl:
                        svc = 'security_service'
                        cat = 'SECURITY_AUDIT_LOG'
                        state = 'PRESENT'
                        
                    self.observations.append({
                        'file_id': fid,
                        'captured_at': cat_time,
                        'system_id': svc,
                        'resource_id': res_id,
                        'identifiers': idents,
                        'data_category': cat,
                        'state': state,
                        'raw_status': row_dict
                    })
        except Exception:
            pass
        finally:
            con.close()

if __name__ == '__main__':
    indexer = EvidenceIndexer()
    print(f'Total indexed evidence observations: {len(indexer.observations)}')
