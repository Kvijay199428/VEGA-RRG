package com.vega.rrg.service;

import com.fasterxml.jackson.databind.MapperFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;

@Component
public class ConfigHasher {
    private final ObjectMapper mapper;

    public ConfigHasher() {
        this.mapper = new ObjectMapper();
        this.mapper.configure(SerializationFeature.INDENT_OUTPUT, false);
        this.mapper.configure(MapperFeature.SORT_PROPERTIES_ALPHABETICALLY, true);
    }

    public String hash(Object config) {
        try {
            // Convert to a tree so we can manually strip volatile fields before hashing
            com.fasterxml.jackson.databind.JsonNode node = mapper.valueToTree(config);
            if (node.isObject()) {
                ((com.fasterxml.jackson.databind.node.ObjectNode) node).remove("updatedAt");
                ((com.fasterxml.jackson.databind.node.ObjectNode) node).remove("version");
                ((com.fasterxml.jackson.databind.node.ObjectNode) node).remove("loadedAt");
            }
            String canonicalJson = mapper.writeValueAsString(node);
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hashBytes = digest.digest(canonicalJson.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hashBytes);
        } catch (Exception e) {
            throw new RuntimeException("Failed to generate structural hash", e);
        }
    }
}
