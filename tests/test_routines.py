import sys
from pathlib import Path
import json
import tempfile
import unittest
from unittest.mock import patch
import datetime as dt
sys.path.insert(0,str(Path(__file__).parents[1]/'backend'))
from routines import next_due
from tasks import Tasks
class RoutinesTests(unittest.TestCase):
    def test_calendar_fixtures(self):
        for anchor,after,repeat,expected in json.loads((Path(__file__).parent/'recurrence-fixtures.json').read_text()):
            self.assertEqual(dt.datetime.fromisoformat(next_due(anchor,after,repeat)),dt.datetime.fromisoformat(expected.replace('Z','+00:00')))
    def test_recurring_done_retry_and_snooze_anchor(self):
        with tempfile.TemporaryDirectory() as root:
            tasks=Tasks(root)
            item=tasks.apply(dict(request_id='a',action='reminder_add',title='Bins',due_at='2026-10-01T20:00',repeat='weekly'))['item']
            tasks.apply(dict(request_id='s',action='reminder_snooze',id=item['id'],expected_revision=1,due_at='2026-10-01T21:00'))
            done=dict(request_id='d',action='reminder_done',id=item['id'],expected_revision=2)
            with patch('tasks.now',return_value='2026-10-01T11:00:00+00:00'):
                result=tasks.apply(done)
            self.assertEqual(result['item']['due_at'],'2026-10-08T09:00:00+00:00')
            self.assertEqual(result['item']['completed'],0)
            self.assertEqual(Tasks(root).apply(done),result)
            self.assertEqual(Tasks(root).snapshot()['items'][0]['repeat'],'weekly')
    def test_quantity_category_validation_and_conflict(self):
        with tempfile.TemporaryDirectory() as root:
            tasks=Tasks(root);item=tasks.apply(dict(request_id='a',action='shopping_add',title='Milk',quantity=2,category='Dairy'))['item']
            op=dict(request_id='b',action='shopping_update',id=item['id'],expected_revision=1,quantity=3)
            self.assertEqual(tasks.apply(op)['item']['quantity'],3)
            self.assertEqual(tasks.apply(dict(op,request_id='c'))['status'],'conflict')
            with self.assertRaises(ValueError):tasks.apply(dict(op,request_id='d',expected_revision=2,quantity=0))
            saved=Tasks(root).snapshot()['items'][0];self.assertEqual(saved['quantity'],3);self.assertEqual(saved['category'],'Dairy')
