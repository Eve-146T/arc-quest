package org.arcquest.game;
import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.HapticFeedbackConstants;
import android.webkit.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;

/** Self-contained offline game. Only bundled content can execute in this WebView. */
public final class MainActivity extends Activity {
    private WebView web;
    private LaunchScreen launchScreen;
    private String pendingExport;
    private static final String HOST="appassets.androidplatform.net";
    @Override public void onCreate(Bundle state){
        super.onCreate(state);
        web=new WebView(this);web.setBackgroundColor(0xffffe4f3);
        launchScreen=new LaunchScreen(this,web);
        WebSettings s=web.getSettings();s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);s.setAllowContentAccess(false);s.setMediaPlaybackRequiresUserGesture(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);s.setSupportZoom(false);
        s.setUserAgentString(s.getUserAgentString()+" ArcQuestAndroid/1.0");
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.addJavascriptInterface(new NativeActions(),"AndroidGame");
        web.setWebViewClient(new WebViewClient(){
            @Override public WebResourceResponse shouldInterceptRequest(WebView v,WebResourceRequest r){return asset(r.getUrl());}
            @Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest r){
                Uri u=r.getUrl();if(HOST.equals(u.getHost()))return false;
                if("https".equals(u.getScheme())){try{startActivity(new Intent(Intent.ACTION_VIEW,u));}catch(Exception ignored){}}
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient());
        // Development builds enable inspectability only when explicitly marked debuggable.
        if((getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE)!=0)WebView.setWebContentsDebuggingEnabled(true);
        web.loadUrl("https://"+HOST+"/index.html");immersive();
    }
    private WebResourceResponse asset(Uri u){
        if(!HOST.equals(u.getHost()))return new WebResourceResponse("text/plain","UTF-8",403,"Forbidden",new HashMap<>(),new ByteArrayInputStream(new byte[0]));
        String p=u.getPath();if(p==null||p.equals("/"))p="/index.html";
        if(p.contains(".."))return null;
        String mime="application/octet-stream";
        if(p.endsWith(".html"))mime="text/html";else if(p.endsWith(".js"))mime="text/javascript";else if(p.endsWith(".css"))mime="text/css";else if(p.endsWith(".json"))mime="application/json";else if(p.endsWith(".wasm"))mime="application/wasm";else if(p.endsWith(".svg"))mime="image/svg+xml";else if(p.endsWith(".png"))mime="image/png";else if(p.endsWith(".ttf"))mime="font/ttf";
        try{return new WebResourceResponse(mime,"UTF-8",getAssets().open(p.substring(1)));}
        catch(IOException e){return new WebResourceResponse("text/plain","UTF-8",404,"Not found",new HashMap<>(),new ByteArrayInputStream(new byte[0]));}
    }
    public final class NativeActions{
        @JavascriptInterface public void launchReady(){runOnUiThread(()->web.postVisualStateCallback(0,new WebView.VisualStateCallback(){@Override public void onComplete(long id){launchScreen.onReady();}}));}
        @JavascriptInterface public void haptic(boolean win){runOnUiThread(()->web.performHapticFeedback(win?HapticFeedbackConstants.LONG_PRESS:HapticFeedbackConstants.KEYBOARD_TAP));}
        @JavascriptInterface public void exportScore(String json){
            if(json==null||json.length()>5000000)return;
            runOnUiThread(()->{pendingExport=json;Intent i=new Intent(Intent.ACTION_CREATE_DOCUMENT);i.addCategory(Intent.CATEGORY_OPENABLE);i.setType("application/json");i.putExtra(Intent.EXTRA_TITLE,"arc-quest-scorecard.json");startActivityForResult(i,7);});
        }
    }
    @Override protected void onActivityResult(int request,int result,Intent data){super.onActivityResult(request,result,data);if(request==7&&result==RESULT_OK&&data!=null&&pendingExport!=null){try(OutputStream out=getContentResolver().openOutputStream(data.getData())){out.write(pendingExport.getBytes(StandardCharsets.UTF_8));}catch(IOException ignored){}finally{pendingExport=null;}}}
    private void immersive(){getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN|View.SYSTEM_UI_FLAG_HIDE_NAVIGATION|View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY|View.SYSTEM_UI_FLAG_LAYOUT_STABLE|View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN|View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);}
    @Override public void onWindowFocusChanged(boolean focus){super.onWindowFocusChanged(focus);if(focus)immersive();}
    @Override protected void onPause(){super.onPause();web.evaluateJavascript("window.arcSuspend&&window.arcSuspend()",null);web.onPause();}
    @Override protected void onResume(){super.onResume();if(web!=null)web.onResume();}
    /** Back is handled by the page (sheet, loading, game, intro page) or exits. */
    @Override public void onBackPressed(){if(web.canGoBack()&&!web.getUrl().endsWith("/index.html")){web.goBack();return;}web.evaluateJavascript("(function(){return !!(window.arcBack&&window.arcBack());})()",value->{if(!"true".equals(value))finish();});}
    @Override protected void onDestroy(){web.removeJavascriptInterface("AndroidGame");web.destroy();super.onDestroy();}
}
