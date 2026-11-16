package com.elec5619.group3.trip_planner_backend.service;

import com.elec5619.group3.trip_planner_backend.dto.AiCoverOption;
import com.elec5619.group3.trip_planner_backend.dto.AiPlanDraft;
import com.elec5619.group3.trip_planner_backend.dto.AiPlanRequest;
import com.elec5619.group3.trip_planner_backend.dto.CreateActivityRequest;
import com.elec5619.group3.trip_planner_backend.dto.CreateTripRequest;
import com.elec5619.group3.trip_planner_backend.dto.SaveAiPlanRequest;
import com.elec5619.group3.trip_planner_backend.dto.TripResponse;
import com.elec5619.group3.trip_planner_backend.exception.ExternalServiceException;
import com.elec5619.group3.trip_planner_backend.service.DiscoveryService.PlaceMatch;
import com.elec5619.group3.trip_planner_backend.service.DiscoveryService.PlacePhoto;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * AI Planner: Gemini drafts a whole trip (activities, times, budget), the user edits it,
 * and saving creates the trip with every activity as a normal proposal for the group to vote on.
 */
@Service
public class AiPlannerService {

    static final int MAX_ACTIVITIES_PER_DAY = 6;
    private static final BigDecimal MAX_AMOUNT = new BigDecimal("99999999.99");
    private static final String AI_TAG = "AI plan";
    private static final int LOOKUP_THREADS = 6;
    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("H:mm");
    private static final DateTimeFormatter DAY_LABEL = DateTimeFormatter.ofPattern("EEE d MMM", Locale.ENGLISH);

    private static final Map<String, Object> RESPONSE_SCHEMA = object(Map.of(
            "destinationFound", Map.of("type", "BOOLEAN", "description", "False when the destination is not a real place you can identify"),
            "tripName", string("A short, friendly name for the trip"),
            "summary", string("One or two sentences describing the plan"),
            "suggestedBudget", number("Realistic total cost for all travellers, in the given currency"),
            "budgetBreakdown", array(object(Map.of(
                    "category", string("Accommodation, Food, Transport, Activities or Other"),
                    "amount", number("Total for all travellers")), List.of("category", "amount"))),
            "days", array(object(Map.of(
                    "dayNumber", Map.of("type", "INTEGER"),
                    "theme", string("A few words summing up the day"),
                    "activities", array(object(Map.of(
                            "name", string("The real place or experience, as it would be found on a map"),
                            "location", string("Neighbourhood or street address"),
                            "category", string("e.g. Food, Museum, Nature, Landmark, Shopping, Nightlife"),
                            "startTime", string("24-hour HH:mm"),
                            "endTime", string("24-hour HH:mm"),
                            "estimatedCost", number("Total for all travellers; 0 if free"),
                            "description", string("One or two sentences on why it is worth doing")),
                            List.of("name", "location", "category", "startTime", "endTime", "estimatedCost")))),
                    List.of("dayNumber", "theme", "activities")))),
            List.of("destinationFound", "tripName", "summary", "suggestedBudget", "budgetBreakdown", "days"));

    private static final int PHOTOS_PER_LANDMARK = 1;
    private static final Map<String, Object> LANDMARK_SCHEMA = object(Map.of(
            "landmarks", array(string("A landmark's name as found on Google Maps"))), List.of("landmarks"));

    private final ServiceSettingsService settings;
    private final GeminiClient gemini;
    private final ObjectMapper json;
    private final TripService tripService;
    private final ActivityService activityService;
    private final DiscoveryService discovery;
    private final ActivityImageService activityImages;
    private final TransactionTemplate transaction;

    public AiPlannerService(ServiceSettingsService settings, GeminiClient gemini, ObjectMapper json,
                            TripService tripService, ActivityService activityService,
                            DiscoveryService discovery, ActivityImageService activityImages,
                            TransactionTemplate transaction) {
        this.settings = settings;
        this.gemini = gemini;
        this.json = json;
        this.tripService = tripService;
        this.activityService = activityService;
        this.discovery = discovery;
        this.activityImages = activityImages;
        this.transaction = transaction;
    }

