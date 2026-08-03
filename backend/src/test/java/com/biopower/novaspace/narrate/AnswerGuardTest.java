package com.biopower.novaspace.narrate;

import com.biopower.novaspace.facts.FactPack;
import com.biopower.novaspace.facts.MetricFact;
import com.biopower.novaspace.facts.QualityFlag;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class AnswerGuardTest {

    private final AnswerGuard guard = new AnswerGuard();

    @Test
    void passesValidAnswer() {
        FactPack facts = FactPack.builder()
                .metrics(List.of(MetricFact.builder()
                        .metric("PH")
                        .value(7.2)
                        .unit("pH")
                        .quality(QualityFlag.GOOD)
                        .build()))
                .build();
        assertDoesNotThrow(() -> guard.verify("Latest pH: 7.2 pH", facts));
    }
}
