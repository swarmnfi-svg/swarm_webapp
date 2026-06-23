# Database ER Diagram

```mermaid
erDiagram
    USERS ||--o{ USER_PLANTS : assigned
    PLANTS ||--o{ USER_PLANTS : has
    PLANTS ||--o{ SENSOR_NODES : contains
    PLANTS ||--o{ SENSOR_READINGS : generates
    PLANTS ||--o{ ALERTS : triggers
    PLANTS ||--o{ AI_RECOMMENDATIONS : receives
    PLANTS ||--o{ PREDICTIVE_MAINTENANCE : tracks
    PLANTS ||--o{ REPORTS : produces
    SENSOR_NODES ||--o{ SENSOR_READINGS : records

    USERS {
        bigint id PK
        varchar name
        varchar email UK
        varchar mobile
        varchar password
        enum role
        enum status
        timestamp created_at
    }

    PLANTS {
        bigint plant_id PK
        varchar plant_name
        enum plant_type
        varchar location
        double capacity
        varchar feedstock_type
        date installation_date
        enum status
        timestamp created_at
        timestamp updated_at
    }

    USER_PLANTS {
        bigint user_id FK
        bigint plant_id FK
    }

    SENSOR_NODES {
        bigint node_id PK
        bigint plant_id FK
        varchar node_name
        enum sensor_type
        varchar firmware_version
        int battery_level
        int signal_strength
        enum status
        timestamp last_reading_at
    }

    SENSOR_READINGS {
        bigint id PK
        bigint plant_id
        bigint node_id
        enum sensor_type
        double value
        timestamp recorded_at
    }

    ALERTS {
        bigint id PK
        bigint plant_id
        bigint node_id
        enum sensor_type
        varchar title
        text message
        enum severity
        enum status
        double threshold_value
        double actual_value
        timestamp created_at
    }

    AI_RECOMMENDATIONS {
        bigint id PK
        bigint plant_id
        enum issue_type
        text recommendation
        int health_score
        enum health_status
        boolean acknowledged
        timestamp created_at
    }

    PREDICTIVE_MAINTENANCE {
        bigint id PK
        bigint plant_id
        enum equipment_type
        varchar equipment_name
        int remaining_useful_life_days
        date estimated_failure_date
        double health_percentage
    }

    REPORTS {
        bigint id PK
        bigint plant_id
        enum report_type
        varchar title
        varchar file_path
        varchar file_format
        bigint generated_by
        timestamp created_at
    }

    SYSTEM_SETTINGS {
        bigint id PK
        varchar setting_key UK
        text setting_value
        varchar category
        varchar description
    }
```

## Relationships

- **Users ↔ Plants**: Many-to-many via `user_plants` junction table
- **Plants → Sensor Nodes**: One-to-many
- **Sensor Nodes → Readings**: One-to-many (denormalized plant_id on readings for query performance)
- **Plants → Alerts**: One-to-many
- **Plants → AI Recommendations**: One-to-many
- **Plants → Predictive Maintenance**: One-to-many
- **Plants → Reports**: One-to-many

## Indexes

- `sensor_readings(plant_id, recorded_at)` – Analytics queries
- `sensor_readings(node_id, recorded_at)` – Node-level history
- `users(email)` – Unique login lookup
- `system_settings(setting_key)` – Settings lookup