    public AiPlanDraft draft(AiPlanRequest request) {
        settings.requireEnabled(ServiceSettingsService.ExternalService.AI_RECOMMENDATIONS);
        String currency = currency(request.getBaseCurrency());
        String destination = request.getDestination().trim();
        LocalDate start = request.getStartDate();
        LocalDate end = start.plusDays(request.getDays() - 1L);

        String reply = gemini.generate(prompt(request, destination, currency, end),
                Map.of("responseMimeType", "application/json", "responseSchema", RESPONSE_SCHEMA));
        if (reply == null || reply.isBlank()) {
            throw new ExternalServiceException("The AI didn't return a plan. Please try again.");
        }
        ModelPlan plan;
        try {
            plan = json.readValue(reply, ModelPlan.class);
        } catch (JacksonException e) {
            throw new ExternalServiceException("The AI returned a plan that couldn't be read. Please try again.");
        }
        if (Boolean.FALSE.equals(plan.destinationFound())) {
            throw new IllegalArgumentException("We couldn't find \"" + destination + "\". Check the spelling or try a nearby city.");
        }
        return normalise(plan, request, destination, currency, start, end);
    }

    /**
     * Cover choices while the plan is reviewed. A search for the destination's name alone often
     * returns unrelated photos, so Gemini first names the destination's two best-known landmarks and
     * Google Places supplies photos of each. Without AI (switched off or failing) the destination
     * itself is searched instead.
     */
    public List<AiCoverOption> coverOptions(String destination) {
        String place = clip(destination, 100);
        List<AiCoverOption> options = new ArrayList<>();
        for (String landmark : landmarks(place)) {
            discovery.destinationPhotos(clip(landmark + ", " + place, 200)).stream()
                    .limit(PHOTOS_PER_LANDMARK)
                    .forEach(photo -> options.add(new AiCoverOption(landmark, photo)));
        }
        if (options.isEmpty()) {
            discovery.destinationPhotos(place).forEach(photo -> options.add(new AiCoverOption(place, photo)));
        }
        return options;
    }

    /** Up to two famous, photogenic landmarks of the destination, or none when the AI can't help. */
    private List<String> landmarks(String destination) {
        if (destination.isBlank() || !settings.isEnabled(ServiceSettingsService.ExternalService.AI_RECOMMENDATIONS)) return List.of();
        try {
            String reply = gemini.generate("""
                    Name the two most famous landmarks or buildings of %s that best represent it in a photo,
                    exactly as each would be found on Google Maps. Only real places in or right next to %s.
                    If you don't know %s as a real place, return an empty list.
                    """.formatted(destination, destination, destination),
                    Map.of("responseMimeType", "application/json", "responseSchema", LANDMARK_SCHEMA));
            if (reply == null || reply.isBlank()) return List.of();
            List<String> names = json.readValue(reply, ModelLandmarks.class).landmarks();
            return names == null ? List.of() : names.stream().filter(AiPlannerService::hasText)
                    .map(name -> clip(name.trim(), 120)).distinct().limit(2).toList();
        } catch (ExternalServiceException | JacksonException e) {
            return List.of();
        }
    }

    public DiscoveryService.PlacePhoto coverPhoto(String photoName) {
        return discovery.photo(photoName);
    }

