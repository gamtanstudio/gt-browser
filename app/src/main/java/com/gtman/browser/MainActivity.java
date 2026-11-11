package com.gtman.browser;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Context;
import android.content.pm.PackageManager;
import android.webkit.JavascriptInterface;
import org.json.JSONObject;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewConfiguration;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.util.HashSet;
import java.util.Set;

public class MainActivity extends Activity {

    private static final String HOME = "https://www.google.com";

    private static final String[] AD_HOSTS = {
            "doubleclick.net", "googlesyndication.com", "googleadservices.com",
            "adservice.google.com", "imasdk.googleapis.com", "googletagservices.com",
            "amazon-adsystem.com", "adnxs.com", "criteo.com", "taboola.com", "outbrain.com"
    };

    private FrameLayout root;
    private WebView web;
    private LinearLayout bar;
    private EditText urlBox;
    private TextView dot;
    private View customView;
    private WebChromeClient.CustomViewCallback customCallback;
    private String ytScript = "";
    private boolean docStartScript = false;
    private boolean mediaPlaying = false;

    static volatile MainActivity active;

    static class GTWebView extends WebView {
        GTWebView(Context c) {
            super(c);
        }

        @Override
        protected void onWindowVisibilityChanged(int visibility) {
            super.onWindowVisibilityChanged(View.VISIBLE);
        }
    }

    protected String mode() {
        return "web";
    }

    private String home() {
        return "web".equals(mode()) ? HOME : "https://m.youtube.com/";
    }

    private static boolean isYt(String url) {
        if (url == null) return false;
        String h = Uri.parse(url).getHost();
        return h != null && (h.equals("youtube.com") || h.endsWith(".youtube.com"));
    }

    static void sendCmd(String c) {
        MainActivity a = active;
        if (a == null || a.web == null) return;
        a.runOnUiThread(() -> a.web.evaluateJavascript(
                "window.__gtCmd&&window.__gtCmd('" + c + "')", null));
    }

    public class Bridge {
        @JavascriptInterface
        public void state(String json) {
            runOnUiThread(() -> onMediaState(json));
        }
    }

    private void onMediaState(String json) {
        try {
            JSONObject o = new JSONObject(json);
            boolean p = o.optBoolean("p");
            String t = o.optString("t");
            String a = o.optString("a");
            mediaPlaying = p;
            if (p) {
                active = this;
                PlaybackService.update(this, t, a, true);
            } else if (active == this && PlaybackService.isRunning()) {
                PlaybackService.update(this, t, a, false);
            }
        } catch (Exception ignored) {
        }
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);

        getWindow().setDecorFitsSystemWindows(false);
        WindowManager.LayoutParams lp = getWindow().getAttributes();
        lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        getWindow().setAttributes(lp);

        ytScript = readAsset("yt.js");
        if (!ytScript.isEmpty()) ytScript = "window.__gtMode='" + mode() + "';" + ytScript;

