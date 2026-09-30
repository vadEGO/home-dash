# Bundled dependencies

No runtime package download, Google Play services or external QR service is required.

- **ZXing core 3.5.3**, Apache-2.0, `android/libs/zxing-core-3.5.3.jar`. Used only for offline camera QR decoding. License: `android/libs/ZXING-LICENSE.txt`. Source: https://github.com/zxing/zxing/tree/zxing-3.5.3 and official Maven artifact https://repo.maven.apache.org/maven2/com/google/zxing/core/3.5.3/core-3.5.3.jar. SHA-256 verified during every build: `8d8064c1636fdaef7189dd9055c7d59950a8940a12f2293956446ec3c109fd82`.
- **qrcode 8.2**, BSD license included in `backend/vendor/qrcode-8.2-py3-none-any.whl` at `qrcode-8.2.dist-info/LICENSE`. Source: https://pypi.org/project/qrcode/8.2/. Used by the optional Mac pairing command to generate SVG. The wheel is imported directly, without installing Pillow or other packages. SHA-256 verified before import: `16e64e0716c14960108e85d853062c9e8bba5ca8252c0b4d0231b9df4060ff4f`.

Both are bundled at fixed versions so Android builds and Mac pairing can run offline. Update dependencies deliberately and re-run QR round-trip tests before changing their checksums.
