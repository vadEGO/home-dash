package local.fridge.dashboard;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.Toast;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.security.cert.X509Certificate;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;
import org.json.JSONObject;

/** Fixed-endpoint HTTPS bridge, restricted to bundled content by the Activity. */
public final class DashboardConnection {
    private final Activity activity;
    private final WebView web;
    private final SharedPreferences prefs;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private volatile boolean busy = false;
    private volatile boolean closed = false;
    private volatile int generation = 0;
    DashboardConnection(Activity activity, WebView web) {
        this.activity=activity; this.web=web;
        prefs=activity.getSharedPreferences("connection",0);
    }
    private SecretKey key() throws Exception {
        KeyStore store=KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        if (!store.containsAlias("home-dash-token")) {
            KeyGenerator generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder("home-dash-token",KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
            generator.generateKey();
        }
        return (SecretKey)store.getKey("home-dash-token",null);
    }
    private String encrypt(String plain) throws Exception {
        Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE,key());
        return Base64.encodeToString(cipher.getIV(),Base64.NO_WRAP)+":"+Base64.encodeToString(cipher.doFinal(plain.getBytes(StandardCharsets.UTF_8)),Base64.NO_WRAP);
    }
    private String decrypt(String encrypted) throws Exception {
        String[] parts=encrypted.split(":",2);
        Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,Base64.decode(parts[0],Base64.NO_WRAP)));
        return new String(cipher.doFinal(Base64.decode(parts[1],Base64.NO_WRAP)),StandardCharsets.UTF_8);
    }
    private void result(String json, String error, int version) {
        activity.runOnUiThread(()->{
            if (!closed && version==generation) web.evaluateJavascript("window.receiveDashboard("+(json==null?"null":json)+","+JSONObject.quote(error)+")",null);
        });
    }
    @JavascriptInterface public boolean isConfigured() {return !prefs.getString("url", "").isEmpty();}
    @JavascriptInterface public void refresh() {
        if (busy || closed) return;
        final int version=generation;
        final String base=prefs.getString("url","");
        final String fingerprint=prefs.getString("pin","");
        final String secret=prefs.getString("token","");
        if (base.isEmpty()) { result(null,"not_paired",version); return; }
        busy=true;
        worker.execute(()->{
            HttpsURLConnection connection=null;
            try {
                SSLContext ssl=SSLContext.getInstance("TLS");
                ssl.init(null,new TrustManager[]{new X509TrustManager() {
                    public X509Certificate[] getAcceptedIssuers(){return new X509Certificate[0];}
                    public void checkClientTrusted(X509Certificate[] c,String a) throws java.security.cert.CertificateException {throw new java.security.cert.CertificateException("Client certificates unsupported");}
                    public void checkServerTrusted(X509Certificate[] chain,String auth) throws java.security.cert.CertificateException {
                        try {
                            if (chain.length==0) throw new Exception("Missing certificate");
                            chain[0].checkValidity();
                            byte[] digest=MessageDigest.getInstance("SHA-256").digest(chain[0].getEncoded());
                            StringBuilder hex=new StringBuilder(); for(byte b:digest)hex.append(String.format("%02x",b&255));
                            if (!MessageDigest.isEqual(hex.toString().getBytes(StandardCharsets.US_ASCII),fingerprint.getBytes(StandardCharsets.US_ASCII))) throw new Exception("Certificate changed");
                        } catch(Exception e) {throw new java.security.cert.CertificateException("Pinned certificate rejected",e);}
                    }
                }},null);
                connection=(HttpsURLConnection)new URL(base+"/v1/dashboard").openConnection();
                connection.setSSLSocketFactory(ssl.getSocketFactory());
                // Identity is the exact paired certificate, not a public DNS certificate.
                connection.setHostnameVerifier((host,session)->host.equals(java.net.URI.create(base).getHost()));
                connection.setInstanceFollowRedirects(false);
                connection.setConnectTimeout(10000); connection.setReadTimeout(15000);
                connection.setRequestProperty("Authorization","Bearer "+decrypt(secret));
                if(connection.getResponseCode()!=200)throw new Exception("Service rejected request");
                try(InputStream in=connection.getInputStream();ByteArrayOutputStream out=new ByteArrayOutputStream()) {
                    byte[] buffer=new byte[8192];int size;
                    while((size=in.read(buffer))!=-1){out.write(buffer,0,size);if(out.size()>2000000)throw new Exception("Response too large");}
                    JSONObject payload=new JSONObject(out.toString("UTF-8"));
                    if(payload.getInt("version")!=1)throw new Exception("Unsupported schema");
                    result(payload.toString(),"",version);
                }
            } catch(Exception e) { result(null,"connection_failed",version); }
            finally {if(connection!=null)connection.disconnect();busy=false;}
        });
    }
    @JavascriptInterface public void configure() {
        activity.runOnUiThread(()->{
            LinearLayout layout=new LinearLayout(activity);layout.setOrientation(LinearLayout.VERTICAL);layout.setPadding(32,16,32,16);
            EditText url=new EditText(activity);url.setHint("https://Mac-LAN-IP:8765");url.setSingleLine(true);url.setText(prefs.getString("url",""));
            EditText pin=new EditText(activity);pin.setHint("Certificate SHA-256 fingerprint");pin.setSingleLine(true);pin.setText(prefs.getString("pin",""));
            EditText token=new EditText(activity);token.setHint("Device token (required to save)");token.setSingleLine(true);token.setInputType(129);
            layout.addView(url);layout.addView(pin);layout.addView(token);
            AlertDialog dialog=new AlertDialog.Builder(activity).setTitle("Connect to Hermes Mac").setView(layout)
                .setNegativeButton("Cancel",null).setNeutralButton("Disconnect",(d,w)->{
                    generation++;prefs.edit().clear().apply();result(null,"disconnected",generation);
                }).setPositiveButton("Save",null).create();
            dialog.setOnShowListener(d->dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v->{
                try {
                    String base=url.getText().toString().trim().replaceAll("/+$","");
                    URL parsed=new URL(base);
                    String hash=pin.getText().toString().replace(":","").replace(" ","").toLowerCase(java.util.Locale.ROOT);
                    String value=token.getText().toString().trim();
                    if(!parsed.getProtocol().equals("https")||parsed.getHost().isEmpty()||parsed.getUserInfo()!=null||!parsed.getPath().isEmpty()||parsed.getQuery()!=null||parsed.getRef()!=null||!hash.matches("[0-9a-f]{64}")||!value.matches("[A-Za-z0-9_-]{32,256}"))throw new Exception();
                    String encrypted=encrypt(value);
                    generation++;prefs.edit().putString("url",base).putString("pin",hash).putString("token",encrypted).apply();
                    result(null,"pairing_changed",generation);dialog.dismiss();refresh();
                } catch(Exception e){Toast.makeText(activity,"Check HTTPS URL, 64-character fingerprint and device token.",Toast.LENGTH_LONG).show();}
            }));dialog.show();
        });
    }
    void close(){closed=true;worker.shutdownNow();}
}
