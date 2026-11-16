import axiosClient from "./axiosClient";

// matches our backend ReviewableMemberResponse DTO
export interface ReviewableMember {
    userId: number;
    username: string;
    alreadyReviewed: boolean;
}

// matches our backend ReviewResponse DTO
export interface ReviewResponse {
    reviewId: number;
    /** Null when the viewer wasn't on that trip and it isn't shared. */
    tripId: number | null;
    tripName: string | null;
    reviewerId: number;
    reviewerName: string;
    revieweeId: number;
    revieweeName: string;
    rating: number;
    comment: string | null;
    createdAt: string;
}

// matches our backend UserReviewSummaryResponse DTO
export interface UserReviewSummary {
    averageRating: number;
    reviewCount: number;
    reviews: ReviewResponse[];
}

export interface CreateReviewRequest {
    revieweeId: number;
    rating: number;
    comment?: string;
}

/**
 * FR-20: List the other members of a completed trip and whether you've already reviewed each one.
 * Calls: GET /api/trips/{tripId}/reviews/reviewable-members
 */
export async function fetchReviewableMembers(tripId: number | string): Promise<ReviewableMember[]> {
    const res = await axiosClient.get<ReviewableMember[]>(`/trips/${tripId}/reviews/reviewable-members`);
    return res.data;
}

/**
 * FR-20: Submit a review for another member of a completed trip.
 * Calls: POST /api/trips/{tripId}/reviews
 */
export async function submitReview(tripId: number | string, data: CreateReviewRequest): Promise<ReviewResponse> {
    const res = await axiosClient.post<ReviewResponse>(`/trips/${tripId}/reviews`, data);
    return res.data;
}

/**
 * FR-20/FR-21: A user's average rating and received reviews.
 * Calls: GET /api/users/{userId}/reviews
 */
export async function fetchUserReviews(userId: number | string): Promise<UserReviewSummary> {
    const res = await axiosClient.get<UserReviewSummary>(`/users/${userId}/reviews`);
    return res.data;
}

/**
 * FR-20: Reviews the signed-in user has written to other travellers, newest first.
 * Calls: GET /api/users/me/reviews/written
 */
export async function fetchWrittenReviews(): Promise<ReviewResponse[]> {
    const res = await axiosClient.get<ReviewResponse[]>("/users/me/reviews/written");
    return res.data;
}
