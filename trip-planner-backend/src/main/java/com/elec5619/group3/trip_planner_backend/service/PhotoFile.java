package com.elec5619.group3.trip_planner_backend.service;

import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;

/**
 * A downloaded Google place photo presented as an upload, so AI Planner photos go through the same
 * checks and re-encoding as images users upload themselves (ActivityImageService.upload).
 */
class PhotoFile implements MultipartFile {

    private final DiscoveryService.PlacePhoto photo;

    PhotoFile(DiscoveryService.PlacePhoto photo) {
        this.photo = photo;
    }

    @Override
    public String getName() {
        return "file";
    }

    @Override
    public String getOriginalFilename() {
        return "place-photo";
    }

    @Override
    public String getContentType() {
        return photo.contentType();
    }

    @Override
    public boolean isEmpty() {
        return photo.data().length == 0;
    }

    @Override
    public long getSize() {
        return photo.data().length;
    }

    @Override
    public byte[] getBytes() {
        return photo.data();
    }

    @Override
    public InputStream getInputStream() {
        return new ByteArrayInputStream(photo.data());
    }

    @Override
    public void transferTo(File dest) throws IOException {
        Files.write(dest.toPath(), photo.data());
    }
}
