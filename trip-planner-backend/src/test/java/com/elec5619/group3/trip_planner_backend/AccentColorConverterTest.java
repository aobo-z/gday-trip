package com.elec5619.group3.trip_planner_backend;

import com.elec5619.group3.trip_planner_backend.entity.AccentColor;
import com.elec5619.group3.trip_planner_backend.entity.AccentColorConverter;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class AccentColorConverterTest {
    private final AccentColorConverter converter = new AccentColorConverter();

    @Test
    void currentThemesRoundTrip() {
        assertThat(converter.convertToDatabaseColumn(AccentColor.OCEAN)).isEqualTo("OCEAN");
        assertThat(converter.convertToEntityAttribute("OCEAN")).isEqualTo(AccentColor.OCEAN);
        assertThat(converter.convertToEntityAttribute(null)).isNull();
    }

    @Test
    void anAccentFromAnOlderVersionReadsAsTheDefaultInsteadOfFailing() {
        // An account saved by an older release must still load (and sign in) on this one.
        assertThat(converter.convertToEntityAttribute("SAGE")).isNull();
    }
}
