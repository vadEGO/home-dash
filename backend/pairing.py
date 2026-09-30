"""Generate a private pairing QR locally, without sending credentials anywhere."""
import hashlib
import html
import json
import os
from pathlib import Path
import re
import ssl
import sys
from urllib.parse import urlsplit

WHEEL_SHA256='16e64e0716c14960108e85d853062c9e8bba5ca8252c0b4d0231b9df4060ff4f'

def generate(root, url):
    root=Path(root)
    url=url.rstrip('/')
    parsed=urlsplit(url)
    if parsed.scheme!='https' or not parsed.hostname or parsed.username or parsed.password or parsed.path or parsed.query or parsed.fragment or any(c.isspace() for c in url):
        raise ValueError('Use an HTTPS Mac address with optional port, without a path or credentials')
    if parsed.port is not None and not 1<=parsed.port<=65535:
        raise ValueError('Invalid port')
    token=(root/'device-token').read_text().strip()
    if not re.fullmatch(r'[A-Za-z0-9_-]{32,256}',token):
        raise ValueError('Invalid device token')
    fingerprint=hashlib.sha256(ssl.PEM_cert_to_DER_cert((root/'server.crt').read_text())).hexdigest()
    payload=dict(type='home-dash-pairing',version=1,url=url,pin=fingerprint,token=token)
    text=json.dumps(payload,separators=(',',':'))
    if len(text)>2048:
        raise ValueError('Pairing address too long')
    wheel=Path(__file__).parent/'vendor/qrcode-8.2-py3-none-any.whl'
    if hashlib.sha256(wheel.read_bytes()).hexdigest()!=WHEEL_SHA256:
        raise ValueError('QR library checksum mismatch')
    sys.path.insert(0,str(wheel))
    import qrcode
    from qrcode.image.svg import SvgPathFillImage
    qr=qrcode.QRCode(box_size=8,border=4)
    qr.add_data(text);qr.make(fit=True)
    svg=qr.make_image(image_factory=SvgPathFillImage).to_string().decode()
    output=root/'pairing.html'
    document='<!doctype html><meta charset="utf-8"><title>Home Dash pairing</title><style>body{font:18px system-ui;text-align:center;margin:24px;background:white;color:#17231c}svg{width:min(75vh,700px);height:auto}</style><h1>Pair your Seeker</h1><p>'+html.escape(url)+'</p>'+svg+'<p>Phone → Settings → Scan pairing QR</p><p>Private: this QR grants access to your dashboard. Close and delete this file after pairing.</p>'
    # Replace atomically; never follow an existing output symlink or expose token.
    import tempfile
    fd,temp=tempfile.mkstemp(prefix='pairing-',suffix='.html',dir=root)
    try:
        with os.fdopen(fd,'w') as stream:stream.write(document)
        os.replace(temp,output)
    finally:
        if os.path.exists(temp):os.unlink(temp)
    return output
