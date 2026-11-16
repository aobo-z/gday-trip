import axiosClient from "./axiosClient";

export type MapProvider = "GOOGLE" | "OSM" | "OFF";

// matches our backend ServiceStatusResponse DTO
export interface ServiceStatus {
    placeSearch: boolean;
    placePhotos: boolean;
    aiRecommendations: boolean;
    mapProvider: MapProvider;
}

// matches our backend ServiceSettingsResponse DTO (admin only)
export interface ServiceSettings extends ServiceStatus {
    aiModel: string;
    defaultAiModel: string;
}

export type UpdateServiceSettingsRequest = Omit<ServiceSettings, "defaultAiModel">;

export const SERVICE_UNAVAILABLE = "This service is currently unavailable. Please contact the administrator.";

/**
 * FR-22: which external services are on, and which map provider to load.
 * Calls: GET /api/services/status
 */
export async function fetchServiceStatus(): Promise<ServiceStatus> {
    const res = await axiosClient.get<ServiceStatus>("/services/status");
    return res.data;
}

/**
 * FR-22 (admin only): full external-service settings.
 * Calls: GET /api/admin/services
 */
export async function fetchServiceSettings(): Promise<ServiceSettings> {
    const res = await axiosClient.get<ServiceSettings>("/admin/services");
    return res.data;
}

/**
 * FR-22 (admin only): save external-service settings; they apply on the next request.
 * Calls: PUT /api/admin/services
 */
export async function updateServiceSettings(data: UpdateServiceSettingsRequest): Promise<ServiceSettings> {
    const res = await axiosClient.put<ServiceSettings>("/admin/services", data);
    return res.data;
}

export type TestableService = "place-search" | "place-photos" | "ai";

// matches our backend ServiceTestResponse DTO
export interface ServiceTestResult {
    ok: boolean;
    latencyMs: number;
    message: string;
}

// matches our backend AiModelOption DTO
export interface AiModelOption {
    id: string;
    displayName: string;
}

/**
 * FR-22 (admin only): send one real request to an external service.
 * `model` tries an AI model before it is saved.
 * Calls: POST /api/admin/services/{service}/test
 */
export async function testService(service: TestableService, model?: string): Promise<ServiceTestResult> {
    const res = await axiosClient.post<ServiceTestResult>(`/admin/services/${service}/test`, null,
        { params: model ? { model } : undefined });
    return res.data;
}

/**
 * FR-22 (admin only): Gemini text models the backend's API key can use.
 * Calls: GET /api/admin/ai-models
 */
export async function fetchAiModels(): Promise<AiModelOption[]> {
    const res = await axiosClient.get<AiModelOption[]>("/admin/ai-models");
    return res.data;
}
