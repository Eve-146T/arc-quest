package org.arcquest.game;

import android.animation.ValueAnimator;
import android.app.Activity;
import android.graphics.drawable.Animatable;
import android.os.Build;
import android.view.View;
import android.view.animation.AccelerateDecelerateInterpolator;
import android.webkit.WebView;
import android.widget.FrameLayout;
import android.widget.ImageView;

/** Keeps the launch artwork visible until the WebView has a complete first frame. */
final class LaunchScreen {
    private final WebView web;
    private View cover;
    private Runnable removeCover;
    private boolean ready;

    LaunchScreen(Activity activity, WebView web) {
        this.web = web;
        FrameLayout content = new FrameLayout(activity);
        content.setBackgroundColor(0xffffe4f3);
        content.addView(web, new FrameLayout.LayoutParams(-1, -1));
        if (Build.VERSION.SDK_INT >= 31) {
            activity.getSplashScreen().setOnExitAnimationListener(splash -> {
                cover = splash;
                removeCover = splash::remove;
                if (ready) dismiss();
            });
        } else {
            ImageView splash = new ImageView(activity);
            splash.setBackgroundColor(0xffffe4f3);
            splash.setImageResource(R.drawable.splash_animated);
            splash.setScaleType(ImageView.ScaleType.CENTER);
            content.addView(splash, new FrameLayout.LayoutParams(-1, -1));
            cover = splash;
            removeCover = () -> content.removeView(splash);
            if (splash.getDrawable() instanceof Animatable) ((Animatable) splash.getDrawable()).start();
        }
        activity.setContentView(content);
        // A failed page must not trap the player behind an endless splash.
        web.postDelayed(this::onReady, 45000);
    }

    void onReady() {
        if (ready) return;
        ready = true;
        if (cover != null) dismiss();
    }

    private void dismiss() {
        if (!ValueAnimator.areAnimatorsEnabled()) {
            removeCover.run();
            return;
        }
        cover.animate().alpha(0f).setDuration(180)
            .setInterpolator(new AccelerateDecelerateInterpolator())
            .withEndAction(removeCover).start();
    }
}