        root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);

        web = new GTWebView(this);
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));

        buildBar();
        buildDot();
        setContentView(root);

        root.setOnApplyWindowInsetsListener((v, ins) -> {
            android.graphics.Insets i = ins.getInsets(WindowInsets.Type.navigationBars() | WindowInsets.Type.ime());
            v.setPadding(i.left, 0, i.right, i.bottom);
            return WindowInsets.CONSUMED;
        });

        setupWeb();

        String start = null;
        Intent it = getIntent();
        if (it != null && it.getData() != null) start = it.getData().toString();
        if (saved != null) {
            web.restoreState(saved);
        } else {
            if (start == null) start = prefs().getString("last_" + mode(), home());
            web.loadUrl(start);
        }

        if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1);
        }
    }

    private SharedPreferences prefs() {
        return getSharedPreferences("gt", MODE_PRIVATE);
    }

    private String readAsset(String name) {
        try (InputStream in = getAssets().open(name)) {
            byte[] b = new byte[in.available()];
            int n = in.read(b);
            return new String(b, 0, Math.max(n, 0), "UTF-8");
        } catch (Exception e) {
            return "";
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void setupWeb() {
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setBuiltInZoomControls(true);
        s.setDisplayZoomControls(false);
        s.setSupportMultipleWindows(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);

        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.setAcceptThirdPartyCookies(web, true);

        web.addJavascriptInterface(new Bridge(), "GTBridge");

        if (!ytScript.isEmpty() && WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            try {
                Set<String> origins = new HashSet<>();
                origins.add("https://*.youtube.com");
                origins.add("https://youtube.com");
                WebViewCompat.addDocumentStartJavaScript(web, ytScript, origins);
                docStartScript = true;
            } catch (Exception ignored) {
            }
        }

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                String sc = u.getScheme();
                if ("http".equals(sc) || "https".equals(sc)) return false;
                try {
                    Intent i = Intent.parseUri(u.toString(), Intent.URI_INTENT_SCHEME);
                    i.addCategory(Intent.CATEGORY_BROWSABLE);
                    i.setComponent(null);
                    startActivity(i);
                } catch (Exception ignored) {
                }
                return true;
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                if (isAd(req.getUrl())) {
                    return new WebResourceResponse("text/plain", "utf-8",
                            new ByteArrayInputStream(new byte[0]));
                }
                return null;
            }

            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap fav) {
                injectFallback(url);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                injectFallback(url);
                if (url != null && url.startsWith("http")) prefs().edit().putString("last_" + mode(), url).apply();
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onShowCustomView(View view, CustomViewCallback cb) {
                if (customView != null) {
                    cb.onCustomViewHidden();
                    return;
                }
                customView = view;
                customCallback = cb;
                root.addView(view, new FrameLayout.LayoutParams(-1, -1));
                web.setVisibility(View.GONE);
                dot.setVisibility(View.GONE);
                hideSystemBars();
            }

            @Override
            public void onHideCustomView() {
                exitFullVideo();
            }
        });

        web.setDownloadListener((url, ua, cd, mime, len) -> {
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
            } catch (Exception ignored) {
            }
        });
    }

    private void injectFallback(String url) {
        if (docStartScript || ytScript.isEmpty() || url == null) return;
        if (isYt(url)) web.evaluateJavascript(ytScript, null);
    }

    private boolean isAd(Uri u) {
        String h = u.getHost();
        if (h == null) return false;
        for (String a : AD_HOSTS) {
            if (h.equals(a) || h.endsWith("." + a)) return true;
        }
        if (h.equals("youtube.com") || h.endsWith(".youtube.com")) {
            String p = u.getPath();
            if (p == null) return false;
            return p.startsWith("/pagead/") || p.startsWith("/api/stats/ads")
                    || p.startsWith("/ptracking") || p.contains("get_midroll_info")
                    || p.startsWith("/youtubei/v1/player/ad_break");
        }
        return false;
    }

    private void exitFullVideo() {
        if (customView == null) return;
        root.removeView(customView);
        customView = null;
        if (customCallback != null) customCallback.onCustomViewHidden();
        customCallback = null;
        web.setVisibility(View.VISIBLE);
        dot.setVisibility(View.VISIBLE);
    }

    private TextView barButton(String label, View.OnClickListener l) {
        TextView t = new TextView(this);
        t.setText(label);
        t.setTextColor(Color.WHITE);
        t.setTextSize(20);
        t.setGravity(Gravity.CENTER);
        t.setOnClickListener(l);
        bar.addView(t, new LinearLayout.LayoutParams(dp(42), -1));
        return t;
    }

    private void buildBar() {
        bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setBackgroundColor(0xF2202124);
        bar.setPadding(dp(4), 0, dp(4), 0);
        bar.setVisibility(View.GONE);

        barButton("‹", v -> { if (web.canGoBack()) web.goBack(); });
        barButton("›", v -> { if (web.canGoForward()) web.goForward(); });
        barButton("⟳", v -> web.reload());

        urlBox = new EditText(this);
        urlBox.setSingleLine(true);
        urlBox.setTextColor(Color.WHITE);
        urlBox.setTextSize(15);
        urlBox.setSelectAllOnFocus(true);
        urlBox.setImeOptions(EditorInfo.IME_ACTION_GO);
        urlBox.setInputType(android.text.InputType.TYPE_TEXT_VARIATION_URI | android.text.InputType.TYPE_CLASS_TEXT);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(0xFF3C4043);
        bg.setCornerRadius(dp(18));
        urlBox.setBackground(bg);
        urlBox.setPadding(dp(12), 0, dp(12), 0);
        urlBox.setOnEditorActionListener((v, id, ev) -> {
            if (id == EditorInfo.IME_ACTION_GO || (ev != null && ev.getKeyCode() == KeyEvent.KEYCODE_ENTER)) {
                web.loadUrl(normalize(urlBox.getText().toString()));
                hideBar();
                return true;
            }
            return false;
        });
        LinearLayout.LayoutParams ul = new LinearLayout.LayoutParams(0, dp(38), 1f);
        ul.gravity = Gravity.CENTER_VERTICAL;
        ul.setMargins(dp(4), 0, dp(4), 0);
        bar.addView(urlBox, ul);

        TextView logBtn = barButton("기록", v -> copyLog());
        logBtn.setTextSize(13);
        barButton("⧉", v -> { openNewWindow(); hideBar(); });
        barButton("✕", v -> hideBar());

        FrameLayout.LayoutParams p = new FrameLayout.LayoutParams(-1, dp(54), Gravity.TOP);
        root.addView(bar, p);
    }

    @SuppressLint("ClickableViewAccessibility")
    private void buildDot() {
        dot = new TextView(this);
        GradientDrawable g = new GradientDrawable();
        g.setShape(GradientDrawable.OVAL);
        g.setColor(0x55000000);
        g.setStroke(dp(1), 0x88FFFFFF);
        dot.setBackground(g);
        dot.setText("GT");
        dot.setTypeface(Typeface.DEFAULT_BOLD);
        dot.setTextSize(10);
        dot.setTextColor(0xAAFFFFFF);
        dot.setGravity(Gravity.CENTER);
        dot.setAlpha(0.6f);
        FrameLayout.LayoutParams p = new FrameLayout.LayoutParams(dp(36), dp(36), Gravity.BOTTOM | Gravity.END);
        p.setMargins(0, 0, dp(14), dp(90));
        root.addView(dot, p);

        final int slop = ViewConfiguration.get(this).getScaledTouchSlop();
        final float[] st = new float[4];
        final boolean[] moved = {false};
        final long[] downAt = {0};
        dot.setOnTouchListener((v, e) -> {
            switch (e.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    st[0] = e.getRawX(); st[1] = e.getRawY();
                    st[2] = v.getX(); st[3] = v.getY();
                    moved[0] = false;
                    downAt[0] = System.currentTimeMillis();
                    return true;
                case MotionEvent.ACTION_MOVE:
                    float dx = e.getRawX() - st[0], dy = e.getRawY() - st[1];
                    if (Math.abs(dx) > slop || Math.abs(dy) > slop) moved[0] = true;
                    if (moved[0]) {
                        ViewGroup par = (ViewGroup) v.getParent();
                        float nx = Math.max(0, Math.min(par.getWidth() - v.getWidth(), st[2] + dx));
                        float ny = Math.max(0, Math.min(par.getHeight() - v.getHeight(), st[3] + dy));
                        v.setX(nx); v.setY(ny);
                    }
                    return true;
                case MotionEvent.ACTION_UP:
                    if (!moved[0]) {
                        if (System.currentTimeMillis() - downAt[0] > 500) openNewWindow();
                        else toggleBar();
                    }
                    return true;
            }
            return false;
        });
    }

    private void copyLog() {
        web.evaluateJavascript("(function(){try{return localStorage.getItem('gtlog')||'';}catch(e){return '';}})()", r -> {
            String s = "";
            try {
                s = new org.json.JSONArray("[" + r + "]").optString(0, "");
            } catch (Exception ignored) {
            }
            if (s == null || s.isEmpty() || "null".equals(s)) {
                android.widget.Toast.makeText(this, "기록 없음 (유튜브 화면에서 눌러 주세요)", android.widget.Toast.LENGTH_SHORT).show();
                return;
            }
            android.content.ClipboardManager cm = (android.content.ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
            cm.setPrimaryClip(android.content.ClipData.newPlainText("gtlog", s));
            android.widget.Toast.makeText(this, "기록 복사됨", android.widget.Toast.LENGTH_SHORT).show();
        });
    }

    private void toggleBar() {
        if (bar.getVisibility() == View.VISIBLE) hideBar();
        else showBar();
    }

    private void showBar() {
        bar.setVisibility(View.VISIBLE);
        bar.bringToFront();
        urlBox.setText(web.getUrl());
        urlBox.requestFocus();
        urlBox.selectAll();
        InputMethodManager im = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
        im.showSoftInput(urlBox, InputMethodManager.SHOW_IMPLICIT);
    }

    private void hideBar() {
        InputMethodManager im = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
        im.hideSoftInputFromWindow(urlBox.getWindowToken(), 0);
        urlBox.clearFocus();
        bar.setVisibility(View.GONE);
        web.requestFocus();
        hideSystemBars();
    }

    private void openNewWindow() {
        String u = web.getUrl();
        Intent i = new Intent(this, getClass());
        i.setAction(Intent.ACTION_VIEW);
        i.setData(Uri.parse(u != null ? u : home()));
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_NEW_DOCUMENT
                | Intent.FLAG_ACTIVITY_MULTIPLE_TASK | Intent.FLAG_ACTIVITY_LAUNCH_ADJACENT);
        startActivity(i);
    }

    private String normalize(String t) {
        t = t.trim();
        if (t.isEmpty()) return HOME;
        if (t.startsWith("http://") || t.startsWith("https://")) return t;
        if (!t.contains(" ") && t.contains(".")) return "https://" + t;
        return "https://www.google.com/search?q=" + Uri.encode(t);
    }

    private void hideSystemBars() {
        WindowInsetsController c = getWindow().getInsetsController();
        if (c != null) {
            c.hide(WindowInsets.Type.systemBars());
            c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus && bar.getVisibility() != View.VISIBLE) hideSystemBars();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (intent != null && intent.getData() != null) web.loadUrl(intent.getData().toString());
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (customView != null) {
            exitFullVideo();
        } else if (bar.getVisibility() == View.VISIBLE) {
            hideBar();
        } else if (web.canGoBack()) {
            web.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();
    }

    @Override
    protected void onDestroy() {
        if (active == this) {
            active = null;
            PlaybackService.stop();
        }
        if (web != null) web.destroy();
        super.onDestroy();
    }
}
