const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process'),{pathToFileURL}=require('node:url');
(async()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'home-dash-qr-')),root=path.resolve(__dirname,'..');let browser;
 try{
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-keyout',path.join(dir,'server.key'),'-out',path.join(dir,'server.crt'),'-subj','/CN=localhost'],{stdio:'pipe'});
  fs.writeFileSync(path.join(dir,'device-token'),'test-only-credential-00000000000000000000');
  execFileSync('python3',['-c',`import sys,json,hashlib,ssl;from pathlib import Path;sys.path.insert(0,sys.argv[1]);from pairing import generate;r=Path(sys.argv[2]);generate(r,'https://hermes.local:8765');p=dict(type='home-dash-pairing',version=1,url='https://hermes.local:8765',pin=hashlib.sha256(ssl.PEM_cert_to_DER_cert((r/'server.crt').read_text())).hexdigest(),token=(r/'device-token').read_text());(r/'expected.txt').write_text(json.dumps(p,separators=(',',':')))`,path.join(root,'backend'),dir]);
  assert.equal(fs.statSync(path.join(dir,'pairing.html')).mode&0o777,0o600);
  browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1000,height:1000}});await page.goto(pathToFileURL(path.join(dir,'pairing.html')).href);await page.locator('svg').screenshot({path:path.join(dir,'qr.png')});
  fs.writeFileSync(path.join(dir,'Decode.java'),`import java.io.*;import java.nio.file.*;import java.awt.image.*;import javax.imageio.*;import com.google.zxing.*;import com.google.zxing.common.*;public class Decode{public static void main(String[] a)throws Exception{BufferedImage i=ImageIO.read(new File(a[0]));int w=i.getWidth(),h=i.getHeight();String text=new MultiFormatReader().decode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(w,h,i.getRGB(0,0,w,h,null,0,w))))).getText();if(!text.equals(new String(Files.readAllBytes(Paths.get(a[1])),"UTF-8")))throw new Exception("QR payload mismatch");System.out.println("PASS: private Mac SVG QR decoded by Android ZXing library with exact URL, pin and token.");}}`);
  const jdk='/Applications/Android Studio.app/Contents/jbr/Contents/Home/bin/',jar=path.join(root,'android/libs/zxing-core-3.5.3.jar');
  execFileSync(jdk+'javac',['-cp',jar,path.join(dir,'Decode.java')]);process.stdout.write(execFileSync(jdk+'java',['-cp',dir+':'+jar,'Decode',path.join(dir,'qr.png'),path.join(dir,'expected.txt')]));
 }finally{if(browser)await browser.close();fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exit(1)});
