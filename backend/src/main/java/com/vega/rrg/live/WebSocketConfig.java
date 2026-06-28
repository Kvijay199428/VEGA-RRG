package com.vega.rrg.live;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;
import org.springframework.web.socket.server.standard.ServletServerContainerFactoryBean;
import org.springframework.context.annotation.Bean;

/**
 * Spring WebSocket configuration for the live RRG engine.
 * Registers the handler at /ws/rrg/live with open CORS (matching existing REST policy).
 */
@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {

    private final RrgLiveWebSocketHandler handler;

    public WebSocketConfig(RrgLiveWebSocketHandler handler) {
        this.handler = handler;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(handler, "/ws/rrg/live")
                .setAllowedOrigins("*");
    }

    @Bean
    public ServletServerContainerFactoryBean createWebSocketContainer() {
        ServletServerContainerFactoryBean container = new ServletServerContainerFactoryBean();
        container.setMaxTextMessageBufferSize(65536);   // 64KB
        container.setMaxBinaryMessageBufferSize(65536);
        container.setMaxSessionIdleTimeout(60000L);     // 60s idle before server closes
        return container;
    }
}
