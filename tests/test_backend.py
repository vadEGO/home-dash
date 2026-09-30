import datetime as dt
import importlib.util
import json
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('service',Path(__file__).parents[1]/'backend/service.py')
s=importlib.util.module_from_spec(spec);spec.loader.exec_module(s)

class BackendTests(unittest.TestCase):
    def test_failure_retains_data_and_original_timestamp(self):
        with tempfile.TemporaryDirectory() as directory:
            store=s.Store(directory)
            store.refresh('weather',lambda:{'as_of':'2020-01-01T00:00:00Z','temperature':22})
            first=store.snapshot()['providers']['weather']
            def fail(): raise ValueError('SECRET must not be exposed')
            store.refresh('weather',fail)
            cached=store.snapshot()['providers']['weather']
            self.assertEqual(first['data'],cached['data'])
            self.assertEqual(first['fetched_at'],cached['fetched_at'])
            self.assertEqual(cached['error'],'ValueError')
            store.db.close()
    def test_chart_requires_complete_recent_daily_history(self):
        now=time.time()
        points=[{'ts':dt.datetime.fromtimestamp(now-(8-i)*86400,s.UTC).isoformat(),'close':100+i} for i in range(8)]
        self.assertAlmostEqual(s.chart(points,now)['change'],7)
        self.assertEqual(s.chart(points[:-1],now)['values'],[])
        self.assertEqual(s.chart(points,now+3*86400)['values'],[])
        self.assertEqual(s.chart(points+[dict(points[0],close=500)],now)['values'],[])
    def test_missing_score_and_conflicts(self):
        result=s.normalize({'symbol':'BTC','total_score':None,'current_price':-1},[{'direction':'long'},{'direction':'short'}])
        self.assertIsNone(result['score']);self.assertIsNone(result['price']);self.assertTrue(result['conflict'])
    def test_detail_fields_preserve_values_and_missing_levels(self):
        row=dict(id='a',symbol='SOL',entry_min=112,entry_max=118,stop_loss=104,
                 take_profit_1=140,what_to_watch='Activity',invalidation='Support fails',
                 levels_freshness_status='stale',source_details=[{'source':'Report','author':'Analyst'}])
        opposite=dict(id='b',direction='short',thesis='Opposing case')
        result=s.normalize(row,[row,opposite])
        self.assertEqual(result['entry_min'],112)
        self.assertEqual(result['stop_loss'],104)
        self.assertIsNone(result['take_profit_3'])
        self.assertEqual(result['levels_freshness_status'],'stale')
        self.assertEqual(result['other_views'][0]['thesis'],'Opposing case')
        self.assertEqual(result['source_details'][0]['author'],'Analyst')
    def test_schema_extension_is_not_a_research_change_but_level_edit_is(self):
        with tempfile.TemporaryDirectory() as directory:
            store=s.Store(directory)
            a={'id':'a','symbol':'SOL','score':89,'bias':'LONG','entry_min':112}
            old=json.dumps([a.get(k) for k in ('id','score','bias','state','thesis','why_now','evidence_as_of')])
            store.db.execute('INSERT INTO changes VALUES (?,?,NULL)',('SOL',old))
            store.db.commit()
            store.refresh('market',lambda:{'ideas':[dict(a)],'assets':[]})
            self.assertIsNone(store.snapshot()['providers']['market']['data']['ideas'][0]['changed_at'])
            a['entry_min']=113
            store.refresh('market',lambda:{'ideas':[dict(a)],'assets':[]})
            self.assertIsNotNone(store.snapshot()['providers']['market']['data']['ideas'][0]['changed_at'])
            store.db.close()
    def test_primary_selection_matches_state_then_score(self):
        rows=[{'id':'a','action_state':'research','total_score':99},{'id':'b','action_state':'ready','total_score':80}]
        self.assertEqual(sorted(rows,key=s.primary_key)[0]['id'],'b')
    def test_current_ideas_require_all_freshness_fields(self):
        row=dict(actionability_status='actionable',current_price=1,price_as_of=s.stamp())
        row.update({k+'_freshness_status':'fresh' for k in ('evidence','price','levels','review')})
        self.assertTrue(s.current_idea(row,time.time()))
        row['levels_freshness_status']='stale'
        self.assertFalse(s.current_idea(row,time.time()))
    def test_baseline_and_export_do_not_count_as_changes(self):
        with tempfile.TemporaryDirectory() as directory:
            store=s.Store(directory)
            a={'id':'a','symbol':'SOL','score':89,'bias':'LONG','source_updated_at':'old'}
            store.refresh('market',lambda:{'ideas':[dict(a)],'assets':[]})
            self.assertIsNone(store.snapshot()['providers']['market']['data']['ideas'][0]['changed_at'])
            a['source_updated_at']='new'
            store.refresh('market',lambda:{'ideas':[dict(a)],'assets':[]})
            self.assertIsNone(store.snapshot()['providers']['market']['data']['ideas'][0]['changed_at'])
            a['score']=90
            store.refresh('market',lambda:{'ideas':[dict(a)],'assets':[]})
            self.assertIsNotNone(store.snapshot()['providers']['market']['data']['ideas'][0]['changed_at'])
            store.db.close()
    def test_adapter_paginates_and_preserves_missing_history(self):
        client=s.MoneyTrail(dict(supabase_url='https://example.com',supabase_publishable_key='x',watchlist=['SOL','BTC']))
        calls=[]
        def query(table,params):
            calls.append((table,params))
            if table=='market_candles': raise PermissionError()
            if params['offset']==0:return [dict(id=str(i),symbol='SOL',total_score=89,action_state='research') for i in range(500)]
            return []
        client.query=query
        result=client.load()
        self.assertEqual(len(result['assets']),2)
        self.assertEqual(result['assets'][0]['score'],89)
        self.assertEqual(result['assets'][0]['values'],[])
        self.assertIsNone(result['assets'][1]['score'])
        self.assertEqual(calls[1][1]['offset'],500)

if __name__=='__main__':unittest.main()
