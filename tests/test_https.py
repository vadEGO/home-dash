import importlib.util
import json
from pathlib import Path
import secrets
import socket
import ssl
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.error
import urllib.request

ROOT=Path(__file__).parents[1]

class HTTPSTests(unittest.TestCase):
    def test_auth_and_certificate_validation(self):
        with tempfile.TemporaryDirectory() as directory:
            state=Path(directory)
            with socket.socket() as sock:
                sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
            (state/'config.json').write_text(json.dumps({'bind':'127.0.0.1','port':port,'watchlist':[]}))
            token=secrets.token_urlsafe(32);(state/'device-token').write_text(token)
            subprocess.run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-days','1','-keyout',str(state/'server.key'),'-out',str(state/'server.crt'),'-subj','/CN=localhost'],check=True,capture_output=True)
            process=subprocess.Popen([sys.executable,str(ROOT/'backend/service.py'),'--state',str(state)],stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
            try:
                context=ssl.create_default_context(cafile=str(state/'server.crt'))
                url=f'https://localhost:{port}'
                for _ in range(100):
                    try:
                        with urllib.request.urlopen(url+'/health',context=context,timeout=.2) as response:
                            self.assertEqual(json.load(response)['status'],'running');break
                    except (OSError,urllib.error.URLError):time.sleep(.05)
                else:self.fail('Server did not start')
                for supplied in ('','wrong-token'):
                    request=urllib.request.Request(url+'/v1/dashboard',headers={'Authorization':'Bearer '+supplied})
                    with self.assertRaises(urllib.error.HTTPError) as error:urllib.request.urlopen(request,context=context)
                    self.assertEqual(error.exception.code,401)
                request=urllib.request.Request(url+'/v1/dashboard',headers={'Authorization':'Bearer '+token})
                with urllib.request.urlopen(request,context=context) as response:
                    self.assertEqual(json.load(response)['version'],1)
                with self.assertRaises(urllib.error.URLError):urllib.request.urlopen(request,context=ssl.create_default_context())
                operation=state/'operation.json'
                operation.write_text(json.dumps(dict(request_id='telegram-test',action='shopping_add',title='Milk')))
                created=json.loads(subprocess.check_output([sys.executable,str(ROOT/'backend/tasks.py'),'--state',str(state),'--request',str(operation)]))
                action=json.dumps(dict(request_id='phone-test',action='shopping_set',id=created['item']['id'],expected_revision=1,completed=True)).encode()
                rejected=urllib.request.Request(url+'/v1/actions',data=action,headers={'Content-Type':'application/json'})
                with self.assertRaises(urllib.error.HTTPError) as error:urllib.request.urlopen(rejected,context=context)
                self.assertEqual(error.exception.code,401)
                creation=json.dumps(dict(request_id='phone-create',id='phone-123456789012',action='reminder_add',title='Phone reminder',due_at='2026-10-01T20:00:00')).encode()
                create_request=urllib.request.Request(url+'/v1/actions',data=creation,headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'})
                with urllib.request.urlopen(create_request,context=context) as response:
                    self.assertEqual(json.load(response)['result']['item']['id'],'phone-123456789012')
                post=urllib.request.Request(url+'/v1/actions',data=action,headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'})
                for _ in range(2):
                    with urllib.request.urlopen(post,context=context) as response:
                        result=json.load(response)
                        self.assertEqual(result['result']['status'],'ok')
                        saved=next(i for i in result['tasks']['items'] if i['id']==created['item']['id'])
                        self.assertEqual(saved['revision'],2)
                        self.assertEqual(saved['completed'],1)
            finally:
                process.terminate();process.wait(timeout=5);process.stderr.close()

if __name__=='__main__':unittest.main()
