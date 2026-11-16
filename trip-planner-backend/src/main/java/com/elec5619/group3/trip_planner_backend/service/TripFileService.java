package com.elec5619.group3.trip_planner_backend.service;

import com.elec5619.group3.trip_planner_backend.dto.TripFileActivityOption;
import com.elec5619.group3.trip_planner_backend.dto.TripFileResponse;
import com.elec5619.group3.trip_planner_backend.entity.Activity;
import com.elec5619.group3.trip_planner_backend.entity.TripFile;
import com.elec5619.group3.trip_planner_backend.entity.TripFileContent;
import com.elec5619.group3.trip_planner_backend.entity.TripMember;
import com.elec5619.group3.trip_planner_backend.exception.ResourceNotFoundException;
import com.elec5619.group3.trip_planner_backend.repository.ActivityRepository;
import com.elec5619.group3.trip_planner_backend.repository.TripFileContentRepository;
import com.elec5619.group3.trip_planner_backend.repository.TripFileRepository;
import com.elec5619.group3.trip_planner_backend.util.FileTypeDetector;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.Comparator;
import java.util.List;

/**
 * FR-18: Trip files and attachments.
 * Any active trip member can upload, list, view and download a trip's files.
 * A file can be removed by the member who uploaded it or by a trip owner.
 */
@Service
public class TripFileService {

    private final TripFileRepository fileRepository;
    private final TripFileContentRepository contentRepository;
    private final ActivityRepository activityRepository;
    private final TripMemberService tripMemberService;

    public TripFileService(
            TripFileRepository fileRepository,
            TripFileContentRepository contentRepository,
            ActivityRepository activityRepository,
            TripMemberService tripMemberService) {

        this.fileRepository = fileRepository;
        this.contentRepository = contentRepository;
        this.activityRepository = activityRepository;
        this.tripMemberService = tripMemberService;
    }

    /** What the download endpoint sends back. */
    public record FileDownload(String fileName, String contentType, byte[] data) {
    }

    /**
     * FR-18: The trip's files, newest first, or only those attached to one
     * activity when activityId is given.
     * Allowed: Any active trip member.
     */
    @Transactional(readOnly = true)
    public List<TripFileResponse> getFiles(
            Long tripId,
            Long activityId,
            Long currentUserId) {

        TripMember viewer = tripMemberService.verifyUserIsMember(tripId, currentUserId);

        List<TripFile> files = activityId == null
                ? fileRepository.findByTrip_TripIdOrderByUploadedAtDescFileIdDesc(tripId)
                : fileRepository.findByTrip_TripIdAndActivity_IdOrderByUploadedAtDescFileIdDesc(tripId, activityId);

        return files.stream()
                .map(file -> mapToResponse(file, viewer))
                .toList();
    }

    /**
     * FR-18: Upload a PDF or image, optionally attached to one of the trip's activities.
     * The type is detected from the file's bytes, not its name.
     * Allowed: Any active trip member.
     */
    @Transactional
    public TripFileResponse uploadFile(
            Long tripId,
            MultipartFile file,
            Long activityId,
            Long currentUserId) {

        TripMember uploader = tripMemberService.verifyUserIsMember(tripId, currentUserId);

        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("Please choose a file to upload");
        }
        if (file.getSize() > TripFile.MAX_BYTES) {
            throw new IllegalArgumentException("File must be 10 MB or smaller");
        }

        byte[] data;
        try {
            data = file.getBytes();
        } catch (IOException e) {
            throw new IllegalArgumentException("Could not read the uploaded file");
        }

        String contentType = FileTypeDetector.detect(data);
        if (contentType == null) {
            throw new IllegalArgumentException("Only PDF, JPEG, PNG and WebP files can be uploaded");
        }

        Activity activity = activityId == null ? null : findActivityInTrip(tripId, activityId);

        TripFile tripFile = new TripFile();
        tripFile.setTrip(uploader.getTrip());
        tripFile.setUploadedBy(uploader.getUser());
        tripFile.setActivity(activity);
        tripFile.setFileName(cleanFileName(file.getOriginalFilename(), contentType));
        tripFile.setContentType(contentType);
        tripFile.setSizeBytes(data.length);

        TripFile saved = fileRepository.save(tripFile);
        contentRepository.save(new TripFileContent(saved, data));

