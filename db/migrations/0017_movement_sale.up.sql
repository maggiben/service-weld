-- Sell cylinders from Nueva Entrega: add SALE to movement_kind.
-- A sale posts a movement_event (state SOLD) and marks the cylinder SOLD.
-- SALE pairs with OURS ownership, so ck_move_kind_basis
-- ((movement_kind='REFILL') = (property_basis='CUSTOMER')) still holds unchanged.

ALTER TYPE movement_kind ADD VALUE IF NOT EXISTS 'SALE';
