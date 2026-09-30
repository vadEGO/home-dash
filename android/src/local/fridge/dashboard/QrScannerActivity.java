package local.fridge.dashboard;

import android.app.Activity;
import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.hardware.Camera;
import android.os.Bundle;
import android.view.SurfaceHolder;
import android.view.SurfaceView;
import android.widget.FrameLayout;
import android.widget.TextView;
import android.widget.Button;
import android.view.Gravity;
import com.google.zxing.*;
import com.google.zxing.common.HybridBinarizer;
import java.util.Collections;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Offline QR decoding. Camera frames never leave this process. */
@SuppressWarnings("deprecation")
public final class QrScannerActivity extends Activity implements SurfaceHolder.Callback {
    private Camera camera;
    private SurfaceView surface;
    private TextView hint;
    private boolean surfaceReady=false,finished=false;
    private volatile boolean decoding=false;
    private long lastFrame=0;
    private final ExecutorService worker=Executors.newSingleThreadExecutor();
    @Override public void onCreate(Bundle state){
        super.onCreate(state);
        FrameLayout layout=new FrameLayout(this);surface=new SurfaceView(this);layout.addView(surface);
        hint=new TextView(this);hint.setText("Point at the private Home Dash pairing QR on your Mac");hint.setTextColor(0xffffffff);hint.setBackgroundColor(0xbb000000);hint.setPadding(24,16,24,16);
        layout.addView(hint,new FrameLayout.LayoutParams(-1,-2,Gravity.TOP));
        Button cancel=new Button(this);cancel.setText("Cancel");cancel.setOnClickListener(v->finish());layout.addView(cancel,new FrameLayout.LayoutParams(-2,-2,Gravity.BOTTOM|Gravity.RIGHT));
        setContentView(layout);surface.getHolder().addCallback(this);
        if(checkSelfPermission(Manifest.permission.CAMERA)!=PackageManager.PERMISSION_GRANTED)requestPermissions(new String[]{Manifest.permission.CAMERA},1);
    }
    public void surfaceCreated(SurfaceHolder holder){surfaceReady=true;startCamera();}
    public void surfaceChanged(SurfaceHolder holder,int format,int width,int height){}
    public void surfaceDestroyed(SurfaceHolder holder){surfaceReady=false;stopCamera();}
    @Override public void onRequestPermissionsResult(int request,String[] permissions,int[] grants){super.onRequestPermissionsResult(request,permissions,grants);if(grants.length>0&&grants[0]==PackageManager.PERMISSION_GRANTED)startCamera();else hint.setText("Camera permission is needed to scan. Manual pairing is available in Settings.");}
    private void startCamera(){
        if(!surfaceReady||camera!=null||finished||checkSelfPermission(Manifest.permission.CAMERA)!=PackageManager.PERMISSION_GRANTED)return;
        try{
            int id=0;Camera.CameraInfo info=new Camera.CameraInfo();
            for(int i=0;i<Camera.getNumberOfCameras();i++){Camera.getCameraInfo(i,info);if(info.facing==Camera.CameraInfo.CAMERA_FACING_BACK){id=i;break;}}
            Camera.getCameraInfo(id,info);camera=Camera.open(id);
            Camera.Parameters p=camera.getParameters();Camera.Size best=null;
            for(Camera.Size s:p.getSupportedPreviewSizes())if(s.width<=1280&&(best==null||s.width>best.width))best=s;
            if(best!=null)p.setPreviewSize(best.width,best.height);
            if(p.getSupportedFocusModes().contains(Camera.Parameters.FOCUS_MODE_CONTINUOUS_PICTURE))p.setFocusMode(Camera.Parameters.FOCUS_MODE_CONTINUOUS_PICTURE);
            p.setPreviewFormat(android.graphics.ImageFormat.NV21);camera.setParameters(p);
            int degrees=getWindowManager().getDefaultDisplay().getRotation()*90;
            camera.setDisplayOrientation((info.orientation-degrees+360)%360);
            camera.setPreviewDisplay(surface.getHolder());
            camera.setPreviewCallback((data,cam)->{
                long now=android.os.SystemClock.elapsedRealtime();if(decoding||finished||now-lastFrame<300)return;lastFrame=now;decoding=true;
                Camera.Size size=cam.getParameters().getPreviewSize();final byte[] frame=data.clone();
                worker.execute(()->{
                    try{
                        LuminanceSource source=new PlanarYUVLuminanceSource(frame,size.width,size.height,0,0,size.width,size.height,false);
                        MultiFormatReader reader=new MultiFormatReader();reader.setHints(Collections.singletonMap(DecodeHintType.POSSIBLE_FORMATS,Collections.singletonList(BarcodeFormat.QR_CODE)));
                        String text=reader.decodeWithState(new BinaryBitmap(new HybridBinarizer(source))).getText();
                        if(text.length()<=2048){org.json.JSONObject payload=new org.json.JSONObject(text);if("home-dash-pairing".equals(payload.optString("type")))runOnUiThread(()->{if(!finished){finished=true;setResult(RESULT_OK,new Intent().putExtra("pairing",text));finish();}});else runOnUiThread(()->hint.setText("That is not a Home Dash pairing QR."));}
                    }catch(Exception ignored){}finally{decoding=false;}
                });
            });camera.startPreview();
        }catch(Exception e){stopCamera();hint.setText("Camera unavailable. Close other camera apps or use manual pairing.");}
    }
    private void stopCamera(){if(camera!=null){camera.setPreviewCallback(null);camera.stopPreview();camera.release();camera=null;}}
    @Override protected void onResume(){super.onResume();startCamera();}
    @Override protected void onPause(){stopCamera();super.onPause();}
    @Override protected void onDestroy(){finished=true;worker.shutdownNow();super.onDestroy();}
}
