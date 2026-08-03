package com.biopower.novaspace.core;

import com.biopower.model.entity.Plant;
import com.biopower.novaspace.api.*;
import com.biopower.novaspace.config.NovaSpaceOpProperties;
import com.biopower.novaspace.facts.FactPack;
import com.biopower.novaspace.facts.MetricFact;
import com.biopower.novaspace.facts.ProvenanceLink;
import com.biopower.novaspace.model.NovaMessage;
import com.biopower.novaspace.model.NovaThread;
import com.biopower.novaspace.narrate.AnswerGuard;
import com.biopower.novaspace.narrate.NovaNarrateService;
import com.biopower.novaspace.permissions.NovaToolPermissionService;
import com.biopower.novaspace.plan.NovaPlan;
import com.biopower.novaspace.plan.NovaPlanBuilder;
import com.biopower.novaspace.plan.NovaPlanStep;
import com.biopower.novaspace.repository.NovaMessageRepository;
import com.biopower.novaspace.repository.NovaThreadRepository;
import com.biopower.novaspace.search.SwarmSearchSlots;
import com.biopower.novaspace.skills.*;
import com.biopower.novaspace.think.NovaThinkService;
import com.biopower.repository.PlantRepository;
import com.biopower.security.UserPrincipal;
import com.biopower.service.PlantAccessService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class NovaSpaceOpService {

    private static final Pattern PLANT_ID_CLARIFY = Pattern.compile(
            "(?:use\\s+plant\\s+id|plant\\s*id|plant:)\\s*(\\d+)", Pattern.CASE_INSENSITIVE);

    private final NovaSpaceOpProperties properties;
    private final PlantAccessService plantAccessService;
    private final PlantRepository plantRepository;
    private final NovaPlanBuilder planBuilder;
    private final NovaToolPermissionService permissions;
    private final NovaSkillRegistry skillRegistry;
    private final NovaNarrateService narrateService;
    private final NovaThinkService novaThinkService;
    private final AnswerGuard answerGuard;
    private final NovaThreadRepository threadRepository;
    private final NovaMessageRepository messageRepository;

    @Transactional
    public NovaSpaceOpChatResponse chat(UserPrincipal principal, NovaChatRequest request) {
        if (!properties.isEnabled()) {
            return NovaSpaceOpChatResponse.builder()
                    .ok(false)
                    .answer("Nova Space OP is disabled.")
                    .build();
        }

        NovaThread thread = resolveThread(principal, request.getThreadId());
        Long stickyPlantId = thread.getStickyPlantId();

        SwarmSearchSlots slots = SwarmSearchSlots.parse(request.getMessage(), stickyPlantId);
        if (properties.getThink().isEnabled()
                && slots.confidence() < properties.getThink().getConfidenceThreshold()) {
            slots = novaThinkService.refine(request.getMessage(), slots, stickyPlantId);
        }

        Long plantId = null;
        String plantName = null;
        if (slots.isPlantScoped()) {
            plantId = resolvePlantId(principal, request.getMessage(), slots.plantIdHint(), thread);
            if (plantId == null) {
                List<NovaClarifyOption> options = buildPlantClarifyOptions(principal);
                return NovaSpaceOpChatResponse.builder()
                        .ok(true)
                        .threadId(thread.getId())
                        .clarifyKind("plant")
                        .clarifyOptions(options)
                        .answer("Which plant should I use for this question?")
                        .build();
            }
            thread.setStickyPlantId(plantId);
            threadRepository.save(thread);
            Plant plant = plantRepository.findById(plantId).orElse(null);
            plantName = plant != null ? plant.getPlantName() : "Plant";
        }

        NovaPlan plan = planBuilder.build(
                SwarmSearchSlots.builder()
                        .intent(slots.intent())
                        .primaryToolId(slots.primaryToolId())
                        .sensorType(slots.sensorType())
                        .plantIdHint(plantId)
                        .confidence(slots.confidence())
                        .periodLabel(slots.periodLabel())
                        .build(),
                principal,
                permissions);

        if (plan.steps().isEmpty()) {
            return NovaSpaceOpChatResponse.builder()
                    .ok(true)
                    .threadId(thread.getId())
                    .answer("You do not have permission to run the tools needed for this question.")
                    .build();
        }

        NovaPlanStep step = plan.steps().get(0);
        NovaSkill skill = skillRegistry.get(step.toolId()).orElse(null);
        if (skill == null) {
            return NovaSpaceOpChatResponse.builder()
                    .ok(false)
                    .threadId(thread.getId())
                    .answer("Requested capability is not available.")
                    .build();
        }

        LocalDateTime end = LocalDateTime.now();
        NovaSkillContext ctx = NovaSkillContext.builder()
                .principal(principal)
                .query(request.getMessage())
                .plantId(plantId)
                .plantName(plantName)
                .sensorType(slots.sensorType())
                .rangeStart(end.minusDays(7))
                .rangeEnd(end)
                .periodLabel(slots.periodLabel())
                .build();

        NovaSkillResult result = skill.execute(ctx);
        if (result.denied()) {
            return NovaSpaceOpChatResponse.builder()
                    .ok(true)
                    .threadId(thread.getId())
                    .answer("Access denied: " + result.denialReason())
                    .build();
        }
        if (!result.ok() || result.factPack() == null) {
            return NovaSpaceOpChatResponse.builder()
                    .ok(true)
                    .threadId(thread.getId())
                    .answer("I could not find telemetry data for that question.")
                    .toolsUsed(List.of(step.toolId()))
                    .build();
        }

        FactPack facts = result.factPack();
        String answer;
        try {
            answer = narrateService.format(facts, request.getMessage());
            answerGuard.verify(answer, facts);
        } catch (AnswerGuard.AnswerGuardException ex) {
            answer = narrateService.format(facts, request.getMessage());
        }

        saveMessages(thread, request.getMessage(), answer, step.toolId());

        return NovaSpaceOpChatResponse.builder()
                .ok(true)
                .threadId(thread.getId())
                .answer(answer)
                .toolsUsed(List.of(step.toolId()))
                .provenance(toProvenance(facts))
                .links(toLinks(facts))
                .build();
    }

    @Transactional(readOnly = true)
    public List<NovaThread> listThreads(UserPrincipal principal) {
        return threadRepository.findByUserIdOrderByUpdatedAtDesc(principal.getId());
    }

    @Transactional(readOnly = true)
    public List<NovaMessage> getMessages(UserPrincipal principal, Long threadId) {
        threadRepository.findByIdAndUserId(threadId, principal.getId())
                .orElseThrow(() -> new IllegalArgumentException("Thread not found"));
        return messageRepository.findByThreadIdOrderByCreatedAtAsc(threadId);
    }

    @Transactional
    public void clearThread(UserPrincipal principal, Long threadId) {
        NovaThread thread = threadRepository.findByIdAndUserId(threadId, principal.getId())
                .orElseThrow(() -> new IllegalArgumentException("Thread not found"));
        messageRepository.deleteByThreadId(thread.getId());
        thread.setStickyPlantId(null);
        threadRepository.save(thread);
    }

    private NovaThread resolveThread(UserPrincipal principal, Long threadId) {
        if (threadId != null) {
            return threadRepository.findByIdAndUserId(threadId, principal.getId())
                    .orElseGet(() -> createThread(principal));
        }
        return createThread(principal);
    }

    private NovaThread createThread(UserPrincipal principal) {
        return threadRepository.save(NovaThread.builder()
                .userId(principal.getId())
                .title("Nova Space OP")
                .build());
    }

    private Long resolvePlantId(UserPrincipal principal, String query, Long hint, NovaThread thread) {
        if (hint != null) {
            plantAccessService.assertCanAccessPlant(principal, hint);
            return hint;
        }
        Matcher clarifyId = PLANT_ID_CLARIFY.matcher(query);
        if (clarifyId.find()) {
            Long id = Long.parseLong(clarifyId.group(1));
            plantAccessService.assertCanAccessPlant(principal, id);
            return id;
        }
        String q = query.toLowerCase(Locale.ROOT);
        if (q.startsWith("use plant:")) {
            String label = query.substring("use plant:".length()).trim().toLowerCase(Locale.ROOT);
            for (Long pid : plantAccessService.resolveAccessiblePlantIds(principal)) {
                Optional<Plant> plant = plantRepository.findById(pid);
                if (plant.isPresent() && plant.get().getPlantName().equalsIgnoreCase(label)) {
                    return pid;
                }
            }
        }
        if (thread.getStickyPlantId() != null) {
            return thread.getStickyPlantId();
        }
        List<Long> accessible = plantAccessService.resolveAccessiblePlantIds(principal);
        if (accessible.isEmpty()) {
            return null;
        }
        for (Long pid : accessible) {
            Optional<Plant> plant = plantRepository.findById(pid);
            if (plant.isPresent() && q.contains(plant.get().getPlantName().toLowerCase(Locale.ROOT).split(" ")[0])) {
                return pid;
            }
        }
        if (accessible.size() == 1) {
            return accessible.get(0);
        }
        return null;
    }

    private List<NovaClarifyOption> buildPlantClarifyOptions(UserPrincipal principal) {
        List<Long> ids = plantAccessService.resolveAccessiblePlantIds(principal);
        List<NovaClarifyOption> options = new ArrayList<>();
        for (Long id : ids) {
            plantRepository.findById(id).ifPresent(p -> options.add(NovaClarifyOption.builder()
                    .id(String.valueOf(p.getPlantId()))
                    .label(p.getPlantName())
                    .kind("plant")
                    .build()));
        }
        return options;
    }

    private void saveMessages(NovaThread thread, String userMsg, String answer, String toolId) {
        messageRepository.save(NovaMessage.builder()
                .threadId(thread.getId())
                .role("user")
                .content(userMsg)
                .build());
        messageRepository.save(NovaMessage.builder()
                .threadId(thread.getId())
                .role("assistant")
                .content(answer)
                .toolsUsed(toolId)
                .build());
    }

    private List<NovaProvenanceDto> toProvenance(FactPack facts) {
        if (facts.metrics() == null) {
            return List.of();
        }
        return facts.metrics().stream()
                .map(m -> NovaProvenanceDto.builder()
                        .metric(m.metric())
                        .plantId(m.plantId())
                        .sourceTool("nova-space-op")
                        .build())
                .collect(Collectors.toList());
    }

    private List<NovaLinkDto> toLinks(FactPack facts) {
        if (facts.links() == null) {
            return List.of();
        }
        return facts.links().stream()
                .map(l -> NovaLinkDto.builder().label(l.label()).path(l.path()).build())
                .collect(Collectors.toList());
    }
}
