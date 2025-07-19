# Database Schema Documentation

## Overview
This document describes the database schema for the RIBS Tracker application, including all tables, columns, indexes, and relationships.

## Schema Version Management
The database includes automatic schema versioning and migration capabilities.

- **Current Schema Version**: 1.2.0
- **Version Tracking Table**: `schema_version`
- **Migration Support**: Automatic upgrades from previous versions

## Tables

### 1. schema_version
**Purpose**: Track database schema version for migrations

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| version | NVARCHAR(20) | PRIMARY KEY | Schema version string (e.g., "1.2.0") |
| applied_at | DATETIME | NOT NULL | When this version was applied |
| description | NVARCHAR(255) | NULL | Description of changes in this version |

**Indexes**:
- Primary key on `version`

### 2. RIBS_devices
**Purpose**: Store registered device information and nicknames

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | NVARCHAR(100) | PRIMARY KEY | Unique device identifier (UUID) |
| registered_at | DATETIME | NOT NULL | When the device was first registered |
| nickname | NVARCHAR(100) | NULL | User-friendly name for the device |

**Indexes**:
- Primary key on `id`

**Relationships**:
- Referenced by `RIBS_Data.device_id`

### 3. RIBS_logs
**Purpose**: Store application logs from all sources (server, frontend, API, etc.)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INT IDENTITY(1,1) | PRIMARY KEY | Auto-incrementing log entry ID |
| message | NVARCHAR(MAX) | NOT NULL | The log message content |
| log_time | DATETIME | NOT NULL | Timestamp when the log was created |
| level | NVARCHAR(20) | DEFAULT 'INFO' | Log level (INFO, WARN, ERROR, DEBUG) |
| source | NVARCHAR(100) | NULL | Source of the log (SERVER, API, DATABASE, FRONTEND, etc.) |

**Indexes**:
- Primary key on `id`
- `IX_logs_time_level` on `(log_time DESC, level)` for efficient querying

**Notes**:
- Includes automatic cleanup to prevent unlimited growth
- Keeps only the latest 1000 log entries

### 4. RIBS_Data
**Purpose**: Store roughness measurement data collected from devices

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INT IDENTITY(1,1) | PRIMARY KEY | Auto-incrementing measurement ID |
| timestamp | NVARCHAR(50) | NOT NULL | ISO timestamp of the measurement |
| latitude | FLOAT | NOT NULL | GPS latitude coordinate |
| longitude | FLOAT | NOT NULL | GPS longitude coordinate |
| speed | FLOAT | NOT NULL | Instantaneous speed at measurement time (m/s) |
| direction | FLOAT | NOT NULL | Heading/direction of travel (degrees) |
| roughness | FLOAT | NOT NULL | Calculated roughness index (RMS acceleration) |
| distance_m | FLOAT | NOT NULL | Total distance traveled by device (meters) |
| device_id | NVARCHAR(100) | NOT NULL | Reference to RIBS_devices.id |
| ip_address | NVARCHAR(45) | NOT NULL | IP address of the uploading client |
| z_values | NVARCHAR(MAX) | NOT NULL | JSON array of raw Z-axis acceleration values |
| avg_speed | FLOAT | NOT NULL | Average speed during measurement window (m/s) |
| interval_s | FLOAT | NOT NULL | Duration of measurement window (seconds) |
| algorithm_version | NVARCHAR(50) | NOT NULL | Version of processing algorithm used |
| vdv | FLOAT | NULL | Vibration Dose Value (4th power method) - Added in v1.2.0 |
| crest_factor | FLOAT | NULL | Peak-to-RMS ratio - Added in v1.2.0 |

**Indexes**:
- Primary key on `id`
- `IX_ribs_device_time` on `(device_id, timestamp)` for device-specific queries
- `IX_ribs_location` on `(latitude, longitude)` for spatial queries

**Relationships**:
- `device_id` references `RIBS_devices.id`

## Schema Version History

### Version 1.0.0 (Initial)
- Created basic tables: `RIBS_devices`, `RIBS_logs`, `RIBS_Data`
- Basic primary key constraints

### Version 1.1.0
- Added performance indexes to `RIBS_Data` table:
  - `IX_ribs_device_time` for device-specific queries
  - `IX_ribs_location` for spatial queries
- Added `IX_logs_time_level` index to `RIBS_logs` table

### Version 1.2.0 (Current)
- Added new measurement columns to `RIBS_Data`:
  - `vdv` (FLOAT, NULL): Vibration Dose Value calculation
  - `crest_factor` (FLOAT, NULL): Peak-to-RMS ratio calculation
- Enhanced measurement data quality and analysis capabilities

## Migration Process

The database automatically applies schema migrations on startup:

1. **Version Detection**: Check current schema version from `schema_version` table
2. **Migration Check**: Compare with target version (`CURRENT_SCHEMA_VERSION`)
3. **Sequential Upgrades**: Apply migrations in order (1.0.0 → 1.1.0 → 1.2.0)
4. **Version Recording**: Record each successful migration with timestamp

## Performance Considerations

-### Indexes
- All tables have appropriate indexes for common query patterns
- `RIBS_logs` table includes time-based index for efficient log retrieval
- `RIBS_Data` table includes spatial and device-specific indexes

### Cleanup
- Automatic log cleanup keeps only the latest 1000 entries
- Prevents unlimited database growth from logging

### Connection Management
- Uses connection pooling for efficient database access
- Configurable timeout and retry settings

## API Compatibility

The schema is designed to support the following API endpoints:

- `GET /api/device/:id` - Device information lookup
- `GET /api/devices` - List all registered devices
- `POST /api/register` - Device registration
- `POST /api/upload` - Measurement data upload
- `GET /api/logs` - Log retrieval with filtering
- `GET /api/logs/stats` - Log statistics
- `POST /api/logs` - Frontend log submission
- `GET /api/rci-data` - Measurement data retrieval for mapping

## Future Considerations

For future schema versions, consider:

1. **Partitioning**: For very large `RIBS_Data` tables, consider date-based partitioning
2. **Archiving**: Long-term storage strategy for historical measurement data
3. **Spatial Indexing**: Geographic indexing for advanced location-based queries
4. **Real-time Analytics**: Tables for aggregated statistics and reporting
