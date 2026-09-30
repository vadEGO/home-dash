#!/usr/bin/env python3
"""Persistent reminders/shopping shared by the local Hermes CLI and HTTPS service."""
from contextlib import contextmanager
import argparse
import datetime as dt
import json
import os
from pathlib import Path
import sqlite3
import uuid
from zoneinfo import ZoneInfo

UTC = dt.timezone.utc
SYDNEY = ZoneInfo('Australia/Sydney')

def due_time(value):
    if not isinstance(value, str) or len(value) < 16 or not ('T' in value or ' ' in value):
        raise ValueError('due_at must be an ISO date/time')
    value = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
    if value.tzinfo is None:
        candidates = {value.replace(tzinfo=SYDNEY, fold=fold).astimezone(UTC)
                      for fold in (0, 1)
                      if value.replace(tzinfo=SYDNEY, fold=fold).astimezone(UTC).astimezone(SYDNEY).replace(tzinfo=None) == value}
        if len(candidates) != 1:
            raise ValueError('Sydney time is ambiguous or nonexistent; specify an explicit UTC offset')
        value = candidates.pop()
    return value.astimezone(UTC).isoformat()

def now():
    return dt.datetime.now(UTC).isoformat()

class Tasks:
    def __init__(self, root):
        self.path = Path(root)/'tasks.sqlite'
        with self.connect() as db:
            db.executescript('''
                CREATE TABLE IF NOT EXISTS items(id TEXT PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL,
                  due_at TEXT, completed INTEGER NOT NULL DEFAULT 0, revision INTEGER NOT NULL DEFAULT 1,
                  created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS operations(id TEXT PRIMARY KEY, request TEXT NOT NULL, result TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS meta(id INTEGER PRIMARY KEY, instance TEXT NOT NULL);
            ''')
            db.execute('INSERT OR IGNORE INTO meta VALUES (1,?)', (str(uuid.uuid4()),))
    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=15)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()
    def snapshot(self):
        with self.connect() as db:
            return dict(instance=db.execute('SELECT instance FROM meta WHERE id=1').fetchone()[0],
                items=[dict(r) for r in db.execute('SELECT * FROM items WHERE completed=0 OR id IN (SELECT id FROM items WHERE completed=1 ORDER BY updated_at DESC LIMIT 100) ORDER BY created_at,id')])
    def apply(self, operation):
        if not isinstance(operation, dict):
            raise ValueError('Operation must be an object')
        request_id = operation.get('request_id')
        if not isinstance(request_id, str) or not 1 <= len(request_id) <= 200:
            raise ValueError('A stable request_id is required')
        request = json.dumps(operation, sort_keys=True, allow_nan=False)
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            old = db.execute('SELECT request,result FROM operations WHERE id=?', (request_id,)).fetchone()
            if old:
                if old['request'] != request:
                    raise ValueError('request_id was already used for a different operation')
                return json.loads(old['result'])
            action = operation.get('action')
            if action in ('reminder_add', 'shopping_add'):
                title = operation.get('title')
                if not isinstance(title, str) or not 1 <= len(title.strip()) <= 300:
                    raise ValueError('title must contain 1–300 characters')
                title = ' '.join(title.split())
                kind = 'reminder' if action == 'reminder_add' else 'shopping'
                due = due_time(operation.get('due_at')) if kind == 'reminder' else None
                # Deduplicate currently unchecked shopping items, including case/space differences.
                found = next((r for r in db.execute("SELECT * FROM items WHERE kind='shopping' AND completed=0")
                              if r['title'].casefold() == title.casefold()), None) if kind == 'shopping' else None
                if found:
                    item_id = found['id']
                else:
                    if db.execute('SELECT count(*) FROM items WHERE completed=0').fetchone()[0] >= 500:
                        raise ValueError('Active item limit reached')
                    item_id = str(uuid.uuid4())
                    db.execute('INSERT INTO items VALUES (?,?,?,?,0,1,?,?)', (item_id, kind, title, due, now(), now()))
                result = dict(request_id=request_id, status='ok', item=dict(db.execute('SELECT * FROM items WHERE id=?', (item_id,)).fetchone()))
            elif action in ('reminder_done', 'reminder_snooze', 'shopping_set'):
                row = db.execute('SELECT * FROM items WHERE id=?', (operation.get('id'),)).fetchone()
                expected = operation.get('expected_revision')
                if not row:
                    result = dict(request_id=request_id, status='missing')
                elif type(expected) is not int or expected != row['revision']:
                    result = dict(request_id=request_id, status='conflict', item=dict(row))
                else:
                    due, complete = row['due_at'], row['completed']
                    if action == 'shopping_set':
                        if row['kind'] != 'shopping' or type(operation.get('completed')) is not bool:
                            raise ValueError('shopping_set needs a shopping item and boolean completed')
                        complete = int(operation['completed'])
                        if not complete and any(r['id'] != row['id'] and r['title'].casefold() == row['title'].casefold()
                            for r in db.execute("SELECT * FROM items WHERE kind='shopping' AND completed=0")):
                            raise ValueError('An unchecked shopping item with this title already exists')
                    else:
                        if row['kind'] != 'reminder':
                            raise ValueError('Not a reminder')
                        if action == 'reminder_done':
                            complete = 1
                        else:
                            if complete:
                                raise ValueError('Completed reminders cannot be snoozed')
                            due = due_time(operation.get('due_at'))
                    db.execute('UPDATE items SET due_at=?,completed=?,revision=revision+1,updated_at=? WHERE id=?', (due, complete, now(), row['id']))
                    result = dict(request_id=request_id, status='ok', item=dict(db.execute('SELECT * FROM items WHERE id=?', (row['id'],)).fetchone()))
            else:
                raise ValueError('Unsupported action')
            db.execute('INSERT INTO operations VALUES (?,?,?)', (request_id, request, json.dumps(result)))
            return result

if __name__ == '__main__':
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--state', required=True)
    parser.add_argument('--request', help='JSON operation file; omit to list current items')
    args = parser.parse_args()
    tasks = Tasks(args.state)
    try:
        result = tasks.apply(json.loads(Path(args.request).read_text())) if args.request else tasks.snapshot()
        print(json.dumps(result, indent=2))
        if result.get('status') in ('conflict', 'missing'):
            raise SystemExit(2)
    except ValueError as exc:
        parser.exit(2, str(exc)+'\n')
