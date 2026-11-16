import axiosClient from "./axiosClient";

// matches our backend AdminPageResponse DTO
export interface AdminPage<T> {
    items: T[];
    page: number;
    totalPages: number;
    totalItems: number;
}

// matches our backend AdminUserResponse DTO
export interface AdminUser {
    userId: number;
    username: string;
    email: string;
    role: string;
    disabled: boolean;
    createdAt: string;
}

// matches our backend AdminTripResponse DTO
export interface AdminTrip {
    tripId: number;
    name: string;
    destination: string;
    status: string;
    startDate: string;
    endDate: string;
    createdAt: string;
    owner: string | null;
    members: { username: string; role: string }[];
}

/**
 * FR-22: users matching a username or email, newest first, 10 per page.
 * Calls: GET /api/admin/users?query=&page=
 */
export async function fetchAdminUsers(query: string, page: number): Promise<AdminPage<AdminUser>> {
    const res = await axiosClient.get<AdminPage<AdminUser>>("/admin/users", { params: { query, page } });
    return res.data;
}

/**
 * FR-22: disable or re-enable an account. Administrator accounts are refused.
 * Calls: PUT /api/admin/users/{userId}/status
 */
export async function setUserDisabled(userId: number, disabled: boolean): Promise<AdminUser> {
    const res = await axiosClient.put<AdminUser>(`/admin/users/${userId}/status`, { disabled });
    return res.data;
}

/**
 * FR-22: trips matching a name or destination, newest first, 10 per page.
 * Calls: GET /api/admin/trips?query=&page=
 */
export async function fetchAdminTrips(query: string, page: number): Promise<AdminPage<AdminTrip>> {
    const res = await axiosClient.get<AdminPage<AdminTrip>>("/admin/trips", { params: { query, page } });
    return res.data;
}

/**
 * FR-22: delete a trip and everything in it.
 * Calls: DELETE /api/admin/trips/{tripId}
 */
export async function deleteAdminTrip(tripId: number): Promise<void> {
    await axiosClient.delete(`/admin/trips/${tripId}`);
}
