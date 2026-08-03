package com.biopower.novaspace.repository;

import com.biopower.novaspace.model.NovaThread;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface NovaThreadRepository extends JpaRepository<NovaThread, Long> {
    List<NovaThread> findByUserIdOrderByUpdatedAtDesc(Long userId);

    Optional<NovaThread> findByIdAndUserId(Long id, Long userId);
}
