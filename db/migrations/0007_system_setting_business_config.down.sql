-- Down: remove business config keys (local rollback only).

DELETE FROM system_setting
WHERE key IN ('business_timezone', 'rental_min_days', 'primary_language');
