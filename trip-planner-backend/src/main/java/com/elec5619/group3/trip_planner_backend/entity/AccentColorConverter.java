package com.elec5619.group3.trip_planner_backend.entity;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

/**
 * Stores the theme by name. A value this version doesn't know (such as an accent from an older
 * release) reads as null, the default theme, instead of making the whole account unreadable.
 */
@Converter
public class AccentColorConverter implements AttributeConverter<AccentColor, String> {
    @Override
    public String convertToDatabaseColumn(AccentColor color) {
        return color == null ? null : color.name();
    }

    @Override
    public AccentColor convertToEntityAttribute(String value) {
        if (value == null) return null;
        try {
            return AccentColor.valueOf(value);
        } catch (IllegalArgumentException unknown) {
            return null;
        }
    }
}
