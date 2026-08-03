package com.biopower.novaspace.repository;

import com.biopower.novaspace.model.NovaMessage;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface NovaMessageRepository extends JpaRepository<NovaMessage, Long> {
    List<NovaMessage> findByThreadIdOrderByCreatedAtAsc(Long threadId);

    void deleteByThreadId(Long threadId);
}