        return mapToResponse(saved, uploader);
    }

    /**
     * FR-18: A file's contents, for viewing or downloading.
     * Allowed: Any active trip member.
     */
    @Transactional(readOnly = true)
    public FileDownload downloadFile(
            Long tripId,
            Long fileId,
            Long currentUserId) {

        tripMemberService.verifyUserIsMember(tripId, currentUserId);

        TripFile file = findInTrip(tripId, fileId);
        byte[] data = contentRepository.findById(fileId)
                .map(TripFileContent::getData)
                .orElseThrow(() -> new ResourceNotFoundException("File not found"));

        return new FileDownload(file.getFileName(), file.getContentType(), data);
    }

    /**
     * FR-18: Remove a file.
     * Allowed: The member who uploaded it, or a trip owner.
     */
    @Transactional
    public void deleteFile(
            Long tripId,
            Long fileId,
            Long currentUserId) {

        TripMember caller = tripMemberService.verifyUserIsMember(tripId, currentUserId);
        TripFile file = fileRepository.lockById(fileId)
                .filter(found -> found.getTrip().getTripId().equals(tripId))
                .orElseThrow(() -> new ResourceNotFoundException("File not found"));

        if (!canDelete(file, caller)) {
            throw new AccessDeniedException("Only the uploader or a trip owner can remove this file");
        }

        contentRepository.deleteById(fileId);
        fileRepository.delete(file);
    }

    /**
     * FR-18: The trip's activities a file can be attached to.
     * Reads activities directly, so it never triggers the plan page's
     * sample-activity setup.
     * Allowed: Any active trip member.
     */
    @Transactional(readOnly = true)
    public List<TripFileActivityOption> getActivityOptions(
            Long tripId,
            Long currentUserId) {

        tripMemberService.verifyUserIsMember(tripId, currentUserId);

        return activityRepository.findByTrip_TripIdOrderByCreatedAtAscIdAsc(tripId)
                .stream()
                .map(activity -> new TripFileActivityOption(activity.getId(), activity.getName(), activity.getDate()))
                .sorted(Comparator.comparing(TripFileActivityOption::date, Comparator.nullsLast(Comparator.naturalOrder()))
                        .thenComparing(TripFileActivityOption::name, String.CASE_INSENSITIVE_ORDER))
                .toList();
    }

    // Something from another trip is reported as not found rather than
    // revealing that it exists.
    private TripFile findInTrip(Long tripId, Long fileId) {
        return fileRepository.findById(fileId)
                .filter(file -> file.getTrip().getTripId().equals(tripId))
                .orElseThrow(() -> new ResourceNotFoundException("File not found"));
    }

    private Activity findActivityInTrip(Long tripId, Long activityId) {
        return activityRepository.findById(activityId)
                .filter(activity -> activity.getTrip().getTripId().equals(tripId))
                .orElseThrow(() -> new ResourceNotFoundException("Activity not found in this trip"));
    }

    private boolean canDelete(TripFile file, TripMember caller) {
        return "OWNER".equals(caller.getRole())
                || file.getUploadedBy().getUserId().equals(caller.getUser().getUserId());
    }

    /**
     * Keeps just the file's own name: drops any folder path a browser sends,
     * removes control characters, and shortens it to fit the column while
     * keeping the extension.
     */
    static String cleanFileName(String original, String contentType) {
        String name = original == null ? "" : original.replace('\\', '/');
        name = name.substring(name.lastIndexOf('/') + 1);
        name = name.replaceAll("\\p{Cntrl}", "").strip();

        if (name.isEmpty() || name.chars().allMatch(c -> c == '.')) {
            name = "file" + extensionFor(contentType);
        }

        if (name.length() > TripFile.FILE_NAME_MAX) {
            int dot = name.lastIndexOf('.');
            String extension = dot > 0 && name.length() - dot <= 10 ? name.substring(dot) : "";
            int cut = TripFile.FILE_NAME_MAX - extension.length();
            // Don't split an emoji or other two-part character.
            if (Character.isHighSurrogate(name.charAt(cut - 1))) {
                cut--;
            }
            name = name.substring(0, cut) + extension;
        }
        return name;
    }

    private static String extensionFor(String contentType) {
        return switch (contentType) {
            case FileTypeDetector.PDF -> ".pdf";
            case FileTypeDetector.PNG -> ".png";
            case FileTypeDetector.WEBP -> ".webp";
            default -> ".jpg";
        };
    }

    private TripFileResponse mapToResponse(TripFile file, TripMember viewer) {
        Activity activity = file.getActivity();
        return TripFileResponse.builder()
                .fileId(file.getFileId())
                .tripId(file.getTrip().getTripId())
                .fileName(file.getFileName())
                .contentType(file.getContentType())
                .sizeBytes(file.getSizeBytes())
                .uploadedAt(file.getUploadedAt())
                .uploaderId(file.getUploadedBy().getUserId())
                .uploaderName(file.getUploadedBy().getUsername())
                .activityId(activity == null ? null : activity.getId())
                .activityName(activity == null ? null : activity.getName())
                .canDelete(canDelete(file, viewer))
                .build();
    }
}
