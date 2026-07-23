-- Down: remove long_outstanding_days setting (local rollback only).

DELETE FROM system_setting
WHERE key = 'long_outstanding_days';
