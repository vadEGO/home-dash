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
