-- BIOPOWER AI-IoT Plant Health Monitoring System
-- MySQL 8 Database Schema

CREATE DATABASE IF NOT EXISTS biopower_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE biopower_db;

CREATE TABLE IF NOT EXISTS users (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    identity_user_id VARCHAR(36) UNIQUE,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    mobile VARCHAR(20),
    password VARCHAR(255) NOT NULL,
    role ENUM('SUPER_ADMIN', 'PLANT_ADMIN', 'OPERATOR') NOT NULL,
    status ENUM('ACTIVE', 'INACTIVE', 'DISABLED') NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS plants (
    plant_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    plant_name VARCHAR(255) NOT NULL,
    plant_type ENUM('BIOGAS', 'BIO_CNG', 'SANITATION', 'STP', 'ORGANIC_WASTE', 'WASTE_TO_ENERGY') NOT NULL,
    location VARCHAR(500),
    capacity DOUBLE,
    feedstock_type VARCHAR(255),
    installation_date DATE,
    status ENUM('ACTIVE', 'INACTIVE', 'MAINTENANCE', 'OFFLINE') DEFAULT 'ACTIVE',
    enabled_sensor_types VARCHAR(1000),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_plants (
    user_id BIGINT NOT NULL,
    plant_id BIGINT NOT NULL,
    PRIMARY KEY (user_id, plant_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (plant_id) REFERENCES plants(plant_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sensor_nodes (
    node_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    plant_id BIGINT NOT NULL,
    node_name VARCHAR(255) NOT NULL,
    sensor_type ENUM('PH', 'TEMPERATURE', 'PRESSURE', 'GAS_FLOW', 'METHANE', 'CARBON_DIOXIDE', 'HYDROGEN_SULFIDE', 'AMMONIA', 'HUMIDITY', 'LIQUID_LEVEL', 'PRESSURE_TRANSMITTER', 'FLOW_TRANSMITTER', 'TEMPERATURE_TRANSMITTER') NOT NULL,
    firmware_version VARCHAR(50),
    battery_level INT,
    signal_strength INT,
    status ENUM('ACTIVE', 'INACTIVE', 'FAULTY', 'OFFLINE') DEFAULT 'ACTIVE',
    last_reading_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (plant_id) REFERENCES plants(plant_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sensor_readings (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    plant_id BIGINT NOT NULL,
    node_id BIGINT NOT NULL,
    sensor_type ENUM('PH', 'TEMPERATURE', 'PRESSURE', 'GAS_FLOW', 'METHANE', 'CARBON_DIOXIDE', 'HYDROGEN_SULFIDE', 'AMMONIA', 'HUMIDITY', 'LIQUID_LEVEL', 'PRESSURE_TRANSMITTER', 'FLOW_TRANSMITTER', 'TEMPERATURE_TRANSMITTER') NOT NULL,
    value DOUBLE NOT NULL,
    recorded_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_reading_plant_time (plant_id, recorded_at),
    INDEX idx_reading_node_time (node_id, recorded_at)
);

CREATE TABLE IF NOT EXISTS alerts (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    plant_id BIGINT NOT NULL,
    node_id BIGINT,
    sensor_type ENUM('PH', 'TEMPERATURE', 'PRESSURE', 'GAS_FLOW', 'METHANE', 'CARBON_DIOXIDE', 'HYDROGEN_SULFIDE', 'AMMONIA', 'HUMIDITY', 'LIQUID_LEVEL', 'PRESSURE_TRANSMITTER', 'FLOW_TRANSMITTER', 'TEMPERATURE_TRANSMITTER'),
    title VARCHAR(255) NOT NULL,
    message TEXT,
    severity ENUM('CRITICAL', 'WARNING', 'INFORMATION') NOT NULL,
    status ENUM('ACTIVE', 'ACKNOWLEDGED', 'RESOLVED') DEFAULT 'ACTIVE',
    threshold_value DOUBLE,
    actual_value DOUBLE,
    acknowledged_by BIGINT,
    acknowledged_at TIMESTAMP NULL,
    resolved_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ai_recommendations (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    plant_id BIGINT NOT NULL,
    issue_type ENUM('ACIDIFICATION', 'OVERFEEDING', 'UNDERFEEDING', 'GAS_YIELD_REDUCTION', 'SENSOR_FAILURE', 'PLANT_INSTABILITY') NOT NULL,
    recommendation TEXT NOT NULL,
    health_score INT,
    health_status ENUM('EXCELLENT', 'GOOD', 'AVERAGE', 'POOR', 'CRITICAL'),
    acknowledged BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS predictive_maintenance (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    plant_id BIGINT NOT NULL,
    equipment_type ENUM('PUMP', 'BLOWER', 'AGITATOR', 'COMPRESSOR', 'SENSOR') NOT NULL,
    equipment_name VARCHAR(255) NOT NULL,
    remaining_useful_life_days INT,
    estimated_failure_date DATE,
    health_percentage DOUBLE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reports (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    plant_id BIGINT,
    report_type ENUM('DAILY', 'WEEKLY', 'MONTHLY', 'PLANT_SUMMARY', 'GAS_PRODUCTION', 'ALERTS', 'PLANT_HEALTH') NOT NULL,
    title VARCHAR(255) NOT NULL,
    file_path VARCHAR(500),
    file_format VARCHAR(10),
    generated_by BIGINT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS system_settings (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    setting_key VARCHAR(100) NOT NULL UNIQUE,
    setting_value TEXT,
    category VARCHAR(50),
    description VARCHAR(500),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS partner_organizations (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    external_org_id VARCHAR(100) NOT NULL UNIQUE,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS partner_org_plants (
    org_id BIGINT NOT NULL,
    plant_id BIGINT NOT NULL,
    PRIMARY KEY (org_id, plant_id),
    FOREIGN KEY (org_id) REFERENCES partner_organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (plant_id) REFERENCES plants(plant_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS partner_api_keys (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    org_id BIGINT NOT NULL,
    key_hash VARCHAR(64) NOT NULL UNIQUE,
    key_prefix VARCHAR(16) NOT NULL,
    name VARCHAR(255) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    expires_at TIMESTAMP NULL,
    revoked_at TIMESTAMP NULL,
    last_used_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (org_id) REFERENCES partner_organizations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS hmi_equipment (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    plant_id BIGINT NOT NULL,
    tag_no VARCHAR(32) NOT NULL,
    name VARCHAR(255) NOT NULL,
    zone VARCHAR(32) NOT NULL,
    equipment_kind VARCHAR(32) NOT NULL,
    controllable BOOLEAN NOT NULL DEFAULT FALSE,
    sensor_node_id BIGINT NULL,
    sequence_order INT,
    motor_hp DOUBLE,
    capacity VARCHAR(64),
    hotspot_x DOUBLE,
    hotspot_y DOUBLE,
    hotspot_w DOUBLE,
    hotspot_h DOUBLE,
    UNIQUE KEY uk_hmi_equipment_plant_tag (plant_id, tag_no),
    FOREIGN KEY (plant_id) REFERENCES plants(plant_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS hmi_equipment_state (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    plant_id BIGINT NOT NULL,
    equipment_id BIGINT NOT NULL,
    powered BOOLEAN NOT NULL DEFAULT FALSE,
    running BOOLEAN NOT NULL DEFAULT FALSE,
    mode VARCHAR(16) NOT NULL DEFAULT 'OFF',
    last_changed_by BIGINT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_hmi_state_plant_equipment (plant_id, equipment_id),
    FOREIGN KEY (equipment_id) REFERENCES hmi_equipment(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS hmi_plant_state (
    plant_id BIGINT PRIMARY KEY,
    plant_powered BOOLEAN NOT NULL DEFAULT FALSE,
    auto_sequence_active BOOLEAN NOT NULL DEFAULT FALSE,
    auto_sequence_step INT DEFAULT 0,
    last_changed_by BIGINT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (plant_id) REFERENCES plants(plant_id) ON DELETE CASCADE
);