    public TripResponse save(SaveAiPlanRequest request, Long userId) {
        if (request.getEndDate().isBefore(request.getStartDate())) {
            throw new IllegalArgumentException("End date cannot be before start date");
        }
        String currency = currency(request.getBaseCurrency());
        for (SaveAiPlanRequest.Activity activity : request.getActivities()) {
            validateSchedule(activity, request.getStartDate(), request.getEndDate());
        }
        // Google is called before the transaction opens, so no database connection waits on it.
        List<FoundPlace> places = findAll(request.getActivities(), request.getDestination().trim());
        // Each photo is stored in its own transaction, so a photo the image check rejects can't roll back the plan.
        List<String> imageUrls = places.stream().map(place -> storePhoto(place, userId)).toList();

        return transaction.execute(status -> {
            TripResponse trip = tripService.createTrip(tripRequest(request, currency), userId);
            for (int i = 0; i < request.getActivities().size(); i++) {
                activityService.create(trip.getTripId(), activityRequest(request.getActivities().get(i),
                        places.get(i).match(), imageUrls.get(i), currency), userId);
            }
            return trip;
        });
    }

    /** What Google knows about one planned activity; either part may be missing. */
    private record FoundPlace(PlaceMatch match, PlacePhoto photo) {
    }

    private String prompt(AiPlanRequest request, String destination, String currency, LocalDate end) {
        String interests = request.getInterests() == null || request.getInterests().isEmpty()
                ? "a mix of highlights" : String.join(", ", request.getInterests());
        String budget = request.getBudget() == null
                ? "Not set: suggest a realistic total in " + currency + "."
                : request.getBudget().toPlainString() + " " + currency + " in total; keep the plan within it.";
        String notes = request.getNotes() == null || request.getNotes().isBlank() ? "None" : request.getNotes().trim();
        return """
                Plan a trip itinerary.
                Destination: %s
                Dates: %s to %s (%d days)
                Travellers: %d
                Budget: %s
                Interests: %s
                Pace: %s
                Traveller notes: %s

                Rules:
                - Return exactly %d days, dayNumber 1 to %d in order.
                - Use only real, specific places in or near the destination that can be found on a map.
                - Times are 24-hour HH:mm between 07:00 and 23:00; activities on the same day must not overlap.
                - Costs are totals for all travellers in %s; use 0 for free activities.
                - budgetBreakdown covers accommodation, food, transport and activities and adds up to suggestedBudget.
                - Write in English.
                - If the destination is not a real place you can identify (random letters, a fictional or made-up name),
                  set destinationFound to false and return empty days and budgetBreakdown. A small spelling slip of a
                  real place is fine: plan for that place.
                """.formatted(destination, request.getStartDate(), end, request.getDays(), request.getTravellers(),
                budget, interests, paceRule(request.getPace()), notes, request.getDays(), request.getDays(), currency);
    }

    private static String paceRule(AiPlanRequest.Pace pace) {
        return switch (pace) {
            case RELAXED -> "relaxed, 2 to 3 activities a day";
            case BALANCED -> "balanced, 3 to 4 activities a day";
            case PACKED -> "packed, 5 to 6 activities a day";
        };
    }

