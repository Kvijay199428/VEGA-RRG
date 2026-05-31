package com.vega.rrg.service;

import org.springframework.stereotype.Component;

import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

@Component
public class ConfigReloadDebouncer {

    private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor();
    private ScheduledFuture<?> pendingTask = null;
    private final Object lock = new Object();

    public void scheduleReload(Runnable reloadTask) {
        synchronized (lock) {
            if (pendingTask != null && !pendingTask.isDone()) {
                pendingTask.cancel(false);
            }
            pendingTask = scheduler.schedule(reloadTask, 250, TimeUnit.MILLISECONDS);
        }
    }
}
