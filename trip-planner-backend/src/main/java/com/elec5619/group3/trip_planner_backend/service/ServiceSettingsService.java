package com.elec5619.group3.trip_planner_backend.service;

import com.elec5619.group3.trip_planner_backend.dto.ServiceSettingsResponse;
import com.elec5619.group3.trip_planner_backend.dto.ServiceStatusResponse;
import com.elec5619.group3.trip_planner_backend.dto.UpdateServiceSettingsRequest;
import com.elec5619.group3.trip_planner_backend.entity.AppSetting;
import com.elec5619.group3.trip_planner_backend.exception.ServiceDisabledException;
import com.elec5619.group3.trip_planner_backend.repository.AppSettingRepository;
import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * FR-22: admin switches for external services. Settings live in app_settings and are
 * cached in memory, so checking a switch before each external call costs no database query.
 * The cache is per backend instance; a second instance only sees an update after a restart.
 */
@Service
public class ServiceSettingsService {

    public enum ExternalService {
        PLACE_SEARCH("place-search.enabled", "Place search"),
        PLACE_PHOTOS("place-photos.enabled", "Place photos"),
        AI_RECOMMENDATIONS("ai-recommendations.enabled", "AI recommendations");

        private final String key;
        private final String label;

        ExternalService(String key, String label) {
            this.key = key;
            this.label = label;
        }
    }

    public enum MapProvider { GOOGLE, OSM, OFF }

    // The model name goes into the Gemini URL path, so only plain model-id characters are allowed.
    public static final String AI_MODEL_PATTERN = "[a-z0-9][a-z0-9.\\-]*";

    private static final String AI_MODEL_KEY = "ai.model";
    private static final String MAP_PROVIDER_KEY = "map.provider";

    private final AppSettingRepository repository;
    private final String defaultAiModel;
    private final Map<String, String> cache = new ConcurrentHashMap<>();

    public ServiceSettingsService(AppSettingRepository repository,
                                  @Value("${gemini.model}") String defaultAiModel) {
        this.repository = repository;
        this.defaultAiModel = defaultAiModel;
    }

    @PostConstruct
    void load() {
        repository.findAll().forEach(setting -> cache.put(setting.getKey(), setting.getValue()));
    }

    /** Services are on unless an admin has explicitly switched them off. */
    public boolean isEnabled(ExternalService service) {
        return !"false".equals(cache.get(service.key));
    }

    public void requireEnabled(ExternalService service) {
        if (!isEnabled(service)) {
            throw new ServiceDisabledException(service.label
                    + " has been turned off by an administrator. Please contact the administrator.");
        }
    }

    public String aiModel() {
        return cache.getOrDefault(AI_MODEL_KEY, defaultAiModel);
    }

    public MapProvider mapProvider() {
        try {
            return MapProvider.valueOf(cache.getOrDefault(MAP_PROVIDER_KEY, MapProvider.GOOGLE.name()));
        } catch (IllegalArgumentException e) {
            return MapProvider.GOOGLE;
        }
    }

    public ServiceStatusResponse status() {
        return new ServiceStatusResponse(isEnabled(ExternalService.PLACE_SEARCH),
                isEnabled(ExternalService.PLACE_PHOTOS), isEnabled(ExternalService.AI_RECOMMENDATIONS),
                mapProvider().name());
    }

    public ServiceSettingsResponse settings() {
        return new ServiceSettingsResponse(isEnabled(ExternalService.PLACE_SEARCH),
                isEnabled(ExternalService.PLACE_PHOTOS), isEnabled(ExternalService.AI_RECOMMENDATIONS),
                aiModel(), defaultAiModel, mapProvider().name());
    }

    public ServiceSettingsResponse update(UpdateServiceSettingsRequest request) {
        List<AppSetting> changes = List.of(
                new AppSetting(ExternalService.PLACE_SEARCH.key, request.getPlaceSearch().toString()),
                new AppSetting(ExternalService.PLACE_PHOTOS.key, request.getPlacePhotos().toString()),
                new AppSetting(ExternalService.AI_RECOMMENDATIONS.key, request.getAiRecommendations().toString()),
                new AppSetting(AI_MODEL_KEY, request.getAiModel().trim()),
                new AppSetting(MAP_PROVIDER_KEY, request.getMapProvider().name()));
        // Cache is updated only once the database write has succeeded.
        repository.saveAll(changes);
        changes.forEach(setting -> cache.put(setting.getKey(), setting.getValue()));
        return settings();
    }
}
