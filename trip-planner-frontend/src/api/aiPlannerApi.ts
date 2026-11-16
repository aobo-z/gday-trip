import axiosClient from "./axiosClient";
import type { TripResponse } from "./tripApi";

// Gemini can take close to a minute for a multi-day plan, and saving looks up every place,
// so both calls get far more than the client's default 30 seconds.
const PLANNER_TIMEOUT_MS = 120_000;

export type PlannerPace = "RELAXED" | "BALANCED" | "PACKED";

// matches our backend AiPlanRequest DTO
export interface AiPlanRequest {
    destination: string;
    startDate: string;
    days: number;
    travellers: number;
    budget: number | null;
    baseCurrency: string;
    interests: string[];
    pace: PlannerPace;
    notes: string;
}

// matches our backend AiPlanDraft DTO
export interface AiPlanDraft {
    tripName: string;
    destination: string;
    startDate: string;
    endDate: string;
    baseCurrency: string;
    plannedBudget: number;
    summary: string | null;
    budgetBreakdown: { category: string; amount: number }[];
    days: { date: string; theme: string | null }[];
    activities: {
        date: string;
        startTime: string | null;
        endTime: string | null;
        name: string;
        location: string;
        category: string;
        estimatedCost: number | null;
        description: string | null;
    }[];
}

// matches our backend SaveAiPlanRequest DTO
export interface SaveAiPlanRequest {
    tripName: string;
    destination: string;
    startDate: string;
    endDate: string;
    plannedBudget: number;
    baseCurrency: string;
    activities: {
        date: string;
        startTime: string | null;
        endTime: string | null;
        name: string;
        location: string;
        category: string;
        estimatedCost: number | null;
        description: string | null;
    }[];
}

/**
 * AI Planner: ask Gemini for an editable trip plan. Nothing is saved.
 * Calls: POST /api/ai-planner/draft
 */
export async function generatePlan(request: AiPlanRequest): Promise<AiPlanDraft> {
    const res = await axiosClient.post<AiPlanDraft>("/ai-planner/draft", request, { timeout: PLANNER_TIMEOUT_MS });
    return res.data;
}

/** A cover photo offered while reviewing a plan: a Google photo name and the landmark it shows. */
export interface AiCoverOption {
    landmark: string;
    photo: string;
}

/**
 * AI Planner: one photo for each of the destination's best-known landmarks (picked by the AI, photographed by Google).
 * Calls: GET /api/ai-planner/covers
 */
export async function fetchCoverOptions(destination: string): Promise<AiCoverOption[]> {
    const res = await axiosClient.get<AiCoverOption[]>("/ai-planner/covers", { params: { destination } });
    return res.data;
}

export async function fetchCoverPhoto(name: string): Promise<Blob> {
    const res = await axiosClient.get<Blob>("/ai-planner/covers/photo", { params: { name }, responseType: "blob" });
    return res.data;
}

/**
 * AI Planner: save the edited plan as a new trip, with every activity as a proposal.
 * Calls: POST /api/ai-planner/trips
 */
export async function savePlan(plan: SaveAiPlanRequest): Promise<TripResponse> {
    const res = await axiosClient.post<TripResponse>("/ai-planner/trips", plan, { timeout: PLANNER_TIMEOUT_MS });
    return res.data;
}
