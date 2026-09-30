import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor

spec=importlib.util.spec_from_file_location('tasks',Path(__file__).parents[1]/'backend/tasks.py')
t=importlib.util.module_from_spec(spec);spec.loader.exec_module(t)

class TaskTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.tasks=t.Tasks(self.temp.name)
    def tearDown(self):self.temp.cleanup()
    def test_phone_add_then_complete_uses_stable_item_id(self):
        op=dict(request_id='request-add',id='phone-12345678901',action='shopping_add',title='Bread')
        result=self.tasks.apply(op)
        self.assertEqual(result['item']['id'],op['id'])
        done=self.tasks.apply(dict(request_id='request-done',action='shopping_set',id=op['id'],expected_revision=1,completed=True))
        self.assertEqual(done['item']['completed'],1)
        self.assertEqual(self.tasks.apply(op)['item']['id'],op['id'])
        with self.assertRaises(ValueError):self.tasks.apply(dict(op,request_id='different',title='Eggs'))
    def test_delete_hides_both_kinds_and_retry_cannot_resurrect(self):
        for kind in ('shopping','reminder'):
            item=self.tasks.apply(dict(request_id=kind+'-add',action=kind+'_add',title='Delete me',due_at='2026-10-01T20:00'))['item']
            op=dict(request_id=kind+'-delete',action='item_delete',id=item['id'],expected_revision=1)
            self.assertEqual(self.tasks.apply(op)['status'],'ok')
            self.assertEqual(self.tasks.apply(op)['status'],'ok')
            self.assertNotIn(item['id'],[i['id'] for i in t.Tasks(self.temp.name).snapshot()['items']])
            stale=dict(request_id=kind+'-stale',action='item_delete',id=item['id'],expected_revision=2)
            self.assertEqual(self.tasks.apply(stale)['status'],'missing')
        replacement=self.tasks.apply(dict(request_id='readd',action='shopping_add',title='Delete me'))
        self.assertEqual(replacement['item']['completed'],0)
    def test_delete_checks_revision_before_hiding(self):
        item=self.tasks.apply(dict(request_id='add',action='shopping_add',title='Milk'))['item']
        result=self.tasks.apply(dict(request_id='del',action='item_delete',id=item['id'],expected_revision=99))
        self.assertEqual(result['status'],'conflict')
        self.assertEqual(len(self.tasks.snapshot()['items']),1)
    def test_sydney_time_and_dst(self):
        self.assertEqual(t.due_time('2026-09-30T20:00:00'),'2026-09-30T10:00:00+00:00')
        self.assertEqual(t.due_time('2026-12-01T20:00:00'),'2026-12-01T09:00:00+00:00')
        for value in ('2026-10-04T02:30:00','2027-04-04T02:30:00'):
            with self.assertRaises(ValueError):t.due_time(value)
    def test_request_retries_persist_and_cannot_change_meaning(self):
        op=dict(request_id='telegram:1',action='reminder_add',title='Bins',due_at='2026-09-30T20:00:00')
        first=self.tasks.apply(op)
        self.assertEqual(t.Tasks(self.temp.name).apply(op),first)
        self.assertEqual(len(self.tasks.snapshot()['items']),1)
        with self.assertRaises(ValueError):self.tasks.apply(dict(op,title='Different'))
    def test_concurrent_shopping_deduplication(self):
        def add(i):return t.Tasks(self.temp.name).apply(dict(request_id=str(i),action='shopping_add',title='  Milk  ' if i%2 else 'milk'))
        with ThreadPoolExecutor(max_workers=4) as pool:rows=list(pool.map(add,range(8)))
        self.assertEqual(len({r['item']['id'] for r in rows}),1)
    def test_check_undo_and_conflict(self):
        item=self.tasks.apply(dict(request_id='add',action='shopping_add',title='Eggs'))['item']
        op=dict(request_id='check',action='shopping_set',id=item['id'],expected_revision=1,completed=True)
        self.assertEqual(self.tasks.apply(op)['item']['completed'],1)
        self.assertEqual(self.tasks.apply(op)['item']['revision'],2)
        self.assertEqual(self.tasks.apply(dict(op,request_id='stale',completed=False))['status'],'conflict')
        undone=self.tasks.apply(dict(op,request_id='undo',expected_revision=2,completed=False))
        self.assertEqual(undone['item']['completed'],0)
    def test_snooze_then_complete_persists(self):
        item=self.tasks.apply(dict(request_id='add',action='reminder_add',title='Call',due_at='2026-09-30T10:00:00Z'))['item']
        op=dict(request_id='snooze',action='reminder_snooze',id=item['id'],expected_revision=1,due_at='2026-09-30T10:10:00Z')
        self.assertEqual(self.tasks.apply(op)['item']['due_at'],'2026-09-30T10:10:00+00:00')
        done=self.tasks.apply(dict(request_id='done',action='reminder_done',id=item['id'],expected_revision=2))
        self.assertEqual(done['item']['completed'],1)
        self.assertEqual(t.Tasks(self.temp.name).snapshot()['items'][0]['completed'],1)
    def test_undo_does_not_duplicate_readded_item(self):
        item=self.tasks.apply(dict(request_id='a',action='shopping_add',title='Milk'))['item']
        self.tasks.apply(dict(request_id='b',action='shopping_set',id=item['id'],expected_revision=1,completed=True))
        self.tasks.apply(dict(request_id='c',action='shopping_add',title='milk'))
        with self.assertRaises(ValueError):self.tasks.apply(dict(request_id='d',action='shopping_set',id=item['id'],expected_revision=2,completed=False))

if __name__=='__main__':unittest.main()