    /** Trusts nothing from the model: dates come from the request, and bad values are dropped or cleared. */
    private AiPlanDraft normalise(ModelPlan plan, AiPlanRequest request, String destination, String currency,
                                  LocalDate start, LocalDate end) {
        List<ModelDay> modelDays = new ArrayList<>(plan.days() == null ? List.of() : plan.days());
        modelDays.removeIf(day -> day == null);
        modelDays.sort(Comparator.comparing(ModelDay::dayNumber, Comparator.nullsLast(Comparator.naturalOrder())));

        List<AiPlanDraft.DayTheme> days = new ArrayList<>();
        List<AiPlanDraft.PlannedActivity> activities = new ArrayList<>();
        for (int i = 0; i < request.getDays() && i < modelDays.size(); i++) {
            LocalDate date = start.plusDays(i);
            ModelDay day = modelDays.get(i);
            days.add(new AiPlanDraft.DayTheme(date, clip(day.theme(), 80)));
            (day.activities() == null ? List.<ModelActivity>of() : day.activities()).stream()
                    .filter(activity -> activity != null && hasText(activity.name()))
                    .limit(MAX_ACTIVITIES_PER_DAY)
                    .map(activity -> plannedActivity(activity, date, destination))
                    .forEach(activities::add);
        }
        if (activities.isEmpty()) {
            throw new ExternalServiceException("The AI returned a plan without any activities. Please try again.");
        }

        BigDecimal budget = request.getBudget() != null ? amount(request.getBudget())
                : Optional.ofNullable(amount(plan.suggestedBudget()))
                        .orElseGet(() -> activities.stream().map(AiPlanDraft.PlannedActivity::estimatedCost)
                                .filter(cost -> cost != null).reduce(BigDecimal.ZERO, BigDecimal::add));
        List<AiPlanDraft.BudgetLine> breakdown = (plan.budgetBreakdown() == null ? List.<ModelBudgetLine>of() : plan.budgetBreakdown())
                .stream()
                .filter(line -> line != null && hasText(line.category()) && amount(line.amount()) != null)
                .limit(8)
                .map(line -> new AiPlanDraft.BudgetLine(clip(line.category(), 40), amount(line.amount())))
                .toList();
        String tripName = hasText(plan.tripName()) ? clip(plan.tripName(), 100) : clip(destination + " trip", 100);

        return new AiPlanDraft(tripName, destination, start, end, currency, budget, clip(plan.summary(), 500),
                breakdown, days, activities);
    }

    private static AiPlanDraft.PlannedActivity plannedActivity(ModelActivity activity, LocalDate date, String destination) {
        LocalTime startTime = time(activity.startTime());
        LocalTime endTime = time(activity.endTime());
        if (startTime == null || endTime == null || !endTime.isAfter(startTime)) {
            startTime = null;
            endTime = null;
        }
        return new AiPlanDraft.PlannedActivity(date, startTime, endTime, clip(activity.name(), 160),
                hasText(activity.location()) ? clip(activity.location(), 200) : destination,
                hasText(activity.category()) ? clip(activity.category(), 80) : "Activity",
                amount(activity.estimatedCost()), clip(activity.description(), 1000));
    }

    private static void validateSchedule(SaveAiPlanRequest.Activity activity, LocalDate start, LocalDate end) {
        if (activity.getDate() != null && (activity.getDate().isBefore(start) || activity.getDate().isAfter(end))) {
            throw new IllegalArgumentException("\"" + activity.getName() + "\" is outside the trip dates");
        }
        boolean hasStart = activity.getStartTime() != null;
        if (hasStart != (activity.getEndTime() != null)
                || (hasStart && !activity.getEndTime().isAfter(activity.getStartTime()))) {
            throw new IllegalArgumentException("\"" + activity.getName() + "\" needs an end time after its start time");
        }
    }

    private List<FoundPlace> findAll(List<SaveAiPlanRequest.Activity> activities, String destination) {
        ExecutorService pool = Executors.newFixedThreadPool(Math.min(LOOKUP_THREADS, activities.size()));
        try {
            List<CompletableFuture<FoundPlace>> lookups = activities.stream()
                    .map(activity -> CompletableFuture.supplyAsync(() -> find(activity, destination), pool))
                    .toList();
            return lookups.stream().map(CompletableFuture::join).toList();
        } finally {
            pool.shutdown();
        }
    }

    private FoundPlace find(SaveAiPlanRequest.Activity activity, String destination) {
        PlaceMatch match = discovery.locate(activity.getName().trim() + ", " + activity.getLocation().trim(), destination)
                .orElse(null);
        PlacePhoto photo = match == null ? null : discovery.findPhoto(match.placeId()).orElse(null);
        return new FoundPlace(match, photo);
    }

