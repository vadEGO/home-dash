import importlib.util
import io
import json
from pathlib import Path
import plistlib
import tarfile
import tempfile
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('deploy',Path(__file__).parents[1]/'scripts/mac-service.py')
d=importlib.util.module_from_spec(spec);spec.loader.exec_module(d)

class DeployTests(unittest.TestCase):
    def test_releases_preserve_pairing_and_record_rollback(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory).resolve()/'state';root.mkdir()
            (root/'server.crt').write_text('existing certificate')
            (root/'device-token').write_text('existing token')
            plist=Path(directory)/'LaunchAgents/service.plist'
            def fake_run(*args,**kwargs):
                if args[:2]==('git','archive'):
                    with tarfile.open(fileobj=kwargs['stdout'],mode='w') as archive:
                        info=tarfile.TarInfo('backend/service.py');data=b'print("fixture")';info.size=len(data)
                        archive.addfile(info,io.BytesIO(data))
            with patch.object(d,'ROOT',root),patch.object(d,'PLIST',plist),patch.object(d,'run',side_effect=fake_run),patch.object(d,'restart') as restart,patch.object(d.subprocess,'check_output',side_effect=['a'*40,'b'*40]):
                d.install('first');d.install('second')
                self.assertEqual(restart.call_count,2)
            state=json.loads((root/'release.json').read_text())
            self.assertEqual(state,{'current':'b'*40,'previous':'a'*40})
            self.assertEqual((root/'device-token').read_text(),'existing token')
            self.assertEqual((root/'server.crt').read_text(),'existing certificate')
            job=plistlib.loads(plist.read_bytes())
            self.assertEqual(job['ProgramArguments'][0],str(root/'runtime/bin/python3'))
            self.assertIn('b'*40,job['ProgramArguments'][1])
    def test_publish_rejects_invalid_data_without_replacing_previous(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);source=root/'input.json'
            good=[dict(id='one',title='Brief',published_at='2026-09-30T08:00:00+10:00',body=['Verified text'])]
            with patch.object(d,'ROOT',root):
                source.write_text(json.dumps(good));d.publish(source)
                source.write_text('[{"id":"bad"}]')
                with self.assertRaises(ValueError):d.publish(source)
                self.assertEqual(json.loads((root/'briefings.json').read_text()),good)

if __name__=='__main__':unittest.main()
