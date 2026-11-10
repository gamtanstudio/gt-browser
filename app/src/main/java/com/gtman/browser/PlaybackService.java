package com.gtman.browser;

import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.drawable.Icon;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.IBinder;
import android.os.PowerManager;

public class PlaybackService extends Service {

    private static final String CH = "gt_media";
    private static PlaybackService instance;

    private MediaSession session;
    private PowerManager.WakeLock wake;
    private String title = "", artist = "";
    private boolean playing = true;
    private Class<?> owner = MainActivity.class;

    static boolean isRunning() {
        return instance != null;
    }

    static void update(Activity a, String t, String ar, boolean p) {
        if (instance != null) {
            instance.owner = a.getClass();
            instance.refresh(t, ar, p);
            return;
        }
        if (!p) return;
        Intent i = new Intent(a, PlaybackService.class).setAction("update")
                .putExtra("t", t).putExtra("a", ar).putExtra("p", true)
                .putExtra("o", a.getClass().getName());
        try {
            a.startForegroundService(i);
        } catch (Exception ignored) {
        }
    }

    static void stop() {
        if (instance != null) instance.shutdown();
    }

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        NotificationManager nm = getSystemService(NotificationManager.class);
        NotificationChannel ch = new NotificationChannel(CH, "재생", NotificationManager.IMPORTANCE_LOW);
        ch.setShowBadge(false);
        nm.createNotificationChannel(ch);

        session = new MediaSession(this, "GT");
        session.setCallback(new MediaSession.Callback() {
            @Override public void onPlay() { MainActivity.sendCmd("play"); }
            @Override public void onPause() { MainActivity.sendCmd("pause"); }
            @Override public void onSkipToNext() { MainActivity.sendCmd("next"); }
            @Override public void onSkipToPrevious() { MainActivity.sendCmd("prev"); }
            @Override public void onStop() { MainActivity.sendCmd("pause"); shutdown(); }
        });
        session.setActive(true);

        PowerManager pm = getSystemService(PowerManager.class);
        wake = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "gt:play");
        wake.setReferenceCounted(false);
    }

    private void setAwake(boolean on) {
        try {
            if (wake == null) return;
            if (on && !wake.isHeld()) wake.acquire(6 * 60 * 60 * 1000L);
            else if (!on && wake.isHeld()) wake.release();
        } catch (Exception ignored) {
        }
    }

    @Override
    public int onStartCommand(Intent i, int flags, int id) {
        String act = i != null ? i.getAction() : null;
        if ("update".equals(act)) {
            try {
                owner = Class.forName(i.getStringExtra("o"));
            } catch (Exception ignored) {
            }
            refresh(i.getStringExtra("t"), i.getStringExtra("a"), i.getBooleanExtra("p", true));
        } else if ("cmd".equals(act)) {
            MainActivity.sendCmd(i.getStringExtra("c"));
        } else if ("close".equals(act)) {
            MainActivity.sendCmd("pause");
            shutdown();
        } else {
            refresh(title, artist, playing);
        }
        return START_NOT_STICKY;
    }

    void refresh(String t, String a, boolean p) {
        if (session == null) return;
        title = t == null ? "" : t;
        artist = a == null ? "" : a;
        playing = p;
        setAwake(p);
        session.setMetadata(new MediaMetadata.Builder()
                .putString(MediaMetadata.METADATA_KEY_TITLE, title)
                .putString(MediaMetadata.METADATA_KEY_ARTIST, artist)
                .build());
        session.setPlaybackState(new PlaybackState.Builder()
                .setActions(PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE
                        | PlaybackState.ACTION_PLAY_PAUSE | PlaybackState.ACTION_SKIP_TO_NEXT
                        | PlaybackState.ACTION_SKIP_TO_PREVIOUS | PlaybackState.ACTION_STOP)
                .setState(p ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED,
                        PlaybackState.PLAYBACK_POSITION_UNKNOWN, 1f)
                .build());
        startForeground(1, build(), ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
    }

    private PendingIntent svc(String action, String cmd, int req) {
        Intent i = new Intent(this, PlaybackService.class).setAction(action);
        if (cmd != null) i.putExtra("c", cmd);
        return PendingIntent.getService(this, req, i,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private Notification.Action act(int icon, String label, PendingIntent pi) {
        return new Notification.Action.Builder(Icon.createWithResource(this, icon), label, pi).build();
    }

    private Notification build() {
        Intent open = new Intent(this, owner).setAction(Intent.ACTION_MAIN)
                .addCategory(Intent.CATEGORY_LAUNCHER)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
        PendingIntent cp = PendingIntent.getActivity(this, 9, open,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        PendingIntent close = svc("close", null, 8);

        return new Notification.Builder(this, CH)
                .setSmallIcon(android.R.drawable.ic_media_play)
                .setContentTitle(title.isEmpty() ? "GT" : title)
                .setContentText(artist)
                .setContentIntent(cp)
                .setDeleteIntent(close)
                .setOngoing(playing)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .addAction(act(android.R.drawable.ic_media_previous, "이전", svc("cmd", "prev", 1)))
                .addAction(playing
                        ? act(android.R.drawable.ic_media_pause, "일시정지", svc("cmd", "pause", 2))
                        : act(android.R.drawable.ic_media_play, "재생", svc("cmd", "play", 2)))
                .addAction(act(android.R.drawable.ic_media_next, "다음", svc("cmd", "next", 3)))
                .addAction(act(android.R.drawable.ic_menu_close_clear_cancel, "닫기", close))
                .setStyle(new Notification.MediaStyle()
                        .setMediaSession(session.getSessionToken())
                        .setShowActionsInCompactView(0, 1, 2))
                .build();
    }

    void shutdown() {
        instance = null;
        setAwake(false);
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    @Override
    public void onDestroy() {
        if (instance == this) instance = null;
        if (session != null) session.release();
        session = null;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent i) {
        return null;
    }
}
