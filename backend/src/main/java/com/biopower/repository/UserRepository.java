package com.biopower.repository;

import com.biopower.model.entity.User;
import com.biopower.model.enums.UserStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface UserRepository extends JpaRepository<User, Long> {
    Optional<User> findByEmail(String email);
    Optional<User> findByIdentityUserId(String identityUserId);
    boolean existsByEmail(String email);
    List<User> findByStatus(UserStatus status);
}
