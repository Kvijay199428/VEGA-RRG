package com.vega.rrg.events;

import com.vega.rrg.model.config.RrgRuntimeConfigurationSnapshot;
import java.util.Set;

public class RrgConfigurationEvents {

    public record SnapshotChangedEvent(
            RrgRuntimeConfigurationSnapshot oldSnapshot,
            RrgRuntimeConfigurationSnapshot newSnapshot,
            Set<String> changedDomains,
            long generationId
    ) {}
}
