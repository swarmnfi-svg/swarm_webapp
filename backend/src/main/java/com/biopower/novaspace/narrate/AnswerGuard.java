package com.biopower.novaspace.narrate;

import com.biopower.novaspace.facts.FactPack;
import com.biopower.novaspace.facts.MetricFact;
import org.springframework.stereotype.Component;

import java.util.regex.Pattern;

@Component
public class AnswerGuard {

    private static final Pattern INVENTED_SENSOR = Pattern.compile("sensor\\s+ID\\s+\\d{6,}", Pattern.CASE_INSENSITIVE);

    public void verify(String answer, FactPack facts) {
        if (answer == null || facts == null) {
            return;
        }
        if (INVENTED_SENSOR.matcher(answer).find()) {
            throw new AnswerGuardException("Answer contains unverified sensor reference");
        }
        if (facts.metrics() != null) {
            for (MetricFact m : facts.metrics()) {
                if (m.value() != null && m.value() == 0.0
                        && m.quality() == com.biopower.novaspace.facts.QualityFlag.MISSING) {
                    throw new AnswerGuardException("Answer may invent zero for missing data");
                }
            }
        }
    }

    public static class AnswerGuardException extends RuntimeException {
        public AnswerGuardException(String message) {
            super(message);
        }
    }
}