    /** Stores a Google photo the same way as a user upload (format check, re-encode); null if there's none or it's refused. */
    private String storePhoto(FoundPlace place, Long userId) {
        if (place.photo() == null) return null;
        try {
            return activityImages.upload(new PhotoFile(place.photo()), userId);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private static CreateTripRequest tripRequest(SaveAiPlanRequest request, String currency) {
        CreateTripRequest trip = new CreateTripRequest();
        trip.setName(request.getTripName().trim());
        trip.setDestination(request.getDestination().trim());
        trip.setStartDate(request.getStartDate());
        trip.setEndDate(request.getEndDate());
        trip.setPlannedBudget(request.getPlannedBudget());
        trip.setBaseCurrency(currency);
        return trip;
    }

    // Saved as a proposal (no date), so it goes through voting like any other idea;
    // the suggested slot and cost stay visible in the description.
    private static CreateActivityRequest activityRequest(SaveAiPlanRequest.Activity activity, PlaceMatch place,
                                                         String imageUrl, String currency) {
        CreateActivityRequest proposal = new CreateActivityRequest();
        proposal.setName(activity.getName().trim());
        proposal.setLocation(activity.getLocation().trim());
        proposal.setCategory(activity.getCategory().trim());
        proposal.setDescription(clip(suggestion(activity, currency)
                + (hasText(activity.getDescription()) ? "\n\n" + activity.getDescription().trim() : ""), 2000));
        proposal.setTags(List.of(AI_TAG));
        proposal.setImageUrls(imageUrl == null ? List.of() : List.of(imageUrl));
        if (place != null) {
            proposal.setLatitude(place.latitude());
            proposal.setLongitude(place.longitude());
        }
        return proposal;
    }

    static String suggestion(SaveAiPlanRequest.Activity activity, String currency) {
        StringBuilder text = new StringBuilder("AI Planner suggestion");
        if (activity.getDate() != null) text.append(" · ").append(activity.getDate().format(DAY_LABEL));
        if (activity.getStartTime() != null) {
            text.append(" · ").append(activity.getStartTime().format(TIME)).append("–").append(activity.getEndTime().format(TIME));
        }
        if (activity.getEstimatedCost() != null) {
            text.append(" · est. ").append(currency).append(" ").append(activity.getEstimatedCost().setScale(2, RoundingMode.HALF_UP));
        }
        return text.toString();
    }

    private static String currency(String code) {
        return CurrencyService.validateCode(code == null || code.isBlank() ? "AUD" : code.trim().toUpperCase(Locale.ROOT));
    }

    private static LocalTime time(String value) {
        if (value == null) return null;
        try {
            return LocalTime.parse(value.trim(), TIME);
        } catch (DateTimeParseException e) {
            return null;
        }
    }

    private static BigDecimal amount(BigDecimal value) {
        if (value == null || value.signum() < 0 || value.compareTo(MAX_AMOUNT) > 0) return null;
        return value.setScale(2, RoundingMode.HALF_UP);
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }

    private static String clip(String value, int max) {
        if (value == null) return null;
        String trimmed = value.trim();
        return trimmed.length() <= max ? trimmed : trimmed.substring(0, max).trim();
    }

    private static Map<String, Object> object(Map<String, Object> properties, List<String> required) {
        return Map.of("type", "OBJECT", "properties", properties, "required", required);
    }

    private static Map<String, Object> array(Map<String, Object> items) {
        return Map.of("type", "ARRAY", "items", items);
    }

    private static Map<String, Object> string(String description) {
        return Map.of("type", "STRING", "description", description);
    }

    private static Map<String, Object> number(String description) {
        return Map.of("type", "NUMBER", "description", description);
    }

    private record ModelPlan(Boolean destinationFound, String tripName, String summary, BigDecimal suggestedBudget,
                             List<ModelBudgetLine> budgetBreakdown, List<ModelDay> days) {
    }

    private record ModelLandmarks(List<String> landmarks) {
    }

    private record ModelBudgetLine(String category, BigDecimal amount) {
    }

    private record ModelDay(Integer dayNumber, String theme, List<ModelActivity> activities) {
    }

    private record ModelActivity(String name, String location, String category, String startTime, String endTime,
                                 BigDecimal estimatedCost, String description) {
    }
}
