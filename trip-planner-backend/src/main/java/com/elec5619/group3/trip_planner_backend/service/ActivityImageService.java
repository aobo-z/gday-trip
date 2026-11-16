package com.elec5619.group3.trip_planner_backend.service;

import com.elec5619.group3.trip_planner_backend.entity.ActivityImage;
import com.elec5619.group3.trip_planner_backend.repository.*;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import javax.imageio.ImageIO;
import java.io.*;
import java.net.URI;
import java.util.*;

@Service
public class ActivityImageService {
    private final ActivityImageRepository images;
    private final ActivityRepository activities;
    private final UserRepository users;

    public ActivityImageService(ActivityImageRepository images, ActivityRepository activities, UserRepository users) {
        this.images = images; this.activities = activities; this.users = users;
    }

    @Transactional
    public String upload(MultipartFile file, Long userId) {
        if (file.isEmpty() || file.getSize() > 5 * 1024 * 1024) {
            throw new IllegalArgumentException("Choose a JPEG or PNG image up to 5 MB");
        }
        try (var input = ImageIO.createImageInputStream(file.getInputStream())) {
            var readers = ImageIO.getImageReaders(input);
            if (!readers.hasNext()) throw new IllegalArgumentException("Choose a JPEG or PNG image");
            var reader = readers.next();
            try {
                reader.setInput(input);
                String format = reader.getFormatName().toLowerCase(Locale.ROOT);
                if (!Set.of("jpeg", "png").contains(format)) throw new IllegalArgumentException("Choose a JPEG or PNG image");
                if ((long) reader.getWidth(0) * reader.getHeight(0) > 20_000_000) {
                    throw new IllegalArgumentException("Choose an image smaller than 20 megapixels");
                }
                // Re-encode validated pixels; do not retain embedded metadata or executable content.
                var output = new ByteArrayOutputStream();
                ImageIO.write(reader.read(0), format, output);
                if (output.size() > 10 * 1024 * 1024) throw new IllegalArgumentException("Image is too large; choose a smaller image");
                ActivityImage image = new ActivityImage();
                image.setId(UUID.randomUUID().toString());
                image.setUploadedBy(users.findById(userId).orElseThrow());
                image.setContentType("image/" + format); image.setData(output.toByteArray());
                images.save(image);
                return "/activity-images/" + image.getId();
            } finally { reader.dispose(); }
        } catch (IOException ex) { throw new IllegalArgumentException("This image could not be read"); }
    }

    @Transactional(readOnly = true)
    public ImageData read(String id, Long userId) {
        ActivityImage image = requireAccessible(id, userId);
        return new ImageData(image.getContentType(), image.getData());
    }

    @Transactional(readOnly = true)
    public List<String> validateUrls(List<String> urls, Long userId) {
        if (urls.size() > 8) throw new IllegalArgumentException("Use up to 8 images per activity");
        List<String> result = new ArrayList<>();
        for (String value : urls) {
            if (value == null || value.isBlank() || value.length() > 2048) throw new IllegalArgumentException("Invalid image URL");
            String url = value.trim();
            if (url.startsWith("/activity-images/")) {
                requireAccessible(url.substring("/activity-images/".length()), userId);
            } else {
                try {
                    URI uri = URI.create(url);
                    if (!("https".equals(uri.getScheme()) || "http".equals(uri.getScheme())) || uri.getHost() == null
                            || uri.getUserInfo() != null) throw new IllegalArgumentException();
                } catch (IllegalArgumentException ex) { throw new IllegalArgumentException("Image links must use http or https"); }
            }
            if (!result.contains(url)) result.add(url);
        }
        return result;
    }

    private ActivityImage requireAccessible(String id, Long userId) {
        ActivityImage image = images.findById(id).orElseThrow(() -> new NoSuchElementException("Image not found"));
        if (!image.getUploadedBy().getUserId().equals(userId)
                && activities.countAccessibleImage("/activity-images/" + id, userId) == 0) {
            throw new AccessDeniedException("Image is not available to you");
        }
        return image;
    }
    public record ImageData(String contentType, byte[] data) {}
}
